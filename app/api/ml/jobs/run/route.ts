import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"
import { randomUUID } from "crypto"

export const maxDuration = 60

// Backoff por número de intento: 30s, 2m, 5m, 10m, 30m
const BACKOFF_SECONDS = [30, 120, 300, 600, 1800]
const MAX_ATTEMPTS    = 5

// ML constants
const ML_API          = "https://api.mercadolibre.com"
const ML_SCAN_PAGE_SIZE   = 50
const ML_MULTIGET_MAX_IDS = 50
const ML_ATTRIBUTES       = "id,title,price,available_quantity,sold_quantity,status,permalink,thumbnail,listing_type_id,attributes,seller_custom_field"

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries = 3,
): Promise<{ res: Response | null; rateLimited: boolean; retryAfter: number }> {
  let attempt = 0
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) })
      if (res.status === 429) {
        return { res, rateLimited: true, retryAfter: parseInt(res.headers.get("retry-after") || "60") }
      }
      if (res.status >= 500 && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
        attempt++
        continue
      }
      return { res, rateLimited: false, retryAfter: 0 }
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
        attempt++
        continue
      }
      return { res: null, rateLimited: false, retryAfter: 0 }
    }
  }
  return { res: null, rateLimited: false, retryAfter: 0 }
}

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      try { results[i] = { status: "fulfilled", value: await tasks[i]() } }
      catch (e: any) { results[i] = { status: "rejected", reason: e } }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

// ── Rate-limit token bucket ───────────────────────────────────────────────────

/**
 * Consume `cost` tokens from the per-account bucket stored in ml_rate_limits.
 * Window resets every 60 s.  If the bucket would overflow, wait until the
 * window resets (max ~60 s) and retry once.
 */
async function consumeRateLimit(
  supabase: any,
  accountId: string,
  cost = 1,
): Promise<void> {
  const WINDOW_MS = 60_000
  const LIMIT     = 500   // conservative: ML allows ~600 req/min per app

  const now        = new Date()
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS).toISOString()

  // Upsert bucket row
  const { data: row } = await supabase
    .from("ml_rate_limits")
    .select("tokens_used, window_start, tokens_limit")
    .eq("account_id", accountId)
    .maybeSingle()

  const sameWindow = row && row.window_start === windowStart
  const used       = sameWindow ? (row.tokens_used ?? 0) : 0

  if (used + cost > LIMIT) {
    // Wait until the next window
    const windowEnd = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS + WINDOW_MS)
    const waitMs    = Math.max(0, windowEnd.getTime() - Date.now()) + 100
    await new Promise((r) => setTimeout(r, waitMs))
  }

  // Record usage
  await supabase.from("ml_rate_limits").upsert(
    {
      account_id:   accountId,
      window_start: windowStart,
      tokens_used:  used + cost,
      tokens_limit: LIMIT,
      updated_at:   new Date().toISOString(),
    },
    { onConflict: "account_id" },
  )
}

// ── Shared ML fetch with rate-limit + retry ───────────────────────────────────

async function mlFetch(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any; rateLimited: boolean; retryAfter: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  }

  let attempt = 0
  while (attempt < 3) {
    const res = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(15_000) })

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10)
      return { ok: false, status: 429, data: null, rateLimited: true, retryAfter }
    }
    if (res.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
      attempt++
      continue
    }

    let data: any = null
    try { data = await res.json() } catch { /* no-op */ }

    return { ok: res.ok, status: res.status, data, rateLimited: false, retryAfter: 0 }
  }

  return { ok: false, status: 0, data: null, rateLimited: false, retryAfter: 0 }
}

// ── Job log helper ────────────────────────────────────────────────────────────

async function jobLog(
  supabase: any,
  jobId: string,
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) {
  await supabase.from("ml_job_logs").insert({
    job_id:  jobId,
    level,
    message,
    meta:    meta ?? {},
  })
}

// ── Handlers por tipo de job ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// catalog_index
// Payload: { batch_size?: number, offset?: number, force?: boolean }
// Resolves catalog_product_id for publications that have ISBN/EAN/GTIN.
// ─────────────────────────────────────────────────────────────────────────────
async function executeCatalogIndex(job: any, supabase: any): Promise<Record<string, unknown>> {
  const { account_id, payload = {} } = job
  const batchSize = Math.min(Number(payload.batch_size ?? 30), 50)
  const offset    = Number(payload.offset ?? 0)
  const force     = Boolean(payload.force ?? false)

  const token = await getValidAccessToken(account_id)

  // Fetch publications with identifiers
  let q = supabase
    .from("ml_publications")
    .select("id, ml_item_id, isbn, ean, gtin")
    .eq("account_id", account_id)
    .or("isbn.not.is.null,ean.not.is.null,gtin.not.is.null")
    .order("updated_at", { ascending: false })
    .range(offset, offset + batchSize - 1)

  if (!force) q = q.is("catalog_product_id", null)

  const { data: pubs, error } = await q
  if (error) throw error
  if (!pubs || pubs.length === 0) return { done: true, has_more: false, processed: 0, offset }

  let matched = 0, not_found = 0, ambiguous = 0, errors = 0

  for (const pub of pubs) {
    const identifier = pub.isbn || pub.ean || pub.gtin
    if (!identifier) continue

    try {
      await consumeRateLimit(supabase, account_id)
      const url = `${ML_API}/products/search?status=active&q=${encodeURIComponent(identifier)}&limit=3`
      const { ok, data, rateLimited, retryAfter } = await mlFetch(url, token)

      if (rateLimited) {
        await jobLog(supabase, job.id, "warn", `Rate limited, retry-after ${retryAfter}s`, { identifier })
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 60) * 1000))
        continue
      }

      if (!ok || !data) { errors++; continue }

      const results: any[] = data.results ?? []
      const catalogProductId = results.length === 1 ? results[0].id : null
      const isEligible       = catalogProductId !== null

      await supabase.from("ml_publications").update({
        catalog_product_id:      catalogProductId,
        catalog_listing_eligible: isEligible,
        updated_at:              new Date().toISOString(),
      }).eq("id", pub.id)

      if (isEligible)              matched++
      else if (results.length === 0) not_found++
      else                           ambiguous++

      // Minimum inter-request delay
      await new Promise((r) => setTimeout(r, 100))
    } catch (e: any) {
      errors++
      await jobLog(supabase, job.id, "error", `Error indexing ${pub.ml_item_id}: ${e.message}`)
    }
  }

  const nextOffset = offset + pubs.length
  const hasMore    = pubs.length === batchSize

  await jobLog(supabase, job.id, "info", "catalog_index batch completed", {
    processed: pubs.length, matched, not_found, ambiguous, errors,
    has_more: hasMore, next_offset: nextOffset,
  })

  return { processed: pubs.length, matched, not_found, ambiguous, errors, has_more: hasMore, next_offset: nextOffset }
}

// ─────────────────────────────────────────────────────────────────────────────
// catalog_optin
// Payload: { ml_item_id: string, catalog_product_id: string }
// Opts the item into the ML catalog via PUT /items/{id}.
// ─────────────────────────────────────────────────────────────────────────────
async function executeCatalogOptIn(job: any, supabase: any): Promise<Record<string, unknown>> {
  const { account_id, payload } = job
  const { ml_item_id, catalog_product_id } = payload as { ml_item_id: string; catalog_product_id: string }

  if (!ml_item_id || !catalog_product_id) {
    throw new Error("catalog_optin requiere ml_item_id y catalog_product_id en payload")
  }

  const token = await getValidAccessToken(account_id)

  // Track in ml_catalog_job_items if a catalog job context is provided
  const catalogJobId = payload.catalog_job_id as string | undefined
  if (catalogJobId) {
    await supabase.from("ml_catalog_job_items").upsert({
      job_id:            catalogJobId,
      old_item_id:       ml_item_id,
      catalog_product_id,
      action:            "optin",
      status:            "running",
    }, { onConflict: "job_id,old_item_id" })
  }

  await consumeRateLimit(supabase, account_id)

  const { ok, status, data, rateLimited, retryAfter } = await mlFetch(
    `${ML_API}/items/${ml_item_id}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({ catalog_product_id }),
    },
  )

  if (rateLimited) {
    throw new Error(`Rate limited — retry after ${retryAfter}s`)
  }

  if (!ok) {
    const errMsg = data?.message ?? data?.error ?? `HTTP ${status}`
    if (catalogJobId) {
      await supabase.from("ml_catalog_job_items")
        .update({ status: "error", error: errMsg })
        .match({ job_id: catalogJobId, old_item_id: ml_item_id })
    }
    throw new Error(`ML opt-in failed for ${ml_item_id}: ${errMsg}`)
  }

  // Update local record
  await supabase.from("ml_publications")
    .update({
      catalog_product_id,
      catalog_listing_eligible: true,
      updated_at: new Date().toISOString(),
    })
    .match({ account_id, ml_item_id })

  if (catalogJobId) {
    await supabase.from("ml_catalog_job_items")
      .update({ status: "success", new_item_id: data?.id ?? ml_item_id })
      .match({ job_id: catalogJobId, old_item_id: ml_item_id })

    // Increment success counter on parent job
    await supabase.rpc("increment_catalog_job_success", { _job_id: catalogJobId }).catch(() => {/* ignore if RPC doesn't exist */})
  }

  await jobLog(supabase, job.id, "info", `catalog_optin OK: ${ml_item_id} → ${catalog_product_id}`, { status })

  return { ml_item_id, catalog_product_id, status: "success", ml_response_status: status }
}

// ─────────────────────────────────────────────────────────────────────────────
// buybox_sync
// Payload: { ml_item_id?: string, account_id?: string, batch_size?: number }
// Fetches the catalog buybox price from ML and updates price_to_win.
// ─────────────────────────────────────────────────────────────────────────────
async function executeBuyboxSync(job: any, supabase: any): Promise<Record<string, unknown>> {
  const { account_id, payload = {} } = job
  const specificItemId = payload.ml_item_id as string | undefined
  const batchSize      = Math.min(Number(payload.batch_size ?? 20), 50)

  const token = await getValidAccessToken(account_id)

  // Determine which items to sync
  let itemIds: string[]

  if (specificItemId) {
    itemIds = [specificItemId]
  } else {
    // Sync items that are catalog-eligible and haven't been synced recently
    const { data: pubs } = await supabase
      .from("ml_publications")
      .select("ml_item_id")
      .eq("account_id", account_id)
      .eq("catalog_listing_eligible", true)
      .eq("status", "active")
      .not("catalog_product_id", "is", null)
      .order("health_checked_at", { ascending: true, nullsFirst: true })
      .limit(batchSize)

    itemIds = (pubs ?? []).map((p: any) => p.ml_item_id)
  }

  if (itemIds.length === 0) {
    return { synced: 0, errors: 0, message: "No hay items elegibles para sincronizar" }
  }

  let synced = 0, errors = 0

  // Process in chunks of ML_MULTIGET_MAX_IDS
  const chunks: string[][] = []
  for (let i = 0; i < itemIds.length; i += ML_MULTIGET_MAX_IDS) {
    chunks.push(itemIds.slice(i, i + ML_MULTIGET_MAX_IDS))
  }

  for (const chunk of chunks) {
    await consumeRateLimit(supabase, account_id, chunk.length)

    const url = `${ML_API}/items?ids=${chunk.join(",")}&attributes=id,price,status,catalog_listing,health`
    const { ok, data, rateLimited, retryAfter } = await mlFetch(url, token)

    if (rateLimited) {
      await jobLog(supabase, job.id, "warn", `Rate limited, pausing ${retryAfter}s`)
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 60) * 1000))
      continue
    }

    if (!ok || !Array.isArray(data)) { errors += chunk.length; continue }

    for (const entry of data) {
      if (entry.code !== 200) { errors++; continue }
      const item = entry.body

      // price_to_win: the buybox price we need to match or beat
      // ML returns the catalog buybox price via item.health.catalog_data or just item.price
      const priceToWin = item.health?.catalog_data?.min_price ?? item.price ?? null

      const { error: upErr } = await supabase
        .from("ml_publications")
        .update({
          price_to_win:      priceToWin,
          is_competing:      item.catalog_listing === true,
          health_checked_at: new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        })
        .match({ account_id, ml_item_id: item.id })

      if (upErr) { errors++; continue }
      synced++
    }

    await new Promise((r) => setTimeout(r, 80))
  }

  await jobLog(supabase, job.id, "info", "buybox_sync completed", { synced, errors, item_count: itemIds.length })

  return { synced, errors, item_count: itemIds.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// import_single_item
// Payload: { ml_item_id: string }
// Fetches a single item from the ML API and upserts it into ml_publications.
// ─────────────────────────────────────────────────────────────────────────────
async function executeImportSingle(job: any, supabase: any): Promise<Record<string, unknown>> {
  const { account_id, payload } = job
  const ml_item_id = payload?.ml_item_id as string | undefined

  if (!ml_item_id) throw new Error("import_single_item requiere ml_item_id en payload")

  const token = await getValidAccessToken(account_id)

  await consumeRateLimit(supabase, account_id)

  const fullAttributes = [
    "id", "title", "price", "available_quantity", "sold_quantity", "status",
    "permalink", "thumbnail", "listing_type_id", "attributes",
    "seller_custom_field", "catalog_listing", "catalog_product_id", "health",
  ].join(",")

  const { ok, status, data, rateLimited, retryAfter } = await mlFetch(
    `${ML_API}/items/${ml_item_id}?attributes=${fullAttributes}`,
    token,
  )

  if (rateLimited) throw new Error(`Rate limited — retry after ${retryAfter}s`)
  if (!ok || !data) throw new Error(`ML GET /items/${ml_item_id} falló: HTTP ${status}`)

  const item = data

  // Extract identifiers from attributes
  const attrs: any[] = item.attributes ?? []
  const findAttr     = (ids: string[]) =>
    attrs.find((a: any) => ids.includes(a.id))?.value_name ?? null

  const isbn = findAttr(["ISBN"])
  const ean  = findAttr(["EAN", "GTIN"])
  const sku  = item.seller_custom_field
    ?? attrs.find((a: any) => ["SELLER_SKU", "SKU"].includes(a.id))?.value_name
    ?? null

  const row = {
    account_id,
    ml_item_id:              item.id,
    title:                   item.title,
    price:                   item.price,
    current_stock:           item.available_quantity,
    status:                  item.status,
    permalink:               item.permalink,
    sku,
    isbn,
    ean,
    catalog_listing_eligible: item.catalog_listing ?? false,
    catalog_product_id:      item.catalog_product_id ?? null,
    updated_at:              new Date().toISOString(),
  }

  const { error: upsertErr } = await supabase
    .from("ml_publications")
    .upsert(row, { onConflict: "account_id,ml_item_id", ignoreDuplicates: false })

  if (upsertErr) throw upsertErr

  // Update ml_import_queue entry if present
  await supabase
    .from("ml_import_queue")
    .update({ status: "processed", processed_at: new Date().toISOString() })
    .eq("ml_item_id", ml_item_id)
    .eq("status", "claimed")

  await jobLog(supabase, job.id, "info", `import_single OK: ${ml_item_id}`, {
    title: item.title, price: item.price, status: item.status,
  })

  return { ml_item_id, title: item.title, status: item.status, price: item.price }
}

async function handleImportPublications(
  job: any,
  supabase: any,
  instanceId: string,
): Promise<{ imported_count: number; has_more: boolean; rate_limited: boolean; error?: string }> {
  const { account_id, payload } = job
  const max_seconds = payload.max_seconds ?? 50
  const detail_batch = Math.min(50, Math.max(1, payload.detail_batch ?? 50))
  const concurrency  = payload.concurrency ?? 2
  const startTime    = Date.now()

  const { data: account } = await supabase
    .from("ml_accounts").select("*").eq("id", account_id).maybeSingle()
  if (!account) return { imported_count: 0, has_more: false, rate_limited: false, error: "Account not found" }

  const { data: progress } = await supabase
    .from("ml_import_progress").select("*").eq("account_id", account_id).single()
  if (!progress) return { imported_count: 0, has_more: false, rate_limited: false, error: "Progress not found. Initialize import first." }

  // Desbloquear si pasó la pausa
  if (progress.status === "paused" && progress.paused_until && new Date(progress.paused_until) > new Date()) {
    const wait = Math.ceil((new Date(progress.paused_until).getTime() - Date.now()) / 1000)
    return { imported_count: 0, has_more: true, rate_limited: true, error: `Rate limited, resume in ${wait}s` }
  }

  await supabase.from("ml_import_progress")
    .update({ status: "running", last_run_at: new Date().toISOString(), last_error: null })
    .eq("account_id", account_id)

  const accessToken = await getValidAccessToken(account_id)
  const authHeader  = { Authorization: `Bearer ${accessToken}` }
  const scope       = progress.publications_scope || "all"

  let importedCount = 0
  let errorsCount   = 0
  let rateLimited   = false
  let hasMore       = true

  while (Date.now() - startTime < max_seconds * 1000) {
    const { data: cur } = await supabase
      .from("ml_import_progress")
      .select("scroll_id, publications_offset, publications_total")
      .eq("account_id", account_id).single()
    if (!cur) break

    const scrollId = cur.scroll_id as string | null

    const searchUrl = scrollId
      ? `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&scroll_id=${scrollId}`
      : `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&limit=${ML_SCAN_PAGE_SIZE}${scope === "active_only" ? "&status=active" : ""}`

    const { res: searchRes, rateLimited: rl, retryAfter } = await fetchWithRetry(searchUrl, authHeader)
    if (rl) {
      const pausedUntil = new Date(Date.now() + retryAfter * 1000).toISOString()
      await supabase.from("ml_import_progress")
        .update({ status: "paused", paused_until: pausedUntil })
        .eq("account_id", account_id)
      rateLimited = true
      break
    }
    if (!searchRes || !searchRes.ok) { errorsCount++; break }

    const searchData  = await searchRes.json()
    const itemIds: string[] = searchData.results || []
    const newScrollId = searchData.scroll_id || null
    const totalFromApi = searchData.paging?.total || 0

    if (itemIds.length === 0) {
      hasMore = false
      await supabase.from("ml_import_progress")
        .update({ status: "done", scroll_id: null }).eq("account_id", account_id)
      break
    }

    if (newScrollId && newScrollId !== scrollId) {
      await supabase.from("ml_import_progress")
        .update({ scroll_id: newScrollId }).eq("account_id", account_id)
    }
    if (!cur.publications_total && totalFromApi > 0) {
      await supabase.from("ml_import_progress")
        .update({ publications_total: totalFromApi }).eq("account_id", account_id)
    }

    // Multiget en chunks de detail_batch con pool de concurrencia
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += detail_batch) {
      chunks.push(itemIds.slice(i, i + detail_batch))
    }

    const detailTasks = chunks.map(chunk => async () => {
      const url = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=${ML_ATTRIBUTES}`
      const { res } = await fetchWithRetry(url, authHeader)
      if (!res || !res.ok) return []
      const data = await res.json()
      return Array.isArray(data)
        ? data.filter((r: any) => r.code === 200).map((r: any) => r.body)
        : []
    })

    const poolResults = await runPool(detailTasks, concurrency)
    const allItems = poolResults
      .filter(r => r.status === "fulfilled")
      .flatMap(r => (r as PromiseFulfilledResult<any[]>).value)

    if (allItems.length > 0) {
      const rows = allItems.map((item: any) => {
        const isbn = item.attributes?.find((a: any) => a.id === "ISBN")?.value_name
        return {
          account_id,
          ml_item_id:          item.id,
          title:               item.title,
          price:               item.price,
          available_quantity:  item.available_quantity,
          sold_quantity:       item.sold_quantity,
          status:              item.status,
          permalink:           item.permalink,
          thumbnail:           item.thumbnail,
          listing_type_id:     item.listing_type_id,
          isbn:                isbn || null,
          raw_attributes:      item.attributes || [],
          updated_at:          new Date().toISOString(),
        }
      })

      await supabase.from("ml_publications").upsert(rows, {
        onConflict:        "account_id,ml_item_id",
        ignoreDuplicates:  false,
      })

      importedCount += allItems.length
    }

    await supabase.from("ml_import_progress")
      .update({
        publications_offset: (cur.publications_offset || 0) + itemIds.length,
        publications_progress: cur.publications_total
          ? Math.min(100, ((cur.publications_offset + itemIds.length) / cur.publications_total) * 100)
          : null,
      })
      .eq("account_id", account_id)
  }

  if (!rateLimited && hasMore) {
    await supabase.from("ml_import_progress")
      .update({ status: "idle" }).eq("account_id", account_id)
  }

  return { imported_count: importedCount, has_more: hasMore, rate_limited: rateLimited }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

async function executeJob(job: any, supabase: any, instanceId: string) {
  switch (job.type) {
    case "import_publications":
      return handleImportPublications(job, supabase, instanceId)
    case "catalog_index":
      return executeCatalogIndex(job, supabase)
    case "catalog_optin":
      return executeCatalogOptIn(job, supabase)
    case "buybox_sync":
      return executeBuyboxSync(job, supabase)
    case "import_single_item":
      return executeImportSingle(job, supabase)
    default:
      throw new Error(`Tipo de job no implementado: ${job.type}`)
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/ml/jobs/run
 *
 * Body: {
 *   limit?:       number   default 5  — jobs a procesar en este tick
 *   account_id?:  string   — filtrar por cuenta
 * }
 *
 * Response: {
 *   ok: boolean
 *   processed: number
 *   results: { job_id, type, status, imported_count?, error? }[]
 * }
 */
export async function POST(request: NextRequest) {
  const authError = await protectAPI(request)
  if (authError) return authError

  const instanceId = randomUUID()
  const body       = await request.json().catch(() => ({}))
  const limit      = Math.min(50, Math.max(1, body.limit ?? 5))
  const accountId  = body.account_id ?? null

  const supabase = await createClient({ useServiceRole: true })

  // ── 1. Claim jobs (lock atómico) ─────────────────────────────────────────
  const query = supabase
    .from("ml_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .order("run_after", { ascending: true })
    .limit(limit)

  if (accountId) query.eq("account_id", accountId)

  const { data: jobs, error: fetchError } = await query

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [], message: "No hay jobs en cola" })
  }

  // Marcar como running (lock pesimista simple: primera escritura gana)
  const jobIds = jobs.map((j: any) => j.id)
  await supabase
    .from("ml_jobs")
    .update({ status: "running", locked_at: new Date().toISOString(), locked_by: instanceId })
    .in("id", jobIds)
    .eq("status", "queued")   // solo los que siguen queued (evita doble-proceso)

  // Verificar cuáles realmente obtuvimos el lock
  const { data: locked } = await supabase
    .from("ml_jobs")
    .select("*")
    .in("id", jobIds)
    .eq("locked_by", instanceId)
    .eq("status", "running")

  if (!locked || locked.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [], message: "Jobs tomados por otro worker" })
  }

  // ── 2. Ejecutar jobs ─────────────────────────────────────────────────────
  const results: any[] = []

  for (const job of locked) {
    const jobStart = Date.now()
    try {
      const result = await executeJob(job, supabase, instanceId)

      await supabase.from("ml_jobs").update({
        status:     "success",
        locked_at:  null,
        locked_by:  null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id)

      // Log de éxito
      await supabase.from("ml_job_logs").insert({
        job_id:  job.id,
        level:   "info",
        message: "Job completado exitosamente",
        meta:    { ...result, elapsed_ms: Date.now() - jobStart },
      })

      results.push({ job_id: job.id, type: job.type, status: "success", ...result })

    } catch (err: any) {
      const attempts  = (job.attempts || 0) + 1
      const backoff   = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
      const runAfter  = new Date(Date.now() + backoff * 1000).toISOString()
      const newStatus = attempts >= MAX_ATTEMPTS ? "error" : "queued"

      await supabase.from("ml_jobs").update({
        status:     newStatus,
        attempts,
        last_error: err.message,
        run_after:  newStatus === "queued" ? runAfter : undefined,
        locked_at:  null,
        locked_by:  null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id)

      // Log de error
      await supabase.from("ml_job_logs").insert({
        job_id:  job.id,
        level:   "error",
        message: err.message,
        meta:    { attempts, backoff_seconds: backoff, elapsed_ms: Date.now() - jobStart },
      })

      results.push({ job_id: job.id, type: job.type, status: newStatus, error: err.message, attempts })
    }
  }

  return NextResponse.json({ ok: true, processed: locked.length, results })
}
