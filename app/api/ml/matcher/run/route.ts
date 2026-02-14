import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/matcher/run
 * Ejecuta UNA corrida incremental de matching
 * NO recalcula total_target, actualiza progreso incrementalmente
 */
export async function POST(request: Request) {
  const t0 = Date.now()
  const body = await request.json()
  const { account_id: accountId, max_seconds = 12, batch_size = 200 } = body

  // LOG OBLIGATORIO: account_id recibido
  console.log(`[v0] [MATCHER] POST /api/ml/matcher/run - Received account_id: ${accountId}`)

  // Validación estricta de account_id (existencia y formato UUID)
  if (!accountId) {
    console.log(`[v0] [MATCHER] ERROR: Missing account_id`)
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 })
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(accountId)) {
    console.log(`[v0] [MATCHER] ERROR: Invalid UUID format for account_id: ${accountId}`)
    return NextResponse.json({ error: "invalid_account_id_format" }, { status: 400 })
  }

  const supabase = await createClient({ useServiceRole: true })

  try {
    // LOG OBLIGATORIO: Calcular candidates_count ANTES de inicializar progreso
    const { data: candidates, count: candidatesCount } = await supabase
      .from("ml_publications")
      .select("id, isbn, ean, gtin, sku", { count: 'exact', head: false })
      .eq("account_id", accountId)
      .is("product_id", null)
      .limit(10) // Solo para ver ejemplos

    console.log(`[v0] [MATCHER] Total candidates without product_id: ${candidatesCount}`)
    console.log(`[v0] [MATCHER] Sample candidates (first 10):`, candidates?.map(c => ({
      id: c.id,
      has_isbn: !!c.isbn,
      has_ean: !!c.ean,
      has_gtin: !!c.gtin,
      has_sku: !!c.sku
    })))

    // Si candidates_count == 0, devolver no_candidates inmediatamente
    if (candidatesCount === 0) {
      console.log(`[v0] [MATCHER] No candidates found - returning no_work`)
      return NextResponse.json({
        ok: true,
        status: 'no_work',
        reason: 'no_candidates',
        processed: 0,
        matched: 0,
        elapsed_seconds: ((Date.now() - t0) / 1000).toFixed(2),
        total_processed: 0,
        total_target: 0
      })
    }

    // 1) Obtener progreso actual
    let { data: progress } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    // 2) Inicializar si no existe o está completed/failed
    if (!progress || progress.status === 'completed' || progress.status === 'failed') {
      const { count: totalTarget } = await supabase
        .from("ml_publications")
        .select("*", { count: 'exact', head: true })
        .eq("account_id", accountId)
        .is("product_id", null)

      if (!progress) {
        await supabase.from("ml_matcher_progress").insert({
          account_id: accountId,
          status: 'idle',
          total_target: totalTarget || 0,
          processed_count: 0,
          matched_count: 0,
          ambiguous_count: 0,
          not_found_count: 0,
          invalid_identifier_count: 0,
          error_count: 0
        })
      } else {
        await supabase.from("ml_matcher_progress").update({
          status: 'idle',
          total_target: totalTarget || 0,
          processed_count: 0,
          matched_count: 0,
          ambiguous_count: 0,
          not_found_count: 0,
          invalid_identifier_count: 0,
          error_count: 0,
          last_error: null
        }).eq("account_id", accountId)
      }

      const { data: refreshed } = await supabase
        .from("ml_matcher_progress")
        .select("*")
        .eq("account_id", accountId)
        .single()
      progress = refreshed
    }

    // 3) Check concurrencia con heartbeat
    if (progress!.status === 'running') {
      const lastHeartbeat = progress!.last_heartbeat_at ? new Date(progress!.last_heartbeat_at).getTime() : 0
      const secondsSinceHeartbeat = (Date.now() - lastHeartbeat) / 1000

      if (secondsSinceHeartbeat < 60) {
        return NextResponse.json({
          ok: false,
          message: "Another matcher is running",
          seconds_since_heartbeat: Math.round(secondsSinceHeartbeat)
        })
      }
    }

    // 4) Marcar como running
    await supabase.from("ml_matcher_progress").update({
      status: 'running',
      started_at: progress!.started_at || new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString()
    }).eq("account_id", accountId)

    // 5) Cargar productos en memoria una sola vez
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, isbn, ean, sku")
      .or("isbn.not.is.null,ean.not.is.null,sku.not.is.null")

    // Construir índices
    const isbnIndex = new Map<string, string[]>()
    const eanIndex = new Map<string, string[]>()
    const skuIndex = new Map<string, string[]>()

    for (const p of allProducts || []) {
      if (p.isbn) {
        const key = normalize(p.isbn)
        if (!isbnIndex.has(key)) isbnIndex.set(key, [])
        isbnIndex.get(key)!.push(p.id)
      }
      if (p.ean) {
        const key = normalize(p.ean)
        if (!eanIndex.has(key)) eanIndex.set(key, [])
        eanIndex.get(key)!.push(p.id)
      }
      if (p.sku) {
        const key = normalize(p.sku)
        if (!skuIndex.has(key)) skuIndex.set(key, [])
        skuIndex.get(key)!.push(p.id)
      }
    }

    // 6) Procesar batch (con offset para no repetir publicaciones ya procesadas)
    console.log(`[v0] [MATCHER] Fetching batch: offset=${progress.processed_count}, limit=${batch_size}`)
    const { data: pubs, error: pubsError } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, isbn, ean, sku")
      .eq("account_id", accountId)
      .is("product_id", null)
      .order("updated_at", { ascending: true })
      .range(progress.processed_count, progress.processed_count + batch_size - 1)

    console.log(`[v0] [MATCHER] Fetched ${pubs?.length || 0} publications`, pubsError ? `Error: ${pubsError.message}` : '')

    // DETECCIÓN DE MISMATCH: Si candidates_count > 0 pero batch retorna 0, es un problema
    if ((!pubs || pubs.length === 0) && candidatesCount! > 0 && progress!.processed_count < candidatesCount!) {
      console.error(`[v0] [MATCHER] CANDIDATE_QUERY_MISMATCH: candidates_count=${candidatesCount} but batch returned 0 items`)
      console.error(`[v0] [MATCHER] Query used: .from("ml_publications").eq("account_id", "${accountId}").is("product_id", null).order("updated_at", { ascending: true }).range(${progress.processed_count}, ${progress.processed_count + batch_size - 1})`)
      
      return NextResponse.json({
        ok: false,
        error: "candidate_query_mismatch",
        details: {
          candidates_count: candidatesCount,
          batch_returned: 0,
          processed_count: progress!.processed_count,
          query_offset: progress!.processed_count,
          query_limit: batch_size,
          query_filter: `account_id='${accountId}' AND product_id IS NULL ORDER BY updated_at ASC`
        }
      }, { status: 500 })
    }

    // Si no hay publicaciones y ya procesamos todo, devolver no_work normal
    if (!pubs || pubs.length === 0) {
      await supabase.from("ml_matcher_progress").update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString()
      }).eq("account_id", accountId)

      return NextResponse.json({
        ok: true,
        status: 'no_work',
        reason: progress!.processed_count >= (progress!.total_target || 0) ? 'all_processed' : 'no_candidates',
        processed: 0,
        matched: 0,
        elapsed_seconds: ((Date.now() - t0) / 1000).toFixed(2),
        total_processed: progress!.processed_count,
        total_target: progress!.total_target,
        candidates_count: candidatesCount
      })
    }

    let matched = 0, ambiguous = 0, notFound = 0, invalid = 0
    const batchUpdates: Array<{ id: string; product_id: string; matched_by: string }> = []
    let actuallyProcessed = 0

    for (const pub of pubs || []) {
      if (Date.now() - t0 > max_seconds * 1000) break
      
      actuallyProcessed++ // Contar TODAS las publicaciones procesadas

      const ids = extractIds(pub.title)
      if (pub.isbn) ids.isbn.push(normalize(pub.isbn))
      if (pub.ean) ids.ean.push(normalize(pub.ean))
      if (pub.sku) ids.sku.push(normalize(pub.sku))

      // Si no tiene identificadores, marcar como invalid y continuar
      if (ids.isbn.length + ids.ean.length + ids.sku.length === 0) {
        invalid++
        continue
      }

      let productId: string | null = null
      let matchType: string | null = null
      let totalMatches = 0

      // Buscar por ISBN > EAN > SKU
      for (const isbn of ids.isbn) {
        const pids = isbnIndex.get(isbn) || []
        if (pids.length === 1) { productId = pids[0]; matchType = "isbn"; totalMatches = 1; break }
        if (pids.length > 1) { totalMatches = pids.length; matchType = "isbn"; break }
      }

      if (!productId && totalMatches === 0) {
        for (const ean of ids.ean) {
          const pids = eanIndex.get(ean) || []
          if (pids.length === 1) { productId = pids[0]; matchType = "ean"; totalMatches = 1; break }
          if (pids.length > 1) { totalMatches = pids.length; matchType = "ean"; break }
        }
      }

      if (!productId && totalMatches === 0) {
        for (const sku of ids.sku) {
          const pids = skuIndex.get(sku) || []
          if (pids.length === 1) { productId = pids[0]; matchType = "sku"; totalMatches = 1; break }
          if (pids.length > 1) { totalMatches = pids.length; matchType = "sku"; break }
        }
      }

      // Acumular updates en memoria
      if (productId) {
        matched++
        batchUpdates.push({
          id: pub.id,
          product_id: productId,
          matched_by: matchType!
        })
      } else if (totalMatches > 1) {
        ambiguous++
      } else {
        notFound++
      }
    }
    
    console.log(`[v0] [MATCHER] Processed: ${actuallyProcessed}, Matched: ${matched}, Ambiguous: ${ambiguous}, Not found: ${notFound}, Invalid: ${invalid}`)

    // Batch update al final (mucho más rápido)
    if (batchUpdates.length > 0) {
      console.log(`[MATCHER] Batch updating ${batchUpdates.length} matched publications`)
      
      for (const update of batchUpdates) {
        // Validación crítica: solo actualizar si product_id es válido
        if (!update.product_id) {
          console.error(`[MATCHER] ERROR: Attempted to update publication ${update.id} with NULL product_id`)
          continue
        }
        
        await supabase.from("ml_publications").update({
          product_id: update.product_id,
          matched_by: update.matched_by
        }).eq("id", update.id)
      }
    }

    // 7) Actualizar progreso INCREMENTALMENTE
    const processed = actuallyProcessed // Usar el contador real, no el calculado
    const newProcessed = (progress!.processed_count || 0) + processed
    const newMatched = (progress!.matched_count || 0) + matched
    const newAmbiguous = (progress!.ambiguous_count || 0) + ambiguous
    const newNotFound = (progress!.not_found_count || 0) + notFound
    const newInvalid = (progress!.invalid_identifier_count || 0) + invalid

    const isComplete = newProcessed >= (progress!.total_target || 0) || (pubs?.length || 0) < batch_size

    await supabase.from("ml_matcher_progress").update({
      status: isComplete ? 'completed' : 'idle',
      processed_count: newProcessed,
      matched_count: newMatched,
      ambiguous_count: newAmbiguous,
      not_found_count: newNotFound,
      invalid_identifier_count: newInvalid,
      finished_at: isComplete ? new Date().toISOString() : null,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("account_id", accountId)

    return NextResponse.json({
      ok: true,
      processed,
      matched,
      ambiguous,
      not_found: notFound,
      invalid,
      elapsed_seconds: ((Date.now() - t0) / 1000).toFixed(2),
      total_processed: newProcessed,
      total_target: progress!.total_target,
      is_complete: isComplete
    })

  } catch (error: any) {
    await supabase.from("ml_matcher_progress").update({
      status: 'failed',
      last_error: error.message
    }).eq("account_id", accountId)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function normalize(s: string): string {
  return s.replace(/[-\s]/g, "").toLowerCase()
}

function extractIds(title: string): { isbn: string[]; ean: string[]; sku: string[] } {
  const isbn: string[] = []
  const ean: string[] = []
  
  // ISBN-13 y ISBN-10
  const matches = title.match(/\b(?:978|979)?[0-9]{9,13}\b/g) || []
  for (const m of matches) {
    const n = normalize(m)
    if (n.length >= 10 && n.length <= 13) isbn.push(n)
  }
  
  // EAN-13
  const eanMatches = title.match(/\b[0-9]{13}\b/g) || []
  for (const m of eanMatches) {
    const n = normalize(m)
    if (!isbn.includes(n)) ean.push(n)
  }
  
  return { isbn, ean, sku: [] }
}
