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

    if (!job_id || !account_id) {
      return NextResponse.json({ error: "job_id y account_id requeridos" }, { status: 400 })
    }

    // Obtener job y cuenta
    const { data: job } = await supabase.from("ml_import_jobs").select("*").eq("id", job_id).single()
    const { data: account } = await supabase.from("ml_accounts").select("*").eq("id", account_id).single()

    if (!job || !account) {
      return NextResponse.json({ error: "Job o cuenta no encontrados" }, { status: 404 })
    }

    const BATCH_SIZE = 200 // Items por llamada
    let itemsIndexed = 0
    let currentOffset = offset

    console.log("[v0] Indexing from offset:", currentOffset)

    // Consultar ML con search (no usa scan porque tiene limitaciones)
    const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=${BATCH_SIZE}&offset=${currentOffset}`
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    if (!searchResponse.ok) {
      if (searchResponse.status === 429) {
        return NextResponse.json({ error: "Rate limit alcanzado", retry_after: 3600 }, { status: 429 })
      }
      throw new Error(`ML API error: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()
    const itemIds = searchData.results || []
    
    console.log("[v0] Found", itemIds.length, "items at offset", currentOffset)

    // Insertar item_ids en la cola (usando UPSERT para evitar duplicados)
    if (itemIds.length > 0) {
      const queueItems = itemIds.map((itemId: string) => ({
        job_id,
        ml_item_id: itemId,
        status: "pending"
      }))

      await supabase.from("ml_import_queue").upsert(queueItems, { 
        onConflict: "job_id,ml_item_id",
        ignoreDuplicates: true 
      })

      itemsIndexed = itemIds.length
    }

    // Actualizar job con progreso
    const newOffset = currentOffset + itemIds.length
    const totalItems = searchData.paging?.total || job.total_items || 0
    
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
      console.log("[v0] More items to index:", newOffset, "/", totalItems)

      return NextResponse.json({
        success: true,
        status: "indexing",
        items_indexed: itemsIndexed,
        progress: Math.round((newOffset / totalItems) * 100),
        total_offset: newOffset,
        total_items: totalItems,
        progress: Math.round((newOffset / totalItems) * 100)
      })
    }

    // Indexado completo, cambiar estado a processing
    await supabase
      .from("ml_import_jobs")
      .update({ 
        status: "processing",
        updated_at: new Date().toISOString()
      })
      .eq("id", job_id)

    console.log("[v0] Indexing completed. Total items:", totalItems)

    return NextResponse.json({
      success: true,
      status: "completed",
      items_indexed: itemsIndexed,
      total_items: totalItems,
      message: "Indexado completo. Listo para procesar con worker."
    })

  } catch (error: any) {
    console.error("[v0] Error in index:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
