import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { extractIdentifiersFromMLAttributes, findProductByIdentifiers, normalize } from "@/lib/isbn-utils"

export const maxDuration = 60

/**
 * POST /api/ml/import/worker
 * Fase B (Worker): Procesa lotes pequeños de items pendientes
 * Usa multiget /items?ids=... para obtener detalles de múltiples items
 * Extrae ISBN/EAN/GTIN/SKU y vincula con productos
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
    const { data: job } = await supabase.from("ml_import_jobs").select("*, ml_accounts(*)").eq("id", job_id).single()

    if (!job) {
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
    }

    const account = job.ml_accounts

    // ATÓMICO: Reclamar batch de items pendientes (evita race conditions)
    // La función claim_import_items usa FOR UPDATE SKIP LOCKED
    const { data: pendingItems, error: claimError } = await supabase.rpc("claim_import_items", {
      p_job_id: job_id,
      p_limit: batch_size,
    })

    if (claimError) {
      console.error("[v0] Error claiming items:", claimError)
      return NextResponse.json({ error: "Error claiming items" }, { status: 500 })
    }

    if (!pendingItems || pendingItems.length === 0) {
      console.log("[v0] No items claimed, checking if job is complete")

      // Verificar si NO existen items en estado pending O processing
      const { count } = await supabase
        .from("ml_import_queue")
        .select("id", { count: "exact", head: true })
        .eq("job_id", job_id)
        .in("status", ["pending", "processing"])

      if (count === 0) {
        // No hay más items pendientes ni en proceso, completar job
        await supabase
          .from("ml_import_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id)

        return NextResponse.json({
          success: true,
          status: "completed",
          message: "Importación completada",
        })
      }

      // Items siendo procesados por otros workers
      return NextResponse.json({
        success: true,
        status: "processing",
        message: "Items being processed by other workers",
      })
    }

    console.log("[v0] Claimed", pendingItems.length, "items atomically")
    const itemIds = pendingItems.map((item: any) => item.ml_item_id)

    // Obtener detalles de múltiples items con multiget (1 sola llamada)
    const idsParam = itemIds.join(",")
    const multigetUrl = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,price,available_quantity,status,permalink,seller_custom_field,attributes,variations`

    const multigetResponse = await fetch(multigetUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    })

    if (!multigetResponse.ok) {
      if (multigetResponse.status === 429) {
        // Rate limit, marcar items como pending con next_retry_at
        const retryAfterHeader = multigetResponse.headers.get("Retry-After")
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader) : 120 // 2 minutos por defecto
        const nextRetryAt = new Date(Date.now() + retryAfterSeconds * 1000)

        console.log(`[v0] Rate limit 429, retrying in ${retryAfterSeconds}s`)

        await supabase
          .from("ml_import_queue")
          .update({
            status: "pending",
            next_retry_at: nextRetryAt.toISOString(),
          })
          .in("ml_item_id", itemIds)
          .eq("job_id", job_id)

        return NextResponse.json(
          {
            success: false,
            error: "Rate limit alcanzado",
            retry_after: retryAfterSeconds,
          },
          { status: 429 },
        )
      }
      throw new Error(`ML multiget error: ${multigetResponse.status}`)
    }

    const itemsData = await multigetResponse.json()

    let processed = 0
    let failed = 0
    let linked = 0
    let unmatched = 0

    // Procesar cada item
    for (const itemResponse of itemsData) {
      const item = itemResponse.body

      if (!item || itemResponse.code !== 200) {
        failed++
        const currentItem = pendingItems.find((i: any) => i.ml_item_id === itemResponse.id)
        if (currentItem) {
          await supabase
            .from("ml_import_queue")
            .update({
              status: "failed",
              last_error: `ML API returned ${itemResponse.code}`,
              processed_at: new Date().toISOString(),
            })
            .eq("id", currentItem.id)
        }
        continue
      }

      try {
        // ===== NUEVA LÓGICA DE EXTRACCIÓN =====
        
        // 1) Extraer ISBN/EAN/GTIN de attributes usando la librería
        const identifiers = extractIdentifiersFromMLAttributes(item.attributes || [])

        console.log(`[v0] Item ${item.id} identifiers:`, identifiers)

        // 2) Extraer SKU de seller_custom_field
        let candidateSku = item.seller_custom_field || null

        // Si no hay en seller_custom_field, buscar en variations
        if (!candidateSku && item.variations && item.variations.length > 0) {
          candidateSku = item.variations[0].seller_custom_field || item.variations[0].sku || null
        }

        // Normalizar SKU
        const normalizedSku = candidateSku ? normalize(candidateSku) : null

        // 3) Buscar product_id usando TODOS los identificadores disponibles
        const { product_id, matched_by } = await findProductByIdentifiers(supabase, {
          isbn: identifiers.isbn,
          ean: identifiers.ean,
          sku: normalizedSku,
          gtin: identifiers.gtin,
        })

        if (product_id) {
          linked++
          console.log(`[v0] Item ${item.id} matched by ${matched_by}`)
        } else {
          unmatched++
          console.log(`[v0] Item ${item.id} NOT matched - identifiers:`, {
            isbn: identifiers.isbn,
            ean: identifiers.ean,
            gtin: identifiers.gtin,
            sku: normalizedSku,
          })
        }

        // 4) UPSERT en ml_publications CON todos los identificadores
        await supabase
          .from("ml_publications")
          .upsert(
            {
              account_id: account.id,
              ml_item_id: item.id,
              product_id,
              matched_by,
              title: item.title,
              isbn: identifiers.isbn, // ← NUEVO
              ean: identifiers.ean, // ← NUEVO
              gtin: identifiers.gtin, // ← NUEVO
              sku: normalizedSku, // ← NUEVO
              price: item.price,
              current_stock: item.available_quantity,
              status: item.status,
              permalink: item.permalink,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "account_id,ml_item_id",
            },
          )

        // Marcar como completado
        await supabase
          .from("ml_import_queue")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
          })
          .eq("ml_item_id", item.id)
          .eq("job_id", job_id)

        processed++
      } catch (itemError: any) {
        console.error("[v0] Error processing item", item.id, itemError)
        const currentItem = pendingItems.find((i: any) => i.ml_item_id === item.id)

        const attempts = currentItem?.attempts || 1

        // Decidir si reintentar o marcar como fallido
        const shouldRetry =
          attempts < 3 && (itemError.status === 429 || (itemError.status >= 500 && itemError.status < 600))

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
              next_retry_at: nextRetryAt.toISOString(),
            })
            .eq("id", currentItem?.id)
        } else {
          failed++

          await supabase
            .from("ml_import_queue")
            .update({
              status: "failed",
              last_error: itemError.message || "Max retries exceeded or non-retryable error",
              processed_at: new Date().toISOString(),
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
        updated_at: new Date().toISOString(),
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
      has_more: pendingItems.length === batch_size,
    })
  } catch (error: any) {
    console.error("[v0] Error in worker:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
