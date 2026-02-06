import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import/worker
 * Fase B (Worker): Procesa lotes pequeños de items pendientes
 * Usa multiget /items?ids=... para obtener detalles de múltiples items
 * Extrae SKU/GTIN y vincula con productos
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT WORKER ==========")
  
  try {
    const supabase = await createClient()
    const { job_id, batch_size = 20 } = await request.json() // Límite de 20 para multiget

    if (!job_id) {
      return NextResponse.json({ error: "job_id requerido" }, { status: 400 })
    }

    // Obtener job
    const { data: job } = await supabase
      .from("ml_import_jobs")
      .select("*, ml_accounts(*)")
      .eq("id", job_id)
      .single()

    if (!job) {
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
    }

    const account = job.ml_accounts

    // ATÓMICO: Reclamar batch de items pendientes (evita race conditions)
    // La función claim_import_items usa FOR UPDATE SKIP LOCKED
    const { data: pendingItems, error: claimError } = await supabase.rpc(
      'claim_import_items',
      { p_job_id: job_id, p_limit: batch_size }
    )

    if (claimError) {
      console.error("[v0] Error claiming items:", claimError)
      return NextResponse.json({ error: "Error claiming items" }, { status: 500 })
    }

    if (!pendingItems || pendingItems.length === 0) {
      console.log("[v0] No items claimed, checking if job is complete")
      
      // Verificar si realmente no quedan items pendientes
      const { count } = await supabase
        .from("ml_import_queue")
        .select("id", { count: "exact", head: true })
        .eq("job_id", job_id)
        .eq("status", "pending")
      
      if (count === 0) {
        // No hay más items pendientes, completar job
        await supabase
          .from("ml_import_jobs")
          .update({ 
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", job_id)

        return NextResponse.json({
          success: true,
          status: "completed",
          message: "Importación completada"
        })
      }
      
      // Items siendo procesados por otros workers
      return NextResponse.json({
        success: true,
        status: "processing",
        message: "Items being processed by other workers"
      })
    }

    console.log("[v0] Claimed", pendingItems.length, "items atomically")
    const itemIds = pendingItems.map((item: any) => item.ml_item_id)

    // Obtener detalles de múltiples items con multiget (1 sola llamada)
    const idsParam = itemIds.join(",")
    const multigetUrl = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,price,available_quantity,status,permalink,seller_custom_field,attributes,variations`
    
    const multigetResponse = await fetch(multigetUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    if (!multigetResponse.ok) {
      if (multigetResponse.status === 429) {
        // Rate limit, marcar items como pending de nuevo
        await supabase
          .from("ml_import_queue")
          .update({ status: "pending" })
          .in("ml_item_id", itemIds)
          .eq("job_id", job_id)

        return NextResponse.json({ 
          success: false, 
          error: "Rate limit alcanzado", 
          retry_after: 3600 
        }, { status: 429 })
      }
      throw new Error(`ML multiget error: ${multigetResponse.status}`)
    }

    const itemsData = await multigetResponse.json()
    
    let processed = 0
    let failed = 0
    let linked = 0
    let unmatched = 0 // SKU/GTIN no encontrado en productos

    // Procesar cada item
    for (const itemResponse of itemsData) {
      const item = itemResponse.body
      
      if (!item || itemResponse.code !== 200) {
        failed++
        await supabase
          .from("ml_import_queue")
          .update({ 
            status: "failed",
            last_error: `ML API returned ${itemResponse.code}`,
            attempts: pendingItems.find(i => i.ml_item_id === itemResponse.id)?.attempts + 1 || 1,
            processed_at: new Date().toISOString()
          })
          .eq("ml_item_id", itemResponse.id)
          .eq("job_id", job_id)
        continue
      }

      try {
        // Extraer SKU/GTIN
        let sku = item.seller_custom_field || null
        let gtin = null

        // Buscar GTIN en attributes
        if (item.attributes && Array.isArray(item.attributes)) {
          const gtinAttr = item.attributes.find((attr: any) => attr.id === "GTIN")
          if (gtinAttr) gtin = gtinAttr.value_name
        }

        // Si hay variaciones, usar SKU de la primera variación
        if (!sku && item.variations && item.variations.length > 0) {
          sku = item.variations[0].seller_custom_field || item.variations[0].sku
        }

        // Buscar producto por SKU o GTIN (primero en products, luego en variations)
        let product_id = null
        let variation_id = null
        
        if (sku || gtin) {
          // 1. Buscar en products
          const searchValue = sku || gtin
          const { data: product } = await supabase
            .from("products")
            .select("id")
            .or(`sku.eq.${searchValue},ean.eq.${searchValue}`)
            .limit(1)
            .single()

          if (product) {
            product_id = product.id
            linked++
          } else {
            // 2. Buscar en variations (el item ML puede ser una variación)
            const { data: variation } = await supabase
              .from("product_variations")
              .select("id, product_id")
              .or(`sku.eq.${searchValue},ean.eq.${searchValue}`)
              .limit(1)
              .single()
            
            if (variation) {
              product_id = variation.product_id
              variation_id = variation.id
              linked++
            } else {
              unmatched++ // SKU/GTIN no encontrado
            }
          }
        } else {
          unmatched++ // No tiene SKU ni GTIN
        }

        // UPSERT en ml_publications
        await supabase
          .from("ml_publications")
          .upsert({
            account_id: account.id,
            ml_item_id: item.id,
            product_id,
            variation_id,
            title: item.title,
            price: item.price,
            current_stock: item.available_quantity,
            status: item.status,
            permalink: item.permalink,
            updated_at: new Date().toISOString()
          }, {
            onConflict: "ml_item_id"
          })

        // Marcar como completado
        await supabase
          .from("ml_import_queue")
          .update({ 
            status: "completed",
            processed_at: new Date().toISOString()
          })
          .eq("ml_item_id", item.id)
          .eq("job_id", job_id)

        processed++

      } catch (itemError: any) {
        console.error("[v0] Error processing item", item.id, itemError)
        const currentItem = pendingItems.find((i: any) => i.ml_item_id === item.id)
        
        // La función claim_import_items ya incrementó attempts con COALESCE
        const attempts = currentItem?.attempts || 1
        
        // Decidir si reintentar o marcar como fallido
        const shouldRetry = attempts < 3 && (
          itemError.status === 429 || 
          (itemError.status >= 500 && itemError.status < 600)
        )
        
        if (shouldRetry) {
          // Backoff exponencial: 2^attempts minutos
          const delayMinutes = Math.pow(2, attempts)
          const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000)
          
          console.log(`[v0] Will retry item ${item.id} in ${delayMinutes} minutes (attempt ${attempts}/3)`)
          
          await supabase
            .from("ml_import_queue")
            .update({ 
              status: "pending",
              last_error: itemError.message || "Unknown error",
              next_retry_at: nextRetryAt.toISOString()
            })
            .eq("id", currentItem?.id)
        } else {
          failed++
          
          await supabase
            .from("ml_import_queue")
            .update({ 
              status: "failed",
              last_error: itemError.message || "Max retries exceeded or non-retryable error",
              processed_at: new Date().toISOString()
            })
            .eq("id", currentItem?.id)
        }
      }
    }

    // Actualizar estadísticas del job
    await supabase
      .from("ml_import_jobs")
      .update({
        processed_items: job.processed_items + processed,
        failed_items: job.failed_items + failed,
        updated_at: new Date().toISOString()
      })
      .eq("id", job_id)

    console.log("[v0] Worker completed:", { processed, failed, linked, unmatched })

    return NextResponse.json({
      success: true,
      processed,
      failed,
      linked,
      unmatched,
      unmatched_percent: processed > 0 ? Math.round((unmatched / processed) * 100) : 0,
      has_more: pendingItems.length === batch_size
    })

  } catch (error: any) {
    console.error("[v0] Error in worker:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
