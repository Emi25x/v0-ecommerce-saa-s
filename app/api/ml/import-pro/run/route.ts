import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import-pro/run
 * Ejecuta un ciclo de importación por tiempo limitado
 * Body: { account_id, max_seconds: 20, publications_page: 50, detail_batch: 20 }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let accountId: string | null = null
  
  try {
    const body = await request.json()
    const {
      account_id,
      max_seconds = 20,
      publications_page = 50,
      detail_batch = 20,
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
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", accountId)
      .single()

    if (accountError || !account) {
      console.error(`[IMPORT-PRO] Account not found:`, accountError)
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    console.log(`[IMPORT-PRO] Access granted for account ${accountId}`)

    let { data: progress, error: progressError } = await supabase
      .from("ml_import_progress")
      .select("*")
      .eq("account_id", accountId)
      .single()

    if (progressError || !progress) {
      return NextResponse.json({ error: "Progress not found" }, { status: 404 })
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
        await supabase
          .from("ml_import_progress")
          .update({ status: "idle", paused_until: null })
          .eq("account_id", accountId)
        progress.status = "idle"
      }
    }

    // Marcar como running y limpiar errores antiguos
    await supabase
      .from("ml_import_progress")
      .update({ 
        status: "running", 
        last_run_at: new Date().toISOString(),
        last_error: null
      })
      .eq("account_id", accountId)

    // Obtener access token
    const accessToken = await getValidAccessToken(accountId)

    let publicationsProcessed = 0
    let detailsProcessed = 0
    let matched = 0
    let unmatched = 0

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
      
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

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

      // Multiget detalles en batches
      for (let i = 0; i < itemIds.length; i += detail_batch) {
        const batch = itemIds.slice(i, i + detail_batch)
        const itemsParam = batch.join(",")
        
        console.log(`[IMPORT-PRO] Fetching ${batch.length} item details`)
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${itemsParam}&attributes=id,title,price,available_quantity,sold_quantity,status,permalink,thumbnail,listing_type_id,attributes`
        const detailsRes = await fetch(detailsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

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

          // Upsert en ml_publications
          const { error: upsertError } = await supabase
            .from("ml_publications")
            .upsert(
              {
                account_id: accountId,
                ml_item_id: body.id,
                title: body.title,
                price: body.price,
                available_quantity: body.available_quantity,
                sold_quantity: body.sold_quantity,
                status: body.status,
                permalink: body.permalink,
                thumbnail: body.thumbnail,
                listing_type_id: body.listing_type_id,
                sku,
                isbn,
                gtin,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "account_id,ml_item_id" }
            )

          if (upsertError) {
            console.error(`[IMPORT-PRO] Upsert error for ${body.id}:`, upsertError)
            continue
          }

          detailsProcessed++

          // Intentar matchear con products por SKU/ISBN/GTIN
          if (sku || isbn || gtin) {
            const { data: product } = await supabase
              .from("products")
              .select("id")
              .or(`sku.eq.${sku || ""},isbn.eq.${isbn || ""},gtin.eq.${gtin || ""}`)
              .limit(1)
              .maybeSingle()

            if (product) {
              // Link encontrado
              await supabase
                .from("ml_publications")
                .update({ product_id: product.id })
                .eq("ml_item_id", body.id)
                .eq("account_id", accountId)
              matched++
            } else {
              unmatched++
            }
          } else {
            unmatched++
          }
        }

        // Check time limit
        if (Date.now() - startTime >= max_seconds * 1000) {
          console.log(`[IMPORT-PRO] Time limit reached`)
          break
        }
      }

      publicationsProcessed += itemIds.length

      // Actualizar offset
      const newOffset = offset + itemIds.length
      await supabase
        .from("ml_import_progress")
        .update({ publications_offset: newOffset })
        .eq("account_id", accountId)

      console.log(`[IMPORT-PRO] Progress: ${newOffset}/${totalFromApi || "?"}`)

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

    const elapsed = Math.round((Date.now() - startTime) / 1000)

    console.log(`[IMPORT-PRO] Run completed: ${publicationsProcessed} pubs, ${detailsProcessed} details, ${matched} matched, ${unmatched} unmatched, ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      publications_processed: publicationsProcessed,
      details_processed: detailsProcessed,
      matched,
      unmatched,
      elapsed_seconds: elapsed,
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
