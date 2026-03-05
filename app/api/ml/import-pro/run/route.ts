import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"

export const maxDuration = 60

// ML API hard limits
const ML_SCAN_PAGE_SIZE   = 50   // search_type=scan: máximo real permitido
const ML_MULTIGET_MAX_IDS = 50   // /items?ids=...: máximo 50 por request
const ML_ATTRIBUTES       = "id,title,price,available_quantity,sold_quantity,status,permalink,thumbnail,listing_type_id,attributes"

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
    // detail_batch clamped a 1..50 (límite real del multiget de ML)
    const batchSize = Math.min(50, Math.max(1, detail_batch))

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

    let importedCount  = 0
    let errorsCount    = 0
    let rateLimited    = false
    let hasMore        = true
    let lastScrollId: string | null = progress.scroll_id || null

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
        break
      }

      const searchData  = await searchRes.json()
      const itemIds: string[] = searchData.results || []
      const newScrollId: string | null = searchData.scroll_id || null
      const totalFromApi: number = searchData.paging?.total || 0

      // scan termina cuando results vacío
      if (itemIds.length === 0) {
        hasMore = false
        await supabase
          .from("ml_import_progress")
          .update({ status: "done", scroll_id: null })
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

      // Guardar total si aún no lo tenemos
      if (!cur.publications_total && totalFromApi > 0) {
        await supabase
          .from("ml_import_progress")
          .update({ publications_total: totalFromApi })
          .eq("account_id", accountId)
      }

      // ── Paso 2: Hidratar items con multiget en paralelo ──────────────────
      // Dividir itemIds en batches de batchSize (max 50)
      const batches: string[][] = []
      for (let i = 0; i < itemIds.length; i += batchSize) {
        batches.push(itemIds.slice(i, i + batchSize))
      }

      // Construir tareas de multiget
      const multigetTasks = batches.map(batch => async () => {
        const idsParam   = batch.join(",")
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=${ML_ATTRIBUTES}`
        const { res, rateLimited: rl } = await fetchWithRetry(detailsUrl, authHeader)

        if (rl) return { rateLimited: true, items: [] }
        if (!res || !res.ok) return { rateLimited: false, items: [] }

        const data = await res.json()
        return { rateLimited: false, items: Array.isArray(data) ? data : [] }
      })

      // Ejecutar con pool de concurrencia controlada
      const multigetResults = await runPool(multigetTasks, concurrency)

      // ── Paso 3: Preparar upsert batch ────────────────────────────────────
      const toUpsert: any[] = []
      const now = new Date().toISOString()

      for (const result of multigetResults) {
        if (result.status !== "fulfilled") { errorsCount++; continue }
        const { rateLimited: batchRl, items } = result.value

        if (batchRl) { rateLimited = true; continue }

        for (const item of items) {
          const b = item.body
          if (!b) continue

          let sku: string | null = null
          let isbn: string | null = null
          let gtin: string | null = null
          let ean: string | null = null

          if (Array.isArray(b.attributes)) {
            for (const attr of b.attributes) {
              if (attr.id === "SELLER_SKU") sku  = attr.value_name ?? null
              if (attr.id === "ISBN")       isbn = attr.value_name ?? null
              if (attr.id === "GTIN")       gtin = attr.value_name ?? null
              if (attr.id === "EAN")        ean  = attr.value_name ?? null
            }
          }

          // seller_custom_field is the most reliable SKU source — prefer it
          if (b.seller_custom_field) sku = b.seller_custom_field

          // Also check variations for seller_custom_field if item-level is missing
          if (!sku && Array.isArray(b.variations) && b.variations.length > 0) {
            for (const v of b.variations) {
              if (v.seller_custom_field) { sku = v.seller_custom_field; break }
            }
          }

          // EAN fallback: use GTIN if no dedicated EAN attribute
          if (!ean && gtin) ean = gtin

          toUpsert.push({
            account_id:    accountId,
            ml_item_id:    b.id,
            title:         b.title,
            price:         b.price,
            current_stock: b.available_quantity ?? 0,
            status:        b.status,
            permalink:     b.permalink,
            sku:           sku,
            isbn:          isbn,
            gtin:          gtin,
            ean:           ean,
            updated_at:    now,
          })
        }
      }

      // ── Paso 4: Upsert en Supabase (un solo batch) ───────────────────────
      if (toUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from("ml_publications")
          .upsert(toUpsert, { onConflict: "account_id,ml_item_id" })

        if (upsertError) {
          errorsCount++
          await supabase
            .from("ml_import_progress")
            .update({ last_error: `Upsert: ${upsertError.message}` })
            .eq("account_id", accountId)
        } else {
          importedCount += toUpsert.length
        }
      }

      // Actualizar offset
      const newOffset = offset + itemIds.length
      await supabase
        .from("ml_import_progress")
        .update({ publications_offset: newOffset })
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

    return NextResponse.json({
      ok:             true,
      imported_count: importedCount,
      elapsed_ms,
      has_more:       hasMore && !isDone,
      last_scroll_id: finalScrollId,
      errors_count:   errorsCount,
      rate_limited:   rateLimited,
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
