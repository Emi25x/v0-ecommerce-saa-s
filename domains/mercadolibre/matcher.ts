/**
 * ML Matcher Logic
 *
 * Extracted from app/api/ml/matcher/run/route.ts
 * Matches ml_publications to products by EAN/ISBN/SKU.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize identifier: strip whitespace/dashes, lowercase */
export function norm(s: string): string {
  return s
    .replace(/[\s\-\t\r\n]/g, "")
    .toLowerCase()
    .trim()
}

/** Add val to arr only if not already present */
function addUnique(arr: string[], val: string) {
  if (!arr.includes(val)) arr.push(val)
}

function addToIndex(index: Map<string, string[]>, key: string, id: string) {
  if (!index.has(key)) index.set(key, [])
  index.get(key)!.push(id)
}

/** Extract numeric EANs and ISBNs from a publication title */
export function extractFromTitle(title: string): { eans: string[]; isbns: string[] } {
  const eans: string[] = []
  const isbns: string[] = []
  const tokens = title.match(/\b\d{10,13}\b/g) ?? []
  for (const t of tokens) {
    const n = norm(t)
    if (n.length === 13) eans.push(n)
    else if (n.length === 10) isbns.push(n)
    else if (n.length === 12) eans.push(n)
  }
  return { eans, isbns }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MatcherParams {
  account_id: string
  max_seconds?: number
  batch_size?: number
  reset?: boolean
}

export interface MatcherResult {
  ok: boolean
  status: string
  reason?: string
  processed: number
  matched: number
  ambiguous: number
  not_found: number
  invalid: number
  total_processed: number
  is_complete: boolean
  cursor_last_id: string | null
  elapsed_seconds: string
  metrics: Record<string, number>
  sample_unmatched?: any[]
  warnings: string[]
  error?: string
}

// ── Main logic ───────────────────────────────────────────────────────────────

/**
 * Run one batch of the matcher. Uses cursor-based pagination to avoid drift.
 * @param supabase - Admin supabase client
 * @param adminClient - Admin client for cross-user product queries
 */
export async function runMatcherBatch(supabase: any, adminClient: any, params: MatcherParams): Promise<MatcherResult> {
  const t0 = Date.now()
  const { account_id: accountId, max_seconds = 12, batch_size = 200, reset } = params
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(2)

  // 1) Get or initialize progress
  let { data: progress } = await supabase
    .from("ml_matcher_progress")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle()

  const cursorLastId: string | null = (progress?.cursor as any)?.last_id ?? null
  const resetRun = reset === true || progress?.status === "completed" || progress?.status === "failed"

  // 2) Count remaining candidates
  let totalCountQuery = supabase
    .from("ml_publications")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .is("product_id", null)
  if (!resetRun && cursorLastId) totalCountQuery = totalCountQuery.gt("id", cursorLastId)
  const { count: remainingCandidates } = await totalCountQuery

  if ((remainingCandidates ?? 0) === 0 && !resetRun) {
    await supabase.from("ml_matcher_progress").upsert(
      {
        account_id: accountId,
        status: "completed",
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    )

    return {
      ok: true,
      status: "no_work",
      reason: "no_candidates",
      processed: 0,
      matched: 0,
      ambiguous: 0,
      not_found: 0,
      invalid: 0,
      total_processed: progress?.processed_count || 0,
      is_complete: true,
      cursor_last_id: cursorLastId,
      elapsed_seconds: elapsed(),
      metrics: {},
      warnings: [],
    }
  }

  // 3) Initialize / reset progress
  if (!progress) {
    await supabase.from("ml_matcher_progress").insert({
      account_id: accountId,
      status: "idle",
      total_target: remainingCandidates ?? 0,
      processed_count: 0,
      matched_count: 0,
      ambiguous_count: 0,
      not_found_count: 0,
      invalid_identifier_count: 0,
      error_count: 0,
      cursor: null,
    })
    const { data: fresh } = await supabase.from("ml_matcher_progress").select("*").eq("account_id", accountId).single()
    progress = fresh
  } else if (resetRun) {
    await supabase
      .from("ml_matcher_progress")
      .update({
        status: "idle",
        total_target: remainingCandidates ?? 0,
        processed_count: 0,
        matched_count: 0,
        ambiguous_count: 0,
        not_found_count: 0,
        invalid_identifier_count: 0,
        error_count: 0,
        last_error: null,
        started_at: null,
        finished_at: null,
        cursor: null,
      })
      .eq("account_id", accountId)
    const { data: fresh } = await supabase.from("ml_matcher_progress").select("*").eq("account_id", accountId).single()
    progress = fresh
  }

  // 4) Concurrency: heartbeat check
  if (progress!.status === "running") {
    const sinceHeartbeat = (Date.now() - new Date(progress!.last_heartbeat_at ?? 0).getTime()) / 1000
    if (sinceHeartbeat < 60) {
      return {
        ok: false,
        status: "busy",
        reason: "another_running",
        processed: 0,
        matched: 0,
        ambiguous: 0,
        not_found: 0,
        invalid: 0,
        total_processed: progress!.processed_count || 0,
        is_complete: false,
        cursor_last_id: cursorLastId,
        elapsed_seconds: elapsed(),
        metrics: {},
        warnings: [],
      }
    }
  }

  // 5) Mark as running
  await supabase
    .from("ml_matcher_progress")
    .update({
      status: "running",
      started_at: progress!.started_at || new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)

  // 6) Capture fixed ID list with stable cursor
  const effectiveCursor = resetRun ? null : cursorLastId
  let candidateQuery = supabase
    .from("ml_publications")
    .select("id")
    .eq("account_id", accountId)
    .is("product_id", null)
    .order("id", { ascending: true })
    .limit(batch_size)
  if (effectiveCursor) candidateQuery = candidateQuery.gt("id", effectiveCursor)

  const { data: candidateRows } = await candidateQuery

  if (!candidateRows || candidateRows.length === 0) {
    await supabase
      .from("ml_matcher_progress")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("account_id", accountId)

    return {
      ok: true,
      status: "no_work",
      reason: "no_candidates_after_cursor",
      processed: 0,
      matched: 0,
      ambiguous: 0,
      not_found: 0,
      invalid: 0,
      total_processed: progress!.processed_count || 0,
      is_complete: true,
      cursor_last_id: effectiveCursor,
      elapsed_seconds: elapsed(),
      metrics: {},
      warnings: [],
    }
  }

  const candidateIds = candidateRows.map((r: any) => r.id)
  const newCursorLastId = candidateIds[candidateIds.length - 1]

  // 7) Fetch pub details
  const { data: pubs } = await supabase
    .from("ml_publications")
    .select("id, ml_item_id, title, ean, gtin, isbn, sku")
    .in("id", candidateIds)
    .is("product_id", null)

  // 8) Query matching products
  const eanSet = new Set<string>()
  for (const pub of pubs ?? []) {
    if (pub.ean) {
      const k = norm(pub.ean)
      if (k) eanSet.add(k)
    }
    if (pub.gtin) {
      const k = norm(pub.gtin)
      if (k) eanSet.add(k)
    }
    if (pub.isbn) {
      const k = norm(pub.isbn)
      if (k) eanSet.add(k)
    }
    if (pub.sku && /^\d{10,13}$/.test((pub.sku ?? "").trim())) {
      const k = norm(pub.sku)
      if (k) eanSet.add(k)
    }
  }

  const eanList = [...eanSet]
  let allProducts: Array<{ id: string; ean: string | null; isbn: string | null; sku: string | null }> = []
  if (eanList.length > 0) {
    const { data, error: productsError } = await adminClient
      .from("products")
      .select("id, ean, isbn, sku")
      .in("ean", eanList)
    if (productsError) {
      return {
        ok: false,
        status: "error",
        error: "products_query_failed",
        processed: 0,
        matched: 0,
        ambiguous: 0,
        not_found: 0,
        invalid: 0,
        total_processed: progress!.processed_count || 0,
        is_complete: false,
        cursor_last_id: effectiveCursor,
        elapsed_seconds: elapsed(),
        metrics: {},
        warnings: [],
      }
    }
    allProducts = data ?? []
  }

  let productsWithId = 0
  const eanIndex = new Map<string, string[]>()
  const isbnIndex = new Map<string, string[]>()
  const skuIndex = new Map<string, string[]>()

  for (const p of allProducts) {
    let hasAny = false
    if (p.ean) {
      const key = norm(p.ean)
      if (key) {
        hasAny = true
        addToIndex(eanIndex, key, p.id)
      }
    }
    if (p.isbn) {
      const key = norm(p.isbn)
      if (key) {
        hasAny = true
        addToIndex(isbnIndex, key, p.id)
      }
    }
    if (p.sku) {
      const key = norm(p.sku)
      if (key) {
        hasAny = true
        addToIndex(skuIndex, key, p.id)
      }
    }
    if (hasAny) productsWithId++
  }

  const productsMissingIdentifiers = allProducts.length > 0 && productsWithId === 0

  let pubsWithEan = 0,
    pubsWithIsbn = 0,
    pubsWithSku = 0
  let matched = 0,
    ambiguous = 0,
    notFound = 0,
    invalid = 0
  const batchUpdates: Array<{ id: string; product_id: string; matched_by: string }> = []

  for (const pub of pubs ?? []) {
    if (Date.now() - t0 > max_seconds * 1000) break

    const eans: string[] = []
    const isbns: string[] = []
    const skus: string[] = []

    if (pub.ean) {
      const k = norm(pub.ean)
      if (k) {
        eans.push(k)
        pubsWithEan++
      }
    }
    if (pub.gtin) {
      const k = norm(pub.gtin)
      if (k) addUnique(eans, k)
    }
    if (pub.isbn) {
      const k = norm(pub.isbn)
      if (k) {
        isbns.push(k)
        pubsWithIsbn++
        addUnique(eans, k)
      }
    }
    if (pub.sku) {
      const k = norm(pub.sku)
      if (k) {
        skus.push(k)
        pubsWithSku++
        if (/^\d{10,13}$/.test(k)) addUnique(eans, k)
      }
    }

    const fromTitle = extractFromTitle(pub.title ?? "")
    fromTitle.eans.forEach((k) => addUnique(eans, k))
    fromTitle.isbns.forEach((k) => addUnique(isbns, k))

    if (eans.length + isbns.length + skus.length === 0) {
      invalid++
      continue
    }

    // Priority: 1) EAN exact 2) ISBN exact 3) SKU exact
    let productId: string | null = null
    let matchType: string | null = null
    let totalMatches = 0

    outer: for (const [ids, index, type] of [
      [eans, eanIndex, "ean"] as const,
      [isbns, isbnIndex, "isbn"] as const,
      [skus, skuIndex, "sku"] as const,
    ]) {
      for (const key of ids) {
        const pids = index.get(key) ?? []
        if (pids.length === 1) {
          productId = pids[0]
          matchType = type
          totalMatches = 1
          break outer
        }
        if (pids.length > 1) {
          productId = pids[0]
          matchType = `${type}_dup`
          totalMatches = pids.length
          break outer
        }
      }
    }

    if (productId) {
      matched++
      batchUpdates.push({ id: pub.id, product_id: productId, matched_by: matchType! })
    } else if (totalMatches > 1) {
      ambiguous++
    } else {
      notFound++
    }
  }

  // 9) Apply updates in one batch
  if (batchUpdates.length > 0) {
    await supabase.from("ml_publications").upsert(
      batchUpdates.map((u) => ({ id: u.id, product_id: u.product_id, matched_by: u.matched_by })),
      { onConflict: "id" },
    )
  }

  // 10) Update progress with new cursor
  const actuallyProcessed = pubs?.length ?? 0
  const newProcessed = (progress!.processed_count || 0) + actuallyProcessed
  const newMatched = (progress!.matched_count || 0) + matched
  const newAmbiguous = (progress!.ambiguous_count || 0) + ambiguous
  const newNotFound = (progress!.not_found_count || 0) + notFound
  const newInvalid = (progress!.invalid_identifier_count || 0) + invalid
  const isComplete = candidateRows.length < batch_size

  await supabase
    .from("ml_matcher_progress")
    .update({
      status: isComplete ? "completed" : "idle",
      processed_count: newProcessed,
      matched_count: newMatched,
      ambiguous_count: newAmbiguous,
      not_found_count: newNotFound,
      invalid_identifier_count: newInvalid,
      cursor: isComplete ? null : { last_id: newCursorLastId },
      finished_at: isComplete ? new Date().toISOString() : null,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)

  return {
    ok: true,
    status: "success",
    processed: actuallyProcessed,
    matched,
    ambiguous,
    not_found: notFound,
    invalid,
    total_processed: newProcessed,
    is_complete: isComplete,
    cursor_last_id: isComplete ? null : newCursorLastId,
    elapsed_seconds: elapsed(),
    metrics: {
      pubs_with_ean: pubsWithEan,
      pubs_with_isbn: pubsWithIsbn,
      pubs_with_sku: pubsWithSku,
      products_loaded: allProducts?.length ?? 0,
      products_indexed: productsWithId,
      ean_index_size: eanIndex.size,
      isbn_index_size: isbnIndex.size,
      sku_index_size: skuIndex.size,
      candidates_fetched: candidateIds.length,
      remaining_before: remainingCandidates ?? 0,
    },
    sample_unmatched:
      matched === 0 && (pubs?.length ?? 0) > 0
        ? (pubs ?? []).slice(0, 3).map((pub: any) => ({
            ml_item_id: pub.ml_item_id,
            title: (pub.title ?? "").slice(0, 50),
            db: { ean: pub.ean, gtin: pub.gtin, isbn: pub.isbn, sku: pub.sku },
          }))
        : undefined,
    warnings: productsMissingIdentifiers ? ["products_missing_identifiers"] : [],
  }
}
