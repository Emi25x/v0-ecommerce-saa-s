import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"

export const maxDuration = 60

/**
 * POST /api/ml/matcher/run
 *
 * Fixes vs anterior:
 * - Usa lista fija de IDs capturada al inicio para evitar el drift de offset sobre
 *   un dataset que encoge a medida que product_id se setea (bug de "3 matches en 1719").
 * - Incluye `gtin` además de ean/isbn/sku.
 * - normalize() más robusto: strips espacios, guiones, tabs, CR, LF.
 * - Prioridad de match: EAN → ISBN → SKU (EAN primero porque es más universal).
 * - Logs de métricas al inicio y sin console.log("[v0]") de debug.
 */
export async function POST(request: Request) {
  const authCheck = await protectAPI()
  if (authCheck.error) return authCheck.response

  const t0 = Date.now()
  const body = await request.json()
  const { account_id: accountId, max_seconds = 12, batch_size = 200 } = body

  if (!accountId) {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 })
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(accountId)) {
    return NextResponse.json({ error: "invalid_account_id_format" }, { status: 400 })
  }

  const supabase = await createClient({ useServiceRole: true })

  try {
    // ── 1) Capturar lista fija de IDs de candidatos ─────────────────────────
    // CRÍTICO: seleccionar los IDs ANTES de empezar a procesar para que el conjunto
    // no cambie mientras iteramos (evita el drift de offset que causaba 3/1719 matches).
    const { data: candidateRows, count: totalCandidates } = await supabase
      .from("ml_publications")
      .select("id", { count: "exact" })
      .eq("account_id", accountId)
      .is("product_id", null)
      .order("id")          // orden estable por PK
      .limit(batch_size)

    if (!candidateRows || candidateRows.length === 0) {
      // Actualizar progreso a completed si corresponde
      await supabase.from("ml_matcher_progress")
        .upsert({
          account_id:               accountId,
          status:                   "completed",
          finished_at:              new Date().toISOString(),
          last_heartbeat_at:        new Date().toISOString(),
        }, { onConflict: "account_id" })

      return NextResponse.json({
        ok: true, status: "no_work", reason: "no_candidates",
        processed: 0, matched: 0,
        elapsed_seconds: elapsed(t0),
      })
    }

    const candidateIds = candidateRows.map(r => r.id)

    // ── 2) Obtener o inicializar progreso ───────────────────────────────────
    let { data: progress } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    if (!progress) {
      await supabase.from("ml_matcher_progress").insert({
        account_id:               accountId,
        status:                   "idle",
        total_target:             totalCandidates ?? 0,
        processed_count:          0,
        matched_count:            0,
        ambiguous_count:          0,
        not_found_count:          0,
        invalid_identifier_count: 0,
        error_count:              0,
      })
      const { data: fresh } = await supabase.from("ml_matcher_progress").select("*").eq("account_id", accountId).single()
      progress = fresh
    } else if (progress.status === "completed" || progress.status === "failed") {
      // Reinicio
      await supabase.from("ml_matcher_progress").update({
        status: "idle", total_target: totalCandidates ?? 0,
        processed_count: 0, matched_count: 0, ambiguous_count: 0,
        not_found_count: 0, invalid_identifier_count: 0, error_count: 0,
        last_error: null, started_at: null, finished_at: null,
      }).eq("account_id", accountId)
      const { data: fresh } = await supabase.from("ml_matcher_progress").select("*").eq("account_id", accountId).single()
      progress = fresh
    }

    // ── 3) Concurrencia: heartbeat check ────────────────────────────────────
    if (progress!.status === "running") {
      const sinceHeartbeat = (Date.now() - new Date(progress!.last_heartbeat_at ?? 0).getTime()) / 1000
      if (sinceHeartbeat < 60) {
        return NextResponse.json({ ok: false, message: "Another matcher is running", seconds_since_heartbeat: Math.round(sinceHeartbeat) })
      }
    }

    // ── 4) Marcar como running ───────────────────────────────────────────────
    await supabase.from("ml_matcher_progress").update({
      status:            "running",
      started_at:        progress!.started_at || new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).eq("account_id", accountId)

    // ── 5) Cargar products en memoria (índices) ──────────────────────────────
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, ean, gtin, isbn, sku")
      .or("ean.not.is.null,gtin.not.is.null,isbn.not.is.null,sku.not.is.null")

    // Métricas de products (para warning en respuesta)
    let productsWithId = 0
    const eanIndex  = new Map<string, string[]>()
    const isbnIndex = new Map<string, string[]>()
    const skuIndex  = new Map<string, string[]>()

    for (const p of allProducts ?? []) {
      let hasAny = false
      // EAN y GTIN van al mismo índice (EAN-13 compatible)
      for (const raw of [p.ean, p.gtin]) {
        if (!raw) continue
        const key = norm(raw)
        if (!key) continue
        hasAny = true
        if (!eanIndex.has(key)) eanIndex.set(key, [])
        eanIndex.get(key)!.push(p.id)
      }
      if (p.isbn) {
        const key = norm(p.isbn)
        if (key) { hasAny = true; addToIndex(isbnIndex, key, p.id) }
      }
      if (p.sku) {
        const key = norm(p.sku)
        if (key) { hasAny = true; addToIndex(skuIndex, key, p.id) }
      }
      if (hasAny) productsWithId++
    }

    const productsMissingIdentifiers = (allProducts?.length ?? 0) > 0 && productsWithId === 0

    // ── 6) Fetch detalles de los candidatos por IDs fijos ───────────────────
    const { data: pubs } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, ean, gtin, isbn, sku")
      .in("id", candidateIds)

    // Métricas de publicaciones (informativos)
    let pubsWithEan = 0, pubsWithIsbn = 0, pubsWithSku = 0

    let matched = 0, ambiguous = 0, notFound = 0, invalid = 0
    const batchUpdates: Array<{ id: string; product_id: string; matched_by: string }> = []

    for (const pub of pubs ?? []) {
      if (Date.now() - t0 > max_seconds * 1000) break

      // Recopilar identificadores: campo directo + extraídos del título
      const eans:  string[] = []
      const isbns: string[] = []
      const skus:  string[] = []

      if (pub.ean)  { const k = norm(pub.ean);  if (k) { eans.push(k);  pubsWithEan++ } }
      if (pub.gtin) { const k = norm(pub.gtin); if (k) eans.push(k) }
      if (pub.isbn) { const k = norm(pub.isbn); if (k) { isbns.push(k); pubsWithIsbn++ } }
      if (pub.sku)  { const k = norm(pub.sku);  if (k) { skus.push(k);  pubsWithSku++ } }

      // Extraer identificadores del título
      const fromTitle = extractFromTitle(pub.title ?? "")
      eans.push(...fromTitle.eans.filter(k => !eans.includes(k)))
      isbns.push(...fromTitle.isbns.filter(k => !isbns.includes(k)))

      if (eans.length + isbns.length + skus.length === 0) {
        invalid++
        continue
      }

      // Buscar: prioridad EAN → ISBN → SKU
      let productId: string | null = null
      let matchType: string | null = null
      let totalMatches = 0

      outer: for (const [ids, index, type] of [
        [eans,  eanIndex,  "ean"]  as const,
        [isbns, isbnIndex, "isbn"] as const,
        [skus,  skuIndex,  "sku"]  as const,
      ]) {
        for (const key of ids) {
          const pids = index.get(key) ?? []
          if (pids.length === 1) { productId = pids[0]; matchType = type; totalMatches = 1; break outer }
          if (pids.length > 1)   { totalMatches = pids.length; matchType = type; break outer }
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

    // ── 7) Aplicar updates ──────────────────────────────────────────────────
    for (const u of batchUpdates) {
      await supabase.from("ml_publications").update({
        product_id:  u.product_id,
        matched_by:  u.matched_by,
      }).eq("id", u.id)
    }

    // ── 8) Actualizar progreso ───────────────────────────────────────────────
    const actuallyProcessed = pubs?.length ?? 0
    const newProcessed  = (progress!.processed_count || 0) + actuallyProcessed
    const newMatched    = (progress!.matched_count || 0) + matched
    const newAmbiguous  = (progress!.ambiguous_count || 0) + ambiguous
    const newNotFound   = (progress!.not_found_count || 0) + notFound
    const newInvalid    = (progress!.invalid_identifier_count || 0) + invalid
    const isComplete    = actuallyProcessed < batch_size  // lote incompleto = no hay más

    await supabase.from("ml_matcher_progress").update({
      status:                   isComplete ? "completed" : "idle",
      processed_count:          newProcessed,
      matched_count:            newMatched,
      ambiguous_count:          newAmbiguous,
      not_found_count:          newNotFound,
      invalid_identifier_count: newInvalid,
      finished_at:              isComplete ? new Date().toISOString() : null,
      last_heartbeat_at:        new Date().toISOString(),
      updated_at:               new Date().toISOString(),
    }).eq("account_id", accountId)

    return NextResponse.json({
      ok:          true,
      status:      "success",
      processed:   actuallyProcessed,
      matched,
      ambiguous,
      not_found:   notFound,
      invalid,
      total_processed: newProcessed,
      is_complete: isComplete,
      elapsed_seconds: elapsed(t0),
      // Métricas informativas
      metrics: {
        pubs_with_ean:  pubsWithEan,
        pubs_with_isbn: pubsWithIsbn,
        pubs_with_sku:  pubsWithSku,
        products_indexed: productsWithId,
        ean_index_size:  eanIndex.size,
        isbn_index_size: isbnIndex.size,
        sku_index_size:  skuIndex.size,
      },
      warnings: productsMissingIdentifiers ? ["products_missing_identifiers"] : [],
    })

  } catch (err: any) {
    await supabase.from("ml_matcher_progress").update({
      status:     "failed",
      last_error: err.message,
    }).eq("account_id", accountId)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(t0: number): string {
  return ((Date.now() - t0) / 1000).toFixed(2)
}

function addToIndex(index: Map<string, string[]>, key: string, id: string) {
  if (!index.has(key)) index.set(key, [])
  index.get(key)!.push(id)
}

/** Normaliza un identificador: quita todo excepto dígitos y letras, lowercase */
function norm(s: string): string {
  return s.replace(/[\s\-\t\r\n]/g, "").toLowerCase().trim()
}

/** Extrae EANs e ISBNs numéricos del título de una publicación */
function extractFromTitle(title: string): { eans: string[]; isbns: string[] } {
  const eans:  string[] = []
  const isbns: string[] = []
  const tokens = title.match(/\b\d{10,13}\b/g) ?? []
  for (const t of tokens) {
    const n = norm(t)
    if (n.length === 13) eans.push(n)           // EAN-13
    else if (n.length === 10) isbns.push(n)     // ISBN-10
    else if (n.length === 12) eans.push(n)      // UPC-12
  }
  return { eans, isbns }
}
