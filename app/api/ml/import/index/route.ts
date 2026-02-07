import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import/index
 * Fase A (Indexado): Recorre el catálogo completo de ML y encola todos los item_ids
 * Procesa en batches para evitar timeouts
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT INDEX ==========")
  
  try {
    const supabase = await createClient()
    const { job_id, account_id, offset = 0 } = await request.json()

    console.log("[v0] INDEX - job_id:", job_id, "account_id:", account_id, "offset:", offset)

    if (!job_id || !account_id) {
      return NextResponse.json({ error: "job_id y account_id requeridos" }, { status: 400 })
    }

    // Obtener job y cuenta
    const { data: job, error: jobError } = await supabase.from("ml_import_jobs").select("*").eq("id", job_id).single()
    const { data: account, error: accountError } = await supabase.from("ml_accounts").select("*").eq("id", account_id).single()

    if (jobError) {
      console.error("[v0] Supabase job query error:", jobError.code, jobError.message)
      return NextResponse.json({ error: `Error buscando job: ${jobError.message}` }, { status: 500 })
    }

    if (accountError) {
      console.error("[v0] Supabase account query error:", accountError.code, accountError.message)
      return NextResponse.json({ error: `Error buscando cuenta: ${accountError.message}` }, { status: 500 })
    }

    if (!job || !account) {
      console.error("[v0] Job or account not found. job_id:", job_id, "account_id:", account_id)
      return NextResponse.json({ error: "Job o cuenta no encontrados" }, { status: 404 })
    }

    const BATCH_SIZE = 200 // Items por llamada
    let itemsIndexed = 0
    let currentOffset = offset

    console.log("[v0] INDEX - Starting from offset:", currentOffset, "| job status:", job.status)

    // Consultar ML con search (no usa scan porque tiene limitaciones)
    const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=${BATCH_SIZE}&offset=${currentOffset}`
    console.log("[v0] Calling ML API:", searchUrl)
    
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    console.log("[v0] ML API response status:", searchResponse.status)

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error("[v0] ML API error:", searchResponse.status, errorText)
      
      if (searchResponse.status === 429) {
        return NextResponse.json({ error: "Rate limit alcanzado", retry_after: 3600 }, { status: 429 })
      }
      
      throw new Error(`ML API error ${searchResponse.status}: ${errorText}`)
    }

    const searchData = await searchResponse.json()
    const itemIds = searchData.results || []
    const totalItems = searchData.paging?.total || 0
    
    console.log("[v0] INDEX - Found", itemIds.length, "items at offset", currentOffset, "| total ML items:", totalItems)

    // Insertar item_ids en la cola (usando UPSERT para evitar duplicados)
    if (itemIds.length > 0) {
      const queueItems = itemIds.map((itemId: string) => ({
        job_id,
        ml_item_id: itemId,
        status: "pending"
      }))

      console.log("[v0] INDEX - Enqueuing", queueItems.length, "items to ml_import_queue")
      
      const { error: queueError } = await supabase.from("ml_import_queue").upsert(queueItems, { 
        onConflict: "job_id,ml_item_id",
        ignoreDuplicates: true 
      })

      if (queueError) {
        console.error("[v0] Supabase queue insert error:", queueError.code, queueError.message)
        throw new Error(`Error insertando en queue: ${queueError.message}`)
      }

      itemsIndexed = itemIds.length
      console.log("[v0] INDEX - Successfully enqueued", itemsIndexed, "items")
    }

    // Actualizar job con progreso
    const newOffset = currentOffset + itemIds.length
    
    console.log("[v0] INDEX - Updating job checkpoint: new_offset =", newOffset, "| total =", totalItems)
    
    await supabase
      .from("ml_import_jobs")
      .update({
        total_items: totalItems,
        current_offset: newOffset,
        updated_at: new Date().toISOString()
      })
      .eq("id", job_id)

    // Si hay más items, retornar estado "indexing" para que el cron lo reintente
    if (itemIds.length === BATCH_SIZE && newOffset < totalItems) {
      const progress = Math.round((newOffset / totalItems) * 100)
      console.log("[v0] INDEX - More items to index:", newOffset, "/", totalItems, `(${progress}%)`)

      return NextResponse.json({
        success: true,
        status: "indexing",
        items_indexed: itemsIndexed,
        total_offset: newOffset,
        total_items: totalItems,
        progress: Math.round((newOffset / totalItems) * 100)
      })
    }

    // Indexado completo, cambiar estado a processing
    console.log("[v0] INDEX - INDEXING COMPLETE! Changing job status to 'processing'")
    
    await supabase
      .from("ml_import_jobs")
      .update({ 
        status: "processing",
        updated_at: new Date().toISOString()
      })
      .eq("id", job_id)

    console.log("[v0] INDEX - Indexing completed. Total items:", totalItems)

    return NextResponse.json({
      success: true,
      status: "completed",
      items_indexed: itemsIndexed,
      total_items: totalItems,
      message: "Indexado completo. Listo para procesar con worker."
    })

  } catch (error: any) {
    console.error("[v0] Error in index:", error)
    console.error("[v0] Error stack:", error.stack)
    
    // Asegurar que siempre devolvemos JSON
    return NextResponse.json(
      { error: error.message || "Error desconocido en indexado" }, 
      { status: 500 }
    )
  }
}
