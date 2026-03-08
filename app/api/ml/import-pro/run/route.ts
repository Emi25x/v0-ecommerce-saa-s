import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"

export const maxDuration = 60

// ML API hard limits
const ML_SCAN_PAGE_SIZE   = 50   // search_type=scan: máximo real permitido
const ML_MULTIGET_MAX_IDS = 20   // /items?ids=...: máximo 20 por request (ML API limit)
const ML_ATTRIBUTES       = "id,title,price,available_quantity,sold_quantity,status,permalink,thumbnail,listing_type_id,seller_custom_field,attributes,variations,shipping,tags,catalog_listing,catalog_listing_eligible"

// ── Retry con backoff exponencial ────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries = 3,
): Promise<{ res: Response | null; rateLimited: boolean; retryAfter: number }> {
  let attempt = 0
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(12000),
      })

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "60")
        return { res, rateLimited: true, retryAfter }
      }

      if (res.status >= 500 && attempt < maxRetries - 1) {
        const wait = 300 * 2 ** attempt  // 300ms, 600ms, 1200ms
        await new Promise(r => setTimeout(r, wait))
        attempt++
        continue
      }

      return { res, rateLimited: false, retryAfter: 0 }
    } catch {
      if (attempt < maxRetries - 1) {
        const wait = 300 * 2 ** attempt
        await new Promise(r => setTimeout(r, wait))
        attempt++
        continue
      }
      return { res: null, rateLimited: false, retryAfter: 0 }
    }
  }
  return { res: null, rateLimited: false, retryAfter: 0 }
}

// ── Pool de concurrencia ─────────────────────────────────────────────────────
async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let idx = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() }
      } catch (e: any) {
        results[i] = { status: "rejected", reason: e }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

/**
 * POST /api/ml/import-pro/run
 *
 * Body: {
 *   account_id: string
 *   max_seconds?:  number   default 12
 *   detail_batch?: number   default 50 (clamp 1..50)
 *   concurrency?:  number   default 2
 * }
 *
 * Response: {
 *   ok: boolean
 *   imported_count: number
 *   elapsed_ms: number
 *   has_more: boolean
 *   last_scroll_id: string | null
 *   errors_count: number
 *   rate_limited: boolean
 * }
 */
export async function POST(request: NextRequest) {
  const authCheck = await protectAPI()
  if (authCheck.error) return authCheck.response

  const startTime = Date.now()
  let accountId: string | null = null

  try {
    const body = await request.json()
    const {
      account_id,
      max_seconds  = 12,
      detail_batch = 50,
      concurrency  = 2,
    } = body

    accountId = account_id
    // detail_batch clamped a 1..20 (límite real del multiget de ML: máximo 20 IDs por request)
    const batchSize = Math.min(ML_MULTIGET_MAX_IDS, Math.max(1, detail_batch))

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient({ useServiceRole: true })

    // ── Verificar cuenta ─────────────────────────────────────────────────────
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle()

    if (accountError) {
      return NextResponse.json({ error: "Database error", details: accountError.message }, { status: 503 })
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // ── Verificar progress ───────────────────────────────────────────────────
    const { data: progress, error: progressError } = await supabase
      .from("ml_import_progress")
      .select("*")
      .eq("account_id", accountId)
      .single()

    if (progressError || !progress) {
      return NextResponse.json({ error: "Progress not found. Initialize the import first." }, { status: 404 })
    }

    // ── Comprobar pausa por rate-limit ───────────────────────────────────────
    if (progress.status === "paused" && progress.paused_until) {
      if (new Date(progress.paused_until) > new Date()) {
        const waitSeconds = Math.ceil((new Date(progress.paused_until).getTime() - Date.now()) / 1000)
        return NextResponse.json({
          ok: false, rate_limited: true,
          wait_seconds: waitSeconds,
          message: `Rate limited, resume in ${waitSeconds}s`,
        })
      }
      // Desbloquear
      await supabase
        .from("ml_import_progress")
        .update({ status: "idle", paused_until: null })
        .eq("account_id", accountId)
    }

    // ── Marcar como running ──────────────────────────────────────────────────
    await supabase
      .from("ml_import_progress")
      .update({ status: "running", last_run_at: new Date().toISOString(), last_error: null })
      .eq("account_id", accountId)

    const accessToken  = await getValidAccessToken(accountId)
    const authHeader   = { Authorization: `Bearer ${accessToken}` }
    const publicationsScope = progress.publications_scope || "all"

    let importedCount   = 0   // filas realmente persistidas en DB en esta corrida
    let mlSeenCount     = 0   // IDs vistos en ML en esta corrida
    let errorsCount     = 0
    let rateLimited     = false
    let hasMore         = true
    let lastScrollId: string | null = progress.scroll_id || null
    let consecutiveZeroRuns = 0  // contador de runs consecutivos con 0 items de ML

    // ── Loop principal por tiempo ─────────────────────────────────────────────
    while (Date.now() - startTime < max_seconds * 1000) {

      // Reload progress para leer el scroll_id actualizado
      const { data: cur } = await supabase
        .from("ml_import_progress")
        .select("scroll_id, publications_offset, publications_total")
        .eq("account_id", accountId)
        .single()

      if (!cur) break
      const scrollId = cur.scroll_id as string | null
      const offset   = cur.publications_offset as number

      // ── Paso 1: Obtener IDs de publicaciones via search_type=scan ────────
      // pageSize siempre = ML_SCAN_PAGE_SIZE (50). No pedir más.
      const searchUrl = scrollId
        ? `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&scroll_id=${scrollId}`
        : `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&limit=${ML_SCAN_PAGE_SIZE}${publicationsScope === "active_only" ? "&status=active" : ""}`

      const { res: searchRes, rateLimited: rl429, retryAfter } = await fetchWithRetry(searchUrl, authHeader)

      if (rl429) {
        const pausedUntil = new Date(Date.now() + retryAfter * 1000).toISOString()
        await supabase
          .from("ml_import_progress")
          .update({ status: "paused", paused_until: pausedUntil, scroll_id: lastScrollId })
          .eq("account_id", accountId)
        rateLimited = true
        break
      }

      if (!searchRes || !searchRes.ok) {
        errorsCount++
        const errStatus = searchRes?.status ?? 0
        const errBody   = searchRes ? await searchRes.text().catch(() => "") : "no response"

        // 401 = token expirado — renovar y reintentar una vez antes de abortar
        if (errStatus === 401) {
          try {
            const newToken = await getValidAccessToken(accountId)
            authHeader.Authorization = `Bearer ${newToken}`
            // Continuar el loop — la próxima iteración usará el token renovado
            await supabase
              .from("ml_import_progress")
              .update({ last_error: "Token ML renovado automáticamente (401)", last_error_at: new Date().toISOString() })
              .eq("account_id", accountId)
            continue
          } catch {
            // Si la renovación falla, abortar
          }
        }

        await supabase
          .from("ml_import_progress")
          .update({
            last_error:    `Search scan falló (HTTP ${errStatus}): ${errBody.slice(0, 300)}`,
            last_error_at: new Date().toISOString(),
          })
          .eq("account_id", accountId)
        break
      }

      const searchData  = await searchRes.json()
      const itemIds: string[] = searchData.results || []
      const newScrollId: string | null = searchData.scroll_id || null
      const totalFromApi: number = searchData.paging?.total || 0

      // Acumular IDs vistos en ML (independiente del upsert)
      mlSeenCount += itemIds.length

      // ── Safety check: si hay 0 items, incrementar contador ──────────────────
      // Si la cuenta quedó desconectada o el token inválido, ML devuelve []
      // Si esto ocurre 3 veces seguidas en la misma invocación, es que algo broke
      if (itemIds.length === 0) {
        consecutiveZeroRuns++
        if (consecutiveZeroRuns >= 3) {
          // Algo está severamente roto — fuerza reset total
          await supabase
            .from("ml_import_progress")
            .update({
              status:                 "idle",
              scroll_id:              null,
              publications_offset:    0,
              publications_total:     0,
              ml_items_seen_count:    0,
              db_rows_upserted_count: 0,
              upsert_errors_count:    0,
              last_error:             "Detección automática: 3 scans consecutivos sin items. Estado corrupto. Reset total.",
              last_error_at:          new Date().toISOString(),
            })
            .eq("account_id", accountId)
          break
        }
      } else {
        consecutiveZeroRuns = 0  // Reset el contador si hay items
      }

      // scan termina cuando results vacío — pero hay que distinguir entre
      // "terminé de verdad" y "scroll expiró antes de terminar"
      if (itemIds.length === 0) {
        // Re-leer contadores acumulados para la verificación de salud
        const { data: auditRow } = await supabase
          .from("ml_import_progress")
          .select("ml_items_seen_count, db_rows_upserted_count, publications_total, publications_offset")
          .eq("account_id", accountId)
          .single()

        const totalSeen     = auditRow?.ml_items_seen_count    ?? 0
        const totalUpserted = auditRow?.db_rows_upserted_count ?? 0
        const mlTotal       = auditRow?.publications_total ?? totalFromApi ?? 0  // fallback a totalFromApi si es null
        const currentOffset = auditRow?.publications_offset    ?? 0

        // ── Guardar totalFromApi si mlTotal estaba null ──────────────────────────
        // Esto asegura que publications_total NUNCA queda en null
        if (!auditRow?.publications_total && totalFromApi > 0) {
          await supabase
            .from("ml_import_progress")
            .update({ publications_total: totalFromApi })
            .eq("account_id", accountId)
        }

        // ── Detectar scroll expirado ──────────────────────────────────────────
        // Si el total ML conocido es > 0 y solo procesamos < 95% de esas publicaciones,
        // el scroll probablemente expiró (ML los descarta después de ~10 minutos inactivos).
        // En ese caso, limpiar el scroll_id para que la próxima invocación
        // comience un scan nuevo desde el principio — el upsert con onConflict
        // garantiza que no se duplican registros.
        const pctCovered = mlTotal > 0 ? (totalSeen / mlTotal) : 1
        const scrollExpired = mlTotal > 0 && pctCovered < 0.95

        if (scrollExpired) {
          // Scroll expirado — hacer reset PARCIAL: resetear posición pero PRESERVAR publications_total
          // porque ya lo calculamos en ML (necesario para matching y tracking posterior)
          console.log(`[v0] import-pro: Scroll expirado. Reseteando posición pero preservando publications_total=${mlTotal}`)
          await supabase
            .from("ml_import_progress")
            .update({
              status:                 "idle",
              scroll_id:              null,
              publications_offset:    0,
              // NO reseteamos publications_total — lo preservamos para auditoría
              ml_items_seen_count:    0,
              db_rows_upserted_count: 0,
              upsert_errors_count:    0,
              last_error:             `Scroll ML expirado al ${Math.round(pctCovered * 100)}% (${totalSeen}/${mlTotal}). Reset total iniciado.`,
              last_error_at:          new Date().toISOString(),
            })
            .eq("account_id", accountId)
          hasMore = true
          break
        }

        // ── Scan completo ─────────────────────────────────────────────────────
        hasMore = false

        // Solo marcar done si persistimos ≥90% de lo visto
        const upsertHealthy = totalSeen === 0 || (totalUpserted / totalSeen) >= 0.9
        const finalStatus   = upsertHealthy ? "done" : "scan_complete_pending_verification"

        await supabase
          .from("ml_import_progress")
          .update({
            status:      finalStatus,
            scroll_id:   null,
            finished_at: new Date().toISOString(),
            last_error:  null,
          })
          .eq("account_id", accountId)
        break
      }

      // Guardar nuevo scroll_id inmediatamente
      if (newScrollId && newScrollId !== scrollId) {
        lastScrollId = newScrollId
        await supabase
          .from("ml_import_progress")
          .update({ scroll_id: newScrollId })
          .eq("account_id", accountId)
      }

      // Guardar total siempre que ML lo reporte (actualizar si mejoró, nunca bajar a 0)
      if (totalFromApi > 0 && totalFromApi > (cur.publications_total ?? 0)) {
        await supabase
          .from("ml_import_progress")
          .update({ publications_total: totalFromApi })
          .eq("account_id", accountId)
      }

      // ── Paso 2: Hidratar items con multiget en paralelo ──────────────────
      // Dividir itemIds en batches de batchSize (max 20 IDs por batch)
      const batches: string[][] = []
      for (let i = 0; i < itemIds.length; i += batchSize) {
        batches.push(itemIds.slice(i, i + batchSize))
      }

      // Construir tareas de multiget
      const multigetTasks = batches.map(batch => async () => {
        const idsParam   = batch.join(",")
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=${ML_ATTRIBUTES}`
        const { res, rateLimited: rl } = await fetchWithRetry(detailsUrl, authHeader)

        if (rl) return { rateLimited: true, items: [], errorMsg: null }
        if (!res || !res.ok) {
          const errStatus = res?.status ?? 0
          const errBody   = res ? await res.text().catch(() => "") : "no response"
          return { rateLimited: false, items: [], errorMsg: `multiget HTTP ${errStatus}: ${errBody.slice(0, 200)}` }
        }

        const data = await res.json()
        return { rateLimited: false, items: Array.isArray(data) ? data : [], errorMsg: null }
      })

      // Ejecutar con pool de concurrencia controlada
      const multigetResults = await runPool(multigetTasks, concurrency)

      // ── Paso 3: Preparar upsert batch ────────────────────────────────────
      const toUpsert: any[] = []
      const now = new Date().toISOString()

      // Recolectar errores de multiget para diagnóstico
      const multigetErrors: string[] = []

      console.log(`[v0] Batch multiget: itemIds.length=${itemIds.length}, batches=${batches.length}, results=${multigetResults.length}`)

      for (const result of multigetResults) {
        if (result.status !== "fulfilled") { 
          errorsCount++
          console.log(`[v0] Multiget task rejected: ${result.reason}`)
          continue 
        }
        const { rateLimited: batchRl, items, errorMsg } = result.value

        if (errorMsg) {
          multigetErrors.push(errorMsg)
          console.log(`[v0] Multiget error: ${errorMsg}`)
        }
        if (batchRl) { 
          rateLimited = true
          console.log(`[v0] Rate limited en batch de multiget`)
          continue 
        }

        for (const item of items) {
          const b = item.body
          if (!b) continue

          let sku: string | null = null
          let isbn: string | null = null
          let gtin: string | null = null
          let ean: string | null = null
          let weightG: number | null = null

          // ── Helper: extraer atributos de un array genérico de ML ────────────
          function extractAttrs(attrs: any[]) {
            for (const attr of attrs) {
              const val = attr.value_name ?? null
              if (!val) continue
              switch (attr.id) {
                case "SELLER_SKU": if (!sku)  sku  = val; break
                case "ISBN":       if (!isbn) isbn = val; break
                // ML usa tanto "GTIN" como "GTIN_CODE" según la categoría
                case "GTIN":
                case "GTIN_CODE":  if (!gtin) gtin = val; break
                case "EAN":        if (!ean)  ean  = val; break
                case "WEIGHT": {
                  if (weightG != null) break   // ya tenemos un valor
                  const vs = attr.value_struct
                  if (vs?.number != null && isFinite(vs.number) && vs.number > 0) {
                    const unit = (vs.unit ?? "g").toLowerCase()
                    weightG = unit === "kg" ? Math.round(vs.number * 1000) : Math.round(vs.number)
                  } else if (val) {
                    const m = val.match(/^([\d.]+)\s*(g|kg)?/i)
                    if (m) {
                      const n = parseFloat(m[1])
                      weightG = (m[2] ?? "g").toLowerCase() === "kg"
                        ? Math.round(n * 1000)
                        : Math.round(n)
                    }
                  }
                  break
                }
              }
            }
          }

          // 1. Atributos a nivel item
          if (Array.isArray(b.attributes)) extractAttrs(b.attributes)

          // 2. seller_custom_field directo en el item — fuente más confiable de SKU
          if (b.seller_custom_field) sku = b.seller_custom_field

          // 3. shipping.dimensions.weight — fuente más precisa de peso
          const dimW = b?.shipping?.dimensions?.weight
          if (dimW != null && weightG == null) {
            const n = typeof dimW === "string" ? parseFloat(dimW) : dimW
            if (isFinite(n) && n > 0) weightG = Math.round(n)
          }

          // 4. Variaciones: recorrer para obtener SKU/EAN/ISBN/GTIN faltantes
          if (Array.isArray(b.variations) && b.variations.length > 0) {
            for (const v of b.variations) {
              // seller_custom_field a nivel variación
              if (!sku && v.seller_custom_field) sku = v.seller_custom_field

              // atributos dentro de cada variación (ISBN, EAN, GTIN pueden estar aquí)
              if (Array.isArray(v.attributes)) extractAttrs(v.attributes)

              // Si ya tenemos todos los datos buscados no hace falta seguir
              if (sku && ean && isbn && gtin && weightG != null) break
            }
          }

          // 5. EAN fallback: usar GTIN si no hay EAN dedicado
          if (!ean && gtin) ean = gtin

          // 6. catalog_listing_eligible: campo top-level OR derivar de tags
          // ML a veces solo lo expone via tags cuando se usa el multiget con atributos
          let catalogEligible: boolean = b.catalog_listing_eligible ?? false
          if (!catalogEligible && Array.isArray(b.tags)) {
            catalogEligible = b.tags.includes("catalog_listing_eligible")
          }
          const catalogListing: boolean = b.catalog_listing ?? false

          toUpsert.push({
            account_id:               accountId,
            ml_item_id:               b.id,
            title:                    b.title,
            price:                    b.price,
            current_stock:            b.available_quantity ?? 0,
            status:                   b.status,
            permalink:                b.permalink,
            sku,
            isbn,
            gtin,
            ean,
            catalog_listing:          catalogListing,
            catalog_listing_eligible: catalogEligible,
            ...(weightG != null ? { meli_weight_g: weightG } : {}),
            last_sync_at:             now,
            updated_at:               now,
          })
        }
      }

      // ── Paso 4: Upsert en Supabase (un solo batch) ───────────────────────
      let batchUpserted = 0  // filas realmente guardadas en DB en este batch

      // Diagnóstico: si teníamos itemIds pero no tenemos nada para guardar
      if (itemIds.length > 0 && toUpsert.length === 0) {
        console.warn(`[v0] DIAGNÓSTICO: itemIds.length=${itemIds.length}, pero toUpsert.length=0. Batch sin items hidratados.`)
        console.warn(`[v0] multigetErrors.length=${multigetErrors.length}, multigetResults.length=${multigetResults.length}`)
        console.warn(`[v0] Posibles causas: ML API devolvió items vacíos, o todos los items fueron filtrados.`)
        
        // Registrar warning en BD
        await supabase
          .from("ml_import_progress")
          .update({
            last_error:    `Batch sin items hidratados: vimos ${itemIds.length} IDs pero no se persistió ninguno. Errores multiget: ${multigetErrors.length}`,
            last_error_at: new Date().toISOString(),
          })
          .eq("account_id", accountId)
      }

      // Si el multiget falló y no tenemos nada para guardar, registrar el error
      if (toUpsert.length === 0 && multigetErrors.length > 0) {
        await supabase
          .from("ml_import_progress")
          .update({
            last_error:    `Multiget falló (${multigetErrors.length} batch/es): ${multigetErrors[0]}`,
            last_error_at: new Date().toISOString(),
          })
          .eq("account_id", accountId)
      }

      if (toUpsert.length > 0) {
        console.log(`[v0] Upsertando ${toUpsert.length} items a DB...`)
        const { error: upsertError, count: upsertCount } = await supabase
          .from("ml_publications")
          .upsert(toUpsert, { onConflict: "account_id,ml_item_id", count: "exact" })

        batchUpserted = upsertCount ?? toUpsert.length
        console.log(`[v0] Upsert completado: ${batchUpserted} filas afectadas`)

        if (upsertError) {
          // Upsert falló completamente — no avanzar offset, registrar error claro
          errorsCount += toUpsert.length
          console.error(`[v0] ERROR en upsert:`, upsertError.message)
          await supabase
            .from("ml_import_progress")
            .update({
              last_error:    `Upsert falló (${toUpsert.length} filas no guardadas): ${upsertError.message}`,
              last_error_at: new Date().toISOString(),
            })
            .eq("account_id", accountId)
          // batchUpserted queda en 0 — offset NO avanza
        } else {
          // Usar el count real devuelto por Supabase cuando está disponible.
          // Si count es null (driver no lo soporta), usar toUpsert.length como fallback
          // ya que la ausencia de error significa que todas las filas se procesaron.
          batchUpserted  = upsertCount ?? toUpsert.length
          importedCount += batchUpserted

          // Si el count real es menor que lo enviado, registrar la discrepancia
          if (upsertCount !== null && upsertCount < toUpsert.length) {
            const missing = toUpsert.length - upsertCount
            errorsCount += missing
            await supabase
              .from("ml_import_progress")
              .update({
                last_error:    `Upsert parcial: ${upsertCount}/${toUpsert.length} filas guardadas (${missing} sin confirmar)`,
                last_error_at: new Date().toISOString(),
              })
              .eq("account_id", accountId)
          }
        }
      }

      // Actualizar offset: avanzar por itemIds visto, incluso si toUpsert quedó vacío
      // (esto evita loops infinitos cuando el multiget no devuelve datos)
      let offsetAdvance = batchUpserted
      if (itemIds.length > 0 && toUpsert.length === 0 && batchUpserted === 0) {
        offsetAdvance = itemIds.length  // Avanzar por los IDs vistos, aunque no se persistieron
        console.warn(`[v0] WARNING: itemIds.length=${itemIds.length} pero toUpsert.length=0. Avanzando offset por itemIds para evitar loop.`)
      }
      const newOffset = offset + offsetAdvance

      // Re-leer los contadores acumulados para incrementar correctamente
      // (el loop puede ejecutar múltiples iteraciones con el mismo `progress` snapshot)
      const { data: curCounts } = await supabase
        .from("ml_import_progress")
        .select("upsert_new_count, fetched_count, discovered_count, request_count, ml_items_seen_count, db_rows_upserted_count, upsert_errors_count")
        .eq("account_id", accountId)
        .single()

      // filas enviadas al upsert que NO quedaron confirmadas en DB
      const batchErrors = Math.max(0, toUpsert.length - batchUpserted)

      const progressUpdate: Record<string, any> = {
        publications_offset:    newOffset,
        upsert_new_count:       (curCounts?.upsert_new_count    ?? 0) + batchUpserted,
        fetched_count:          (curCounts?.fetched_count       ?? 0) + toUpsert.length,
        discovered_count:       (curCounts?.discovered_count    ?? 0) + itemIds.length,
        request_count:          (curCounts?.request_count       ?? 0) + 1,
        // audit columns — track seen vs actually persisted
        ml_items_seen_count:    (curCounts?.ml_items_seen_count    ?? 0) + itemIds.length,
        db_rows_upserted_count: (curCounts?.db_rows_upserted_count ?? 0) + batchUpserted,
        upsert_errors_count:    (curCounts?.upsert_errors_count    ?? 0) + batchErrors,
        last_sync_batch_at:     new Date().toISOString(),
      }

      // Log consolidado del batch
      console.log(`[v0] Batch completado: itemIds=${itemIds.length}, toUpsert=${toUpsert.length}, batchUpserted=${batchUpserted}, batchErrors=${batchErrors}, multigetErrors=${multigetErrors.length}`)

      // Si el batch fue exitoso y sin errores, limpiar el último error
      if (batchErrors === 0 && toUpsert.length > 0) {
        progressUpdate.last_error    = null
        progressUpdate.last_error_at = null
      }

      // IMPORTANTE: publications_total NUNCA debe ser null
      // Si no se actualizó en este batch, preservar el valor anterior
      // Si el anterior también era null, usar 0 como default seguro
      if (!progressUpdate.publications_total) {
        progressUpdate.publications_total = progress.publications_total || 0
      }

      await supabase
        .from("ml_import_progress")
        .update(progressUpdate)
        .eq("account_id", accountId)

      if (rateLimited) break

      // Check tiempo antes de la siguiente página
      if (Date.now() - startTime >= max_seconds * 1000) break
    }

    // ── Leer scroll_id final para la respuesta ───────────────────────────────
    const { data: finalProg } = await supabase
      .from("ml_import_progress")
      .select("scroll_id, status")
      .eq("account_id", accountId)
      .single()

    const finalScrollId = finalProg?.scroll_id ?? null
    const isDone        = finalProg?.status === "done"

    // Marcar idle si no terminó con done/paused
    if (!isDone && !rateLimited) {
      await supabase
        .from("ml_import_progress")
        .update({ status: "idle" })
        .eq("account_id", accountId)
    }

    const elapsed_ms = Date.now() - startTime

    // Leer contadores finales para la respuesta
    const { data: finalCounts } = await supabase
      .from("ml_import_progress")
      .select("ml_items_seen_count, db_rows_upserted_count, upsert_errors_count, publications_total")
      .eq("account_id", accountId)
      .single()

    // ── DISPARAR MATCHER AUTOMÁTICAMENTE si importamos algo nuevo ──────────────
    if (importedCount > 0) {
      console.log("[v0] import-pro: Disparando matcher automáticamente después de importar", importedCount, "items")
      try {
        // Construir URL correctamente para llamar al matcher
        // En producción: https://domain.vercel.app/api/ml/matcher/run
        // En desarrollo: http://localhost:3000/api/ml/matcher/run
        let matcherBaseUrl = "http://localhost:3000"
        
        // Si estamos en Vercel, usar la URL real
        if (process.env.NEXT_PUBLIC_VERCEL_URL) {
          matcherBaseUrl = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        } else if (process.env.VERCEL_URL) {
          matcherBaseUrl = `https://${process.env.VERCEL_URL}`
        }
        
        const matcherUrl = `${matcherBaseUrl}/api/ml/matcher/run`
        console.log(`[v0] Matcher URL: ${matcherUrl}`)
        
        const matcherResponse = await fetch(matcherUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            account_id: accountId,
            max_seconds: 20,
            batch_size: 300,
          }),
        })
        
        if (!matcherResponse.ok) {
          const errorText = await matcherResponse.text()
          console.error(`[v0] Matcher HTTP error: ${matcherResponse.status}`, errorText.substring(0, 200))
        } else {
          const matcherResult = await matcherResponse.json()
          console.log("[v0] Matcher ejecutado:", { ok: matcherResult.ok, processed: matcherResult.processed, matched: matcherResult.matched })
        }
      } catch (matcherError: any) {
        console.error("[v0] Error disparando matcher:", matcherError.message)
        // No bloqueamos el import si falla el matcher
      }
    }

    // Log final consolidado
    console.log(`[v0] import-pro FINAL: imported=${importedCount}, seen=${mlSeenCount}, total_seen=${finalCounts?.ml_items_seen_count ?? 0}, total_upserted=${finalCounts?.db_rows_upserted_count ?? 0}, errors=${errorsCount}, rate_limited=${rateLimited}, has_more=${hasMore && !isDone}`)

    return NextResponse.json({
      ok:                     true,
      imported_count:         importedCount,                           // filas persistidas en esta corrida
      ml_items_seen_count:    mlSeenCount,                             // IDs vistos en ML en esta corrida
      db_rows_upserted:       importedCount,
      // totales acumulados en DB
      total_seen:             finalCounts?.ml_items_seen_count    ?? 0,
      total_upserted:         finalCounts?.db_rows_upserted_count ?? 0,
      total_upsert_errors:    finalCounts?.upsert_errors_count    ?? 0,
      ml_total:               finalCounts?.publications_total     ?? 0,
      db_gap:                 (finalCounts?.publications_total ?? 0) - (finalCounts?.db_rows_upserted_count ?? 0),
      elapsed_ms,
      has_more:               hasMore && !isDone,
      last_scroll_id:         finalScrollId,
      errors_count:           errorsCount,
      rate_limited:           rateLimited,
    })

  } catch (error: any) {
    if (accountId) {
      try {
        const supabase = await createClient({ useServiceRole: true })
        await supabase
          .from("ml_import_progress")
          .update({ status: "error", last_error: error.message })
          .eq("account_id", accountId)
      } catch { /* ignorar */ }
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
