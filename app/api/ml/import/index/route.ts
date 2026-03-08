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
    const body = await request.json()
    const { job_id, account_id, offset = 0 } = body

    console.log("[v0] INDEX - Received params:", { job_id, account_id, offset })
    console.log("[v0] INDEX - Request body:", JSON.stringify(body))

    if (!job_id || !account_id) {
      console.error("[v0] INDEX - Missing required parameters!")
      return NextResponse.json({ error: "job_id y account_id requeridos" }, { status: 400 })
    }

    // Obtener job y cuenta
    console.log("[v0] INDEX - Fetching job:", job_id)
    const { data: job, error: jobError } = await supabase
      .from("ml_import_jobs")
      .select("*")
      .eq("id", job_id)
      .single()
    
    console.log("[v0] INDEX - Job fetch result:", { jobError, job: job ? { id: job.id, status: job.status } : null })

    console.log("[v0] INDEX - Fetching account:", account_id)
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()
    
    console.log("[v0] INDEX - Account fetch result:", { 
      accountError, 
      account: account ? { 
        id: account.id, 
        nickname: account.nickname,
        ml_user_id: account.ml_user_id,
        access_token: account.access_token ? account.access_token.substring(0, 20) + "..." : null
      } : null 
    })

    if (jobError) {
      console.error("[v0] INDEX - Supabase job query error:", jobError.code, jobError.message)
      return NextResponse.json({ error: `Error buscando job: ${jobError.message}` }, { status: 500 })
    }

    if (accountError) {
      console.error("[v0] INDEX - Supabase account query error:", accountError.code, accountError.message)
      return NextResponse.json({ error: `Error buscando cuenta: ${accountError.message}` }, { status: 500 })
    }

    if (!job) {
      console.error("[v0] INDEX - Job not found. job_id:", job_id)
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
    }

    if (!account) {
      console.error("[v0] INDEX - Account not found. account_id:", account_id)
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    if (!account.access_token) {
      console.error("[v0] INDEX - Account has no access_token")
      return NextResponse.json({ error: "Account missing access_token" }, { status: 400 })
    }

    if (!account.ml_user_id) {
      console.error("[v0] INDEX - Account has no ml_user_id")
      return NextResponse.json({ error: "Account missing ml_user_id" }, { status: 400 })
    }

    const BATCH_SIZE = 200 // Items por llamada
    let itemsIndexed = 0
    let currentOffset = offset

    console.log("[v0] INDEX - Starting from offset:", currentOffset, "| job status:", job.status)

    // Construir params correctamente
    const params = new URLSearchParams({
      limit: BATCH_SIZE.toString(),
      offset: currentOffset.toString(),
    })

    // Consultar ML con search usando la URL correcta
    const searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?${params.toString()}`
    console.log("[v0] INDEX - Calling ML API:", searchUrl)
    console.log("[v0] INDEX - Authorization: Bearer ${account.access_token.substring(0, 20)}...")
    
    const searchResponse = await fetch(searchUrl, {
      headers: { 
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json"
      }
    })

    console.log("[v0] INDEX - ML API response status:", searchResponse.status)
    console.log("[v0] INDEX - Response content-type:", searchResponse.headers.get("content-type"))

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error("[v0] INDEX - ML API error:", searchResponse.status, errorText)
      
      if (searchResponse.status === 429) {
        return NextResponse.json({ error: "Rate limit alcanzado", retry_after: 3600 }, { status: 429 })
      }

      if (searchResponse.status === 401) {
        throw new Error(`ML API authentication failed. Token may be expired. Status: ${searchResponse.status}`)
      }
      
      throw new Error(`ML API error ${searchResponse.status}: ${errorText}`)
    }

    let searchData: any = {}
    try {
      searchData = await searchResponse.json()
    } catch (parseError) {
      console.error("[v0] INDEX - Failed to parse JSON response:", parseError)
      throw new Error("Failed to parse ML API response as JSON")
    }

    const itemIds = searchData.results || []
    const totalItems = searchData.paging?.total || 0
    
    console.log("[v0] INDEX - Response paging:", JSON.stringify(searchData.paging))
    console.log("[v0] INDEX - Found", itemIds.length, "items at offset", currentOffset, "| total ML items:", totalItems)
    
    if (!totalItems && itemIds.length === 0) {
      console.warn("[v0] INDEX - WARNING: No items found and total_items is 0. May indicate auth issue or empty account.")
    }

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
