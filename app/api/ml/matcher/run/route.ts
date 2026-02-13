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

  if (!accountId) {
    return NextResponse.json({ error: "account_id required" }, { status: 400 })
  }

  const supabase = await createClient({ useServiceRole: true })

  try {
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

    // 6) Procesar batch
    const { data: pubs } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, isbn, ean, sku")
      .eq("account_id", accountId)
      .is("product_id", null)
      .order("updated_at", { ascending: true })
      .limit(batch_size)

    let matched = 0, ambiguous = 0, notFound = 0, invalid = 0
    const batchUpdates: Array<{ id: string; product_id: string; matched_by: string }> = []

    for (const pub of pubs || []) {
      if (Date.now() - t0 > max_seconds * 1000) break

      const ids = extractIds(pub.title)
      if (pub.isbn) ids.isbn.push(normalize(pub.isbn))
      if (pub.ean) ids.ean.push(normalize(pub.ean))
      if (pub.sku) ids.sku.push(normalize(pub.sku))

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
    const processed = matched + ambiguous + notFound + invalid
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
