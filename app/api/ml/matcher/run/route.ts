import { createAdminClient } from "@/lib/supabase/admin"
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

  const supabase = createAdminClient()

  try {
    // ── 1) Obtener o inicializar progreso ────────────────────────────────────
    let { data: progress } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    // Leer cursor estable (last_id procesado en la invocación anterior)
    const cursorLastId: string | null = (progress?.cursor as any)?.last_id ?? null

    // Si viene reset=true o el run completó, reiniciar cursor y contadores
    const resetRun = body.reset === true || progress?.status === "completed" || progress?.status === "failed"

    // ── 2) Contar candidatos restantes (total para diagnóstico) ─────────────
    let totalCountQuery = supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)
    if (!resetRun && cursorLastId) totalCountQuery = totalCountQuery.gt("id", cursorLastId)
    const { count: remainingCandidates } = await totalCountQuery

    if ((remainingCandidates ?? 0) === 0 && !resetRun) {
      // No quedan candidatos — completar
      await supabase.from("ml_matcher_progress").upsert({
        account_id:        accountId,
        status:            "completed",
        finished_at:       new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      }, { onConflict: "account_id" })

      return NextResponse.json({
        ok: true, status: "no_work", reason: "no_candidates",
        processed: 0, matched: 0, cursor_last_id: cursorLastId,
        elapsed_seconds: elapsed(t0),
      })
    }

    // ── 3) Inicializar / reiniciar progreso ──────────────────────────────────
    if (!progress) {
      await supabase.from("ml_matcher_progress").insert({
        account_id:               accountId,
        status:                   "idle",
        total_target:             remainingCandidates ?? 0,
        processed_count:          0,
        matched_count:            0,
        ambiguous_count:          0,
        not_found_count:          0,
        invalid_identifier_count: 0,
        error_count:              0,
        cursor:                   null,
      })
      const { data: fresh } = await supabase.from("ml_matcher_progress").select("*").eq("account_id", accountId).single()
      progress = fresh
    } else if (resetRun) {
      await supabase.from("ml_matcher_progress").update({
        status:                   "idle",
        total_target:             remainingCandidates ?? 0,
        processed_count:          0,
        matched_count:            0,
        ambiguous_count:          0,
        not_found_count:          0,
        invalid_identifier_count: 0,
        error_count:              0,
        last_error:               null,
        started_at:               null,
        finished_at:              null,
        cursor:                   null,
      }).eq("account_id", accountId)
      const { data: fresh } = await supabase.from("ml_matcher_progress").select("*").eq("account_id", accountId).single()
      progress = fresh
    }

    // ── 4) Concurrencia: heartbeat check ─────────────────────────────────────
    if (progress!.status === "running") {
      const sinceHeartbeat = (Date.now() - new Date(progress!.last_heartbeat_at ?? 0).getTime()) / 1000
      if (sinceHeartbeat < 60) {
        return NextResponse.json({
          ok: false,
          message: "Another matcher is running",
          seconds_since_heartbeat: Math.round(sinceHeartbeat),
        })
      }
    }

    // ── 5) Marcar como running ────────────────────────────────────────────────
    await supabase.from("ml_matcher_progress").update({
      status:            "running",
      started_at:        progress!.started_at || new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).eq("account_id", accountId)

    // ── 6) Capturar lista fija de IDs con cursor estable ─────────────────────
    //
    // ESTRATEGIA: en lugar de range(offset, ...) sobre un dataset que cambia,
    // usamos id > last_processed_id ORDER BY id LIMIT batch_size.
    //
    // Esto garantiza:
    //   a) El conjunto de IDs a procesar en esta invocación es fijo e inmutable
    //      (aunque otras filas obtengan product_id durante el proceso, no afectan
    //      la paginación porque el cursor avanza por id, no por posición).
    //   b) No hay solapamiento entre invocaciones: cada una retoma exactamente
    //      donde terminó la anterior.
    //   c) product_id IS NULL filtra publicaciones ya vinculadas — si alguna fue
    //      vinculada por otra sesión, simplemente no aparece en el fetch de detalles.
    //
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
      await supabase.from("ml_matcher_progress").update({
        status:            "completed",
        finished_at:       new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      }).eq("account_id", accountId)

      return NextResponse.json({
        ok: true, status: "no_work", reason: "no_candidates_after_cursor",
        cursor_last_id: effectiveCursor,
        processed: 0, matched: 0,
        elapsed_seconds: elapsed(t0),
      })
    }

    // IDs fijos — inmutables durante esta invocación
    const candidateIds = candidateRows.map(r => r.id)
    const newCursorLastId = candidateIds[candidateIds.length - 1]

    // ── 7) Construir índices de productos ────────────────────────────────────
    // Usamos createAdminClient() (service role) para bypassear RLS y garantizar
    // que siempre se lean todos los productos, independientemente de la sesión.
    const adminClient = createAdminClient()
    const { data: allProducts, error: productsError } = await adminClient
      .from("products")
      .select("id, ean, gtin, isbn, sku")

    if (productsError) {
      console.error("[matcher] Error cargando productos:", productsError)
    }

    let productsWithId = 0
    const eanIndex  = new Map<string, string[]>()
    const isbnIndex = new Map<string, string[]>()
    const skuIndex  = new Map<string, string[]>()

    for (const p of allProducts ?? []) {
      let hasAny = false
      for (const raw of [p.ean, p.gtin]) {
        if (!raw) continue
        const key = norm(raw)
        if (!key) continue
        hasAny = true
        addToIndex(eanIndex, key, p.id)
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

    // ── 8) Fetch detalles solo de los IDs fijos ──────────────────────────────
    // Si alguna publicación fue vinculada por otra sesión en el interim,
    // product_id no es NULL y podemos filtrarla aquí para no re-matchearla.
    const { data: pubs } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, ean, gtin, isbn, sku")
      .in("id", candidateIds)
      .is("product_id", null)   // protección extra: saltar las ya vinculadas

    let pubsWithEan = 0, pubsWithIsbn = 0, pubsWithSku = 0
    let matched = 0, ambiguous = 0, notFound = 0, invalid = 0
    const batchUpdates: Array<{ id: string; product_id: string; matched_by: string }> = []

    for (const pub of pubs ?? []) {
      if (Date.now() - t0 > max_seconds * 1000) break

      const eans:  string[] = []
      const isbns: string[] = []
      const skus:  string[] = []

      if (pub.ean)  { const k = norm(pub.ean);  if (k) { eans.push(k);  pubsWithEan++ } }
      if (pub.gtin) { const k = norm(pub.gtin); if (k) addUnique(eans, k) }
      if (pub.isbn) {
        const k = norm(pub.isbn)
        if (k) {
          isbns.push(k); pubsWithIsbn++
          // ISBN-13 = EAN-13 para libros — también buscar en índice EAN
          addUnique(eans, k)
        }
      }
      if (pub.sku) {
        const k = norm(pub.sku)
        if (k) {
          skus.push(k); pubsWithSku++
          // Si el SKU es numérico de 10-13 dígitos, puede ser un EAN/ISBN del vendedor
          if (/^\d{10,13}$/.test(k)) addUnique(eans, k)
        }
      }

      const fromTitle = extractFromTitle(pub.title ?? "")
      fromTitle.eans.forEach(k  => addUnique(eans, k))
      fromTitle.isbns.forEach(k => addUnique(isbns, k))

      if (eans.length + isbns.length + skus.length === 0) {
        invalid++
        continue
      }

      // Prioridad: 1) EAN exacto  2) ISBN exacto  3) SKU exacto
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

    // ── 9) Aplicar updates en un solo batch upsert ───────────────────────────
    if (batchUpdates.length > 0) {
      await supabase.from("ml_publications")
        .upsert(
          batchUpdates.map(u => ({ id: u.id, product_id: u.product_id, matched_by: u.matched_by })),
          { onConflict: "id" },
        )
    }

    // ── 10) Actualizar progreso con nuevo cursor ──────────────────────────────
    const actuallyProcessed = pubs?.length ?? 0
    const newProcessed  = (progress!.processed_count || 0) + actuallyProcessed
    const newMatched    = (progress!.matched_count   || 0) + matched
    const newAmbiguous  = (progress!.ambiguous_count || 0) + ambiguous
    const newNotFound   = (progress!.not_found_count || 0) + notFound
    const newInvalid    = (progress!.invalid_identifier_count || 0) + invalid

    // Es el último lote si el query devolvió menos de batch_size filas
    // (el dataset is inmutable para el cursor: si hay más, siempre devuelve batch_size)
    const isComplete = candidateRows.length < batch_size

    await supabase.from("ml_matcher_progress").update({
      status:                   isComplete ? "completed" : "idle",
      processed_count:          newProcessed,
      matched_count:            newMatched,
      ambiguous_count:          newAmbiguous,
      not_found_count:          newNotFound,
      invalid_identifier_count: newInvalid,
      // Guardar cursor para la siguiente invocación
      cursor:                   isComplete ? null : { last_id: newCursorLastId },
      finished_at:              isComplete ? new Date().toISOString() : null,
      last_heartbeat_at:        new Date().toISOString(),
      updated_at:               new Date().toISOString(),
    }).eq("account_id", accountId)

    return NextResponse.json({
      ok:              true,
      status:          "success",
      processed:       actuallyProcessed,
      matched,
      ambiguous,
      not_found:       notFound,
      invalid,
      total_processed: newProcessed,
      is_complete:     isComplete,
      cursor_last_id:  isComplete ? null : newCursorLastId,
      elapsed_seconds: elapsed(t0),
      metrics: {
        pubs_with_ean:      pubsWithEan,
        pubs_with_isbn:     pubsWithIsbn,
        pubs_with_sku:      pubsWithSku,
        products_loaded:    allProducts?.length ?? 0,
        products_indexed:   productsWithId,
        ean_index_size:     eanIndex.size,
        isbn_index_size:    isbnIndex.size,
        sku_index_size:     skuIndex.size,
        candidates_fetched: candidateIds.length,
        remaining_before:   remainingCandidates ?? 0,
      },
      // Muestra de publicaciones sin match para diagnóstico (solo cuando matches=0)
      ...(matched === 0 && (pubs?.length ?? 0) > 0 ? {
        sample_unmatched: (pubs ?? []).slice(0, 3).map(pub => ({
          ml_item_id: pub.ml_item_id,
          title: (pub.title ?? "").slice(0, 50),
          db: { ean: pub.ean, gtin: pub.gtin, isbn: pub.isbn, sku: pub.sku },
        })),
      } : {}),
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

/** Agrega val a arr solo si no está ya presente */
function addUnique(arr: string[], val: string) {
  if (!arr.includes(val)) arr.push(val)
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
