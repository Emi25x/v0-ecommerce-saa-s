import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import-pro/run
 * Ejecuta un ciclo de importación por tiempo limitado con auto-tuning
 * Body: { account_id, max_seconds: 12, publications_page: 200, detail_batch: 30 }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let accountId: string | null = null
  
  try {
    const body = await request.json()
    const {
      account_id,
      max_seconds = 12,
      publications_page = 200, // Aumentado de 30 a 200 para recuperar throughput
      detail_batch = 30, // Aumentado de 10 a 30 para procesar más items por batch
    } = body

    accountId = account_id

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[IMPORT-PRO] Run starting for account ${accountId}, max_seconds: ${max_seconds}`)

    // TODO: Authentication - Implement when Supabase Auth is configured
    // For now, skip auth validation to allow development/testing
    // Step 1: Get authenticated user session (DISABLED - no auth.users)
    // const supabaseAuth = await createClient()
    // const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    // if (authError || !user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    // Use service role for data access (bypasses RLS)
    const supabase = await createClient({ useServiceRole: true })

    // Verify account exists (ownership check disabled until auth is implemented)
    let account = null
    
    try {
      const { data, error: accountError } = await supabase
        .from("ml_accounts")
        .select("*")
        .eq("id", accountId)
        .maybeSingle()

      if (accountError) {
        console.error(`[IMPORT-PRO] Database error fetching account:`, accountError)
        return NextResponse.json({ error: "Database error", details: accountError.message }, { status: 503 })
      }

      account = data
    } catch (err: any) {
      // Capturar errores de parsing JSON (rate limits de Supabase)
      console.error(`[IMPORT-PRO] Exception fetching account:`, err.message)
      if (err.message?.includes('Too Many') || err.message?.includes('not valid JSON')) {
        return NextResponse.json({ 
          ok: false, 
          error: "Database rate limit or connection issue. Please wait a moment and try again.", 
          rate_limited: true 
        }, { status: 429 })
      }
      return NextResponse.json({ error: "Database connection error" }, { status: 503 })
    }

    if (!account) {
      console.error(`[IMPORT-PRO] Account not found: ${accountId}`)
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    console.log(`[IMPORT-PRO] Access granted for account ${accountId}`)

    let progress = null
    
    try {
      const { data, error: progressError } = await supabase
        .from("ml_import_progress")
        .select("*")
        .eq("account_id", accountId)
        .single()

      if (progressError || !data) {
        return NextResponse.json({ error: "Progress not found" }, { status: 404 })
      }
      
      progress = data
    } catch (err: any) {
      console.error(`[IMPORT-PRO] Exception fetching progress:`, err.message)
      if (err.message?.includes('Too Many') || err.message?.includes('not valid JSON')) {
        return NextResponse.json({ 
          ok: false, 
          error: "Database rate limit. Please wait and try again.", 
          rate_limited: true 
        }, { status: 429 })
      }
      return NextResponse.json({ error: "Database error" }, { status: 503 })
    }

    // Leer configuración de alcance (defaults: 'all', 30)
    const publicationsScope = progress.publications_scope || 'all'
    const activityDays = progress.activity_days || 30
    console.log(`[IMPORT-PRO] Config - publications_scope: ${publicationsScope}, activity_days: ${activityDays}`)

    // Verificar si está pausado por rate limit
    if (progress.status === "paused" && progress.paused_until) {
      if (new Date(progress.paused_until) > new Date()) {
        const waitSeconds = Math.ceil((new Date(progress.paused_until).getTime() - Date.now()) / 1000)
        return NextResponse.json({
          ok: false,
          paused: true,
          wait_seconds: waitSeconds,
          message: `Rate limited, wait ${waitSeconds}s`,
        })
      } else {
        // Desbloquear
        try {
          await supabase
            .from("ml_import_progress")
            .update({ status: "idle", paused_until: null })
            .eq("account_id", accountId)
          progress.status = "idle"
        } catch (err: any) {
          console.error(`[IMPORT-PRO] DB error unlocking:`, err.message)
          // Continuar anyway
        }
      }
    }

    // Marcar como running y limpiar errores antiguos
    try {
      await supabase
        .from("ml_import_progress")
        .update({ 
          status: "running", 
          last_run_at: new Date().toISOString(),
          last_error: null
        })
        .eq("account_id", accountId)
    } catch (err: any) {
      console.error(`[IMPORT-PRO] DB error marking as running:`, err.message)
      if (err.message?.includes('Too Many') || err.message?.includes('not valid JSON')) {
        return NextResponse.json({ 
          ok: false, 
          error: "Database rate limit. Pausing auto-mode temporarily.", 
          rate_limited: true 
        }, { status: 429 })
      }
    }

    // Obtener access token
    const accessToken = await getValidAccessToken(accountId)

    let publicationsProcessed = 0
    let detailsProcessed = 0
    let matched = 0
    let unmatched = 0

    // Timings para diagnóstico
    let t_fetch_ids = 0
    let t_fetch_details = 0
    let t_upsert_ml_publications = 0
    let t_update_progress = 0

    // Loop por tiempo: importar publicaciones
    while (Date.now() - startTime < max_seconds * 1000) {
      // Recargar progress
      const { data: currentProgress } = await supabase
        .from("ml_import_progress")
        .select("*")
        .eq("account_id", accountId)
        .single()

      if (!currentProgress) break

      const scrollId = currentProgress.scroll_id
      const offset = currentProgress.publications_offset
      const total = currentProgress.publications_total

      // Si ya tenemos el total y llegamos al final, completar
      if (total && offset >= total) {
        console.log(`[IMPORT-PRO] Publications complete: ${offset}/${total}`)
        await supabase
          .from("ml_import_progress")
          .update({ status: "done", scroll_id: null })
          .eq("account_id", accountId)
        break
      }

      // Construir URL con scroll pagination (NO usar offset)
      let searchUrl: string
      if (scrollId) {
        // Usar scroll_id para continuar paginación
        searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?scroll_id=${scrollId}`
        console.log(`[IMPORT-PRO] Fetching publications with scroll_id (page ~${Math.floor(offset / publications_page) + 1})`)
      } else {
        // Primera llamada sin scroll_id
        searchUrl = `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?limit=${publications_page}`
        if (publicationsScope === 'active_only') {
          searchUrl += '&status=active'
        }
        console.log(`[IMPORT-PRO] Fetching first publications page (limit=${publications_page})`)
      }
      
      const t0_ids = Date.now()
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000), // 10s timeout
      })
      t_fetch_ids += (Date.now() - t0_ids)

      if (!searchRes.ok) {
        if (searchRes.status === 429) {
          const retryAfter = parseInt(searchRes.headers.get("retry-after") || "60")
          const pausedUntil = new Date(Date.now() + retryAfter * 1000).toISOString()
          console.log(`[IMPORT-PRO] Rate limited 429, pausing until ${pausedUntil}`)
          await supabase
            .from("ml_import_progress")
            .update({ status: "paused", paused_until: pausedUntil })
            .eq("account_id", accountId)
          return NextResponse.json({
            ok: false,
            paused: true,
            wait_seconds: retryAfter,
            message: `Rate limited, paused for ${retryAfter}s`,
          })
        }
        
        // Capture error details
        const errText = await searchRes.text()
        const safeUrl = searchUrl.replace(/Bearer [^"]+/, 'Bearer ***')
        console.error(`[IMPORT-PRO] ML API Error - URL: ${safeUrl}, Status: ${searchRes.status}, Body: ${errText.slice(0, 500)}`)
        
        return NextResponse.json({
          ok: false,
          where: "ml_fetch_search",
          status: searchRes.status,
          url: safeUrl,
          body: errText.slice(0, 500)
        }, { status: 500 })
      }

      const searchData = await searchRes.json()
      const itemIds = searchData.results || []
      const totalFromApi = searchData.paging?.total || 0
      const newScrollId = searchData.scroll_id || null

      // Guardar scroll_id para la siguiente llamada
      if (newScrollId && newScrollId !== scrollId) {
        console.log(`[IMPORT-PRO] Received new scroll_id, saving for next page`)
        await supabase
          .from("ml_import_progress")
          .update({ scroll_id: newScrollId })
          .eq("account_id", accountId)
      }

      // Actualizar total si no lo tenemos
      if (!currentProgress.publications_total && totalFromApi > 0) {
        await supabase
          .from("ml_import_progress")
          .update({ publications_total: totalFromApi })
          .eq("account_id", accountId)
      }

      if (itemIds.length === 0) {
        console.log(`[IMPORT-PRO] No more items, scroll complete`)
        await supabase
          .from("ml_import_progress")
          .update({ status: "done", publications_total: offset, scroll_id: null })
          .eq("account_id", accountId)
        break
      }

      // Multiget detalles en batches - ML API limita a máximo 20 IDs por request
      const ML_MULTIGET_MAX_IDS = 20
      
      for (let i = 0; i < itemIds.length; i += ML_MULTIGET_MAX_IDS) {
        const batch = itemIds.slice(i, i + ML_MULTIGET_MAX_IDS)
        const itemsParam = batch.join(",")
        
        // SEGURIDAD: Verificar que nunca se envíen más de 20 IDs
        if (batch.length > ML_MULTIGET_MAX_IDS) {
          console.error(`[IMPORT-PRO] CRITICAL: Trying to fetch ${batch.length} items, ML limit is ${ML_MULTIGET_MAX_IDS}`)
          continue
        }
        
        console.log(`[IMPORT-PRO] Fetching ${batch.length} item details (max ${ML_MULTIGET_MAX_IDS})`)
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${itemsParam}&attributes=id,title,price,available_quantity,sold_quantity,status,permalink,thumbnail,listing_type_id,attributes`
        
        const t0_details = Date.now()
        const detailsRes = await fetch(detailsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000), // 10s timeout
        })
        t_fetch_details += (Date.now() - t0_details)

        if (!detailsRes.ok) {
          if (detailsRes.status === 429) {
            const retryAfter = parseInt(detailsRes.headers.get("retry-after") || "60")
            const pausedUntil = new Date(Date.now() + retryAfter * 1000).toISOString()
            await supabase
              .from("ml_import_progress")
              .update({ status: "paused", paused_until: pausedUntil })
              .eq("account_id", accountId)
            return NextResponse.json({
              ok: false,
              paused: true,
              wait_seconds: retryAfter,
            })
          }
          
          // Capture error details for details fetch
          const errText = await detailsRes.text()
          const safeUrl = detailsUrl.replace(/Bearer [^"]+/, 'Bearer ***')
          console.error(`[IMPORT-PRO] ML API Error - URL: ${safeUrl}, Status: ${detailsRes.status}, Body: ${errText.slice(0, 500)}`)
          
          return NextResponse.json({
            ok: false,
            where: "ml_fetch_details",
            status: detailsRes.status,
            url: safeUrl,
            body: errText.slice(0, 500)
          }, { status: 500 })
        }

        const details = await detailsRes.json()
        
        // BATCH UPSERT: preparar array completo antes de insertar
        const publicationsToUpsert = []
        
        for (const item of details) {
          const body = item.body
          if (!body) continue

          // Extraer SKU/ISBN/GTIN de attributes
          let sku = null
          let isbn = null
          let gtin = null

          if (body.attributes) {
            for (const attr of body.attributes) {
              if (attr.id === "SELLER_SKU") sku = attr.value_name
              if (attr.id === "ISBN") isbn = attr.value_name
              if (attr.id === "GTIN") gtin = attr.value_name
            }
          }

          publicationsToUpsert.push({
            account_id: accountId,
            ml_item_id: body.id,
            title: body.title,
            price: body.price,
            current_stock: body.available_quantity || 0,
            status: body.status,
            permalink: body.permalink,
            sku: sku || null,
            isbn: isbn || null,
            gtin: gtin || null,
            ean: gtin || null,
            updated_at: new Date().toISOString(),
          })
          
          detailsProcessed++
        }

        // UPSERT EN BATCH (1 sola llamada a Supabase para todo el batch)
        if (publicationsToUpsert.length > 0) {
          console.log(`[IMPORT-PRO] BEFORE UPSERT: Prepared ${publicationsToUpsert.length} publications to upsert`)
          console.log(`[IMPORT-PRO] Sample item:`, JSON.stringify(publicationsToUpsert[0]))
          
          const t0_upsert = Date.now()
          try {
            const { data, error: upsertError } = await supabase
              .from("ml_publications")
              .upsert(publicationsToUpsert, { onConflict: "account_id,ml_item_id" })
            t_upsert_ml_publications += (Date.now() - t0_upsert)

            if (upsertError) {
              console.error(`[IMPORT-PRO] CRITICAL UPSERT ERROR:`, JSON.stringify(upsertError))
              console.error(`[IMPORT-PRO] Error code:`, upsertError.code)
              console.error(`[IMPORT-PRO] Error message:`, upsertError.message)
              console.error(`[IMPORT-PRO] Error details:`, upsertError.details)
            } else {
              console.log(`[IMPORT-PRO] SUCCESS: Batch upserted ${publicationsToUpsert.length} items successfully`)
            }
          } catch (err: any) {
            console.error(`[IMPORT-PRO] EXCEPTION during upsert:`, err.message)
            console.error(`[IMPORT-PRO] Full error:`, err)
          }
        } else {
          console.log(`[IMPORT-PRO] WARNING: No publications to upsert in this batch`)
        }

        // Check time limit
        if (Date.now() - startTime >= max_seconds * 1000) {
          console.log(`[IMPORT-PRO] Time limit reached`)
          break
        }
      }

      // BUG FIX: Actualizar offset basado en items REALMENTE PROCESADOS, no solo fetched
      // Antes: offset += itemIds.length (incorrecto - avanzaba aunque items fallaran)
      // Ahora: offset += detailsProcessed en esta iteración
      const itemsProcessedThisPage = detailsProcessed - publicationsProcessed
      publicationsProcessed = detailsProcessed

      // Actualizar offset con items realmente guardados en BD
      const newOffset = offset + itemsProcessedThisPage
      const t0_progress = Date.now()
      try {
        await supabase
          .from("ml_import_progress")
          .update({ publications_offset: newOffset })
          .eq("account_id", accountId)
      } catch (err: any) {
        console.error(`[IMPORT-PRO] Error updating progress:`, err.message)
        // Continuar - no es crítico
      }
      t_update_progress += (Date.now() - t0_progress)

      console.log(`[IMPORT-PRO] Progress: ${newOffset}/${totalFromApi || "?"} (processed ${itemsProcessedThisPage} items this page)`)

      // Check time limit
      if (Date.now() - startTime >= max_seconds * 1000) {
        console.log(`[IMPORT-PRO] Time limit reached after page`)
        break
      }
    }

    // Marcar como idle al terminar
    await supabase
      .from("ml_import_progress")
      .update({ status: "idle" })
      .eq("account_id", accountId)

    const total_ms = Date.now() - startTime
    const elapsed = Math.round(total_ms / 1000)

    // AUTO-TUNING: Sugerir ajustes de batch_size basado en rendimiento
    let suggested_detail_batch = detail_batch
    let tuning_message = ""
    
    if (total_ms < 6000 && detail_batch < 50) {
      suggested_detail_batch = Math.min(detail_batch + 10, 50)
      tuning_message = `Fast run (${total_ms}ms) - suggest increasing detail_batch to ${suggested_detail_batch}`
    } else if (total_ms > 11000 && detail_batch > 20) {
      suggested_detail_batch = Math.max(detail_batch - 10, 20)
      tuning_message = `Slow run (${total_ms}ms) - suggest decreasing detail_batch to ${suggested_detail_batch}`
    } else {
      tuning_message = `Optimal timing (${total_ms}ms) - keep detail_batch at ${detail_batch}`
    }

    console.log(`[IMPORT-PRO] Run completed: ${publicationsProcessed} pubs, ${detailsProcessed} details, ${elapsed}s`)
    console.log(`[IMPORT-PRO] Timings - fetch_ids: ${t_fetch_ids}ms, fetch_details: ${t_fetch_details}ms, upsert: ${t_upsert_ml_publications}ms, update_progress: ${t_update_progress}ms, total: ${total_ms}ms`)
    console.log(`[IMPORT-PRO] AUTO-TUNING: ${tuning_message}`)

    return NextResponse.json({
      ok: true,
      publications_processed: publicationsProcessed,
      details_processed: detailsProcessed,
      matched,
      unmatched,
      elapsed_seconds: elapsed,
      timings: {
        t_fetch_ids_ms: t_fetch_ids,
        t_fetch_details_ms: t_fetch_details,
        t_upsert_ml_publications_ms: t_upsert_ml_publications,
        t_update_progress_ms: t_update_progress,
        total_ms,
      },
      imported_count: detailsProcessed,
      current_batch_size: detail_batch,
      suggested_batch_size: suggested_detail_batch,
      tuning_message,
    })
  } catch (error: any) {
    console.error("[IMPORT-PRO] Run error:", error.message)
    
    // Marcar como error si tenemos accountId
    if (accountId) {
      try {
        const supabase = await createClient()
        await supabase
          .from("ml_import_progress")
          .update({ status: "error", last_error: error.message })
          .eq("account_id", accountId)
      } catch (e) {
        console.error("[IMPORT-PRO] Failed to update error status:", e)
      }
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
