import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"
import { randomUUID } from "crypto"

export const maxDuration = 60

// Backoff por número de intento: 30s, 2m, 5m, 10m, 30m
const BACKOFF_SECONDS = [30, 120, 300, 600, 1800]
const MAX_ATTEMPTS    = 5

// ML constants (mismos que import-pro)
const ML_SCAN_PAGE_SIZE   = 50
const ML_MULTIGET_MAX_IDS = 50
const ML_ATTRIBUTES       = "id,title,price,available_quantity,sold_quantity,status,permalink,thumbnail,listing_type_id,attributes"

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries = 3,
): Promise<{ res: Response | null; rateLimited: boolean; retryAfter: number }> {
  let attempt = 0
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) })
      if (res.status === 429) {
        return { res, rateLimited: true, retryAfter: parseInt(res.headers.get("retry-after") || "60") }
      }
      if (res.status >= 500 && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
        attempt++
        continue
      }
      return { res, rateLimited: false, retryAfter: 0 }
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 300 * 2 ** attempt))
        attempt++
        continue
      }
      return { res: null, rateLimited: false, retryAfter: 0 }
    }
  }
  return { res: null, rateLimited: false, retryAfter: 0 }
}

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      try { results[i] = { status: "fulfilled", value: await tasks[i]() } }
      catch (e: any) { results[i] = { status: "rejected", reason: e } }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

// ── Handlers por tipo de job ─────────────────────────────────────────────────

async function handleImportPublications(
  job: any,
  supabase: any,
  instanceId: string,
): Promise<{ imported_count: number; has_more: boolean; rate_limited: boolean; error?: string }> {
  const { account_id, payload } = job
  const max_seconds = payload.max_seconds ?? 50
  const detail_batch = Math.min(50, Math.max(1, payload.detail_batch ?? 50))
  const concurrency  = payload.concurrency ?? 2
  const startTime    = Date.now()

  const { data: account } = await supabase
    .from("ml_accounts").select("*").eq("id", account_id).maybeSingle()
  if (!account) return { imported_count: 0, has_more: false, rate_limited: false, error: "Account not found" }

  const { data: progress } = await supabase
    .from("ml_import_progress").select("*").eq("account_id", account_id).single()
  if (!progress) return { imported_count: 0, has_more: false, rate_limited: false, error: "Progress not found. Initialize import first." }

  // Desbloquear si pasó la pausa
  if (progress.status === "paused" && progress.paused_until && new Date(progress.paused_until) > new Date()) {
    const wait = Math.ceil((new Date(progress.paused_until).getTime() - Date.now()) / 1000)
    return { imported_count: 0, has_more: true, rate_limited: true, error: `Rate limited, resume in ${wait}s` }
  }

  await supabase.from("ml_import_progress")
    .update({ status: "running", last_run_at: new Date().toISOString(), last_error: null })
    .eq("account_id", account_id)

  const accessToken = await getValidAccessToken(account_id)
  const authHeader  = { Authorization: `Bearer ${accessToken}` }
  const scope       = progress.publications_scope || "all"

  let importedCount = 0
  let errorsCount   = 0
  let rateLimited   = false
  let hasMore       = true

  while (Date.now() - startTime < max_seconds * 1000) {
    const { data: cur } = await supabase
      .from("ml_import_progress")
      .select("scroll_id, publications_offset, publications_total")
      .eq("account_id", account_id).single()
    if (!cur) break

    const scrollId = cur.scroll_id as string | null

    const searchUrl = scrollId
      ? `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&scroll_id=${scrollId}`
      : `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?search_type=scan&limit=${ML_SCAN_PAGE_SIZE}${scope === "active_only" ? "&status=active" : ""}`

    const { res: searchRes, rateLimited: rl, retryAfter } = await fetchWithRetry(searchUrl, authHeader)
    if (rl) {
      const pausedUntil = new Date(Date.now() + retryAfter * 1000).toISOString()
      await supabase.from("ml_import_progress")
        .update({ status: "paused", paused_until: pausedUntil })
        .eq("account_id", account_id)
      rateLimited = true
      break
    }
    if (!searchRes || !searchRes.ok) { errorsCount++; break }

    const searchData  = await searchRes.json()
    const itemIds: string[] = searchData.results || []
    const newScrollId = searchData.scroll_id || null
    const totalFromApi = searchData.paging?.total || 0

    if (itemIds.length === 0) {
      hasMore = false
      await supabase.from("ml_import_progress")
        .update({ status: "done", scroll_id: null }).eq("account_id", account_id)
      break
    }

    if (newScrollId && newScrollId !== scrollId) {
      await supabase.from("ml_import_progress")
        .update({ scroll_id: newScrollId }).eq("account_id", account_id)
    }
    if (!cur.publications_total && totalFromApi > 0) {
      await supabase.from("ml_import_progress")
        .update({ publications_total: totalFromApi }).eq("account_id", account_id)
    }

    // Multiget en chunks de detail_batch con pool de concurrencia
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += detail_batch) {
      chunks.push(itemIds.slice(i, i + detail_batch))
    }

    const detailTasks = chunks.map(chunk => async () => {
      const url = `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=${ML_ATTRIBUTES}`
      const { res } = await fetchWithRetry(url, authHeader)
      if (!res || !res.ok) return []
      const data = await res.json()
      return Array.isArray(data)
        ? data.filter((r: any) => r.code === 200).map((r: any) => r.body)
        : []
    })

    const poolResults = await runPool(detailTasks, concurrency)
    const allItems = poolResults
      .filter(r => r.status === "fulfilled")
      .flatMap(r => (r as PromiseFulfilledResult<any[]>).value)

    if (allItems.length > 0) {
      const rows = allItems.map((item: any) => {
        const isbn = item.attributes?.find((a: any) => a.id === "ISBN")?.value_name
        return {
          account_id,
          ml_item_id:          item.id,
          title:               item.title,
          price:               item.price,
          available_quantity:  item.available_quantity,
          sold_quantity:       item.sold_quantity,
          status:              item.status,
          permalink:           item.permalink,
          thumbnail:           item.thumbnail,
          listing_type_id:     item.listing_type_id,
          isbn:                isbn || null,
          raw_attributes:      item.attributes || [],
          updated_at:          new Date().toISOString(),
        }
      })

      await supabase.from("ml_publications").upsert(rows, {
        onConflict:        "account_id,ml_item_id",
        ignoreDuplicates:  false,
      })

      importedCount += allItems.length
    }

    await supabase.from("ml_import_progress")
      .update({
        publications_offset: (cur.publications_offset || 0) + itemIds.length,
        publications_progress: cur.publications_total
          ? Math.min(100, ((cur.publications_offset + itemIds.length) / cur.publications_total) * 100)
          : null,
      })
      .eq("account_id", account_id)
  }

  if (!rateLimited && hasMore) {
    await supabase.from("ml_import_progress")
      .update({ status: "idle" }).eq("account_id", account_id)
  }

  return { imported_count: importedCount, has_more: hasMore, rate_limited: rateLimited }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

async function executeJob(job: any, supabase: any, instanceId: string) {
  switch (job.type) {
    case "import_publications":
      return handleImportPublications(job, supabase, instanceId)
    default:
      throw new Error(`Tipo de job no implementado: ${job.type}`)
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/ml/jobs/run
 *
 * Body: {
 *   limit?:       number   default 5  — jobs a procesar en este tick
 *   account_id?:  string   — filtrar por cuenta
 * }
 *
 * Response: {
 *   ok: boolean
 *   processed: number
 *   results: { job_id, type, status, imported_count?, error? }[]
 * }
 */
export async function POST(request: NextRequest) {
  const authError = await protectAPI(request)
  if (authError) return authError

  const instanceId = randomUUID()
  const body       = await request.json().catch(() => ({}))
  const limit      = Math.min(50, Math.max(1, body.limit ?? 5))
  const accountId  = body.account_id ?? null

  const supabase = await createClient({ useServiceRole: true })

  // ── 1. Claim jobs (lock atómico) ─────────────────────────────────────────
  const query = supabase
    .from("ml_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .order("run_after", { ascending: true })
    .limit(limit)

  if (accountId) query.eq("account_id", accountId)

  const { data: jobs, error: fetchError } = await query

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [], message: "No hay jobs en cola" })
  }

  // Marcar como running (lock pesimista simple: primera escritura gana)
  const jobIds = jobs.map((j: any) => j.id)
  await supabase
    .from("ml_jobs")
    .update({ status: "running", locked_at: new Date().toISOString(), locked_by: instanceId })
    .in("id", jobIds)
    .eq("status", "queued")   // solo los que siguen queued (evita doble-proceso)

  // Verificar cuáles realmente obtuvimos el lock
  const { data: locked } = await supabase
    .from("ml_jobs")
    .select("*")
    .in("id", jobIds)
    .eq("locked_by", instanceId)
    .eq("status", "running")

  if (!locked || locked.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [], message: "Jobs tomados por otro worker" })
  }

  // ── 2. Ejecutar jobs ─────────────────────────────────────────────────────
  const results: any[] = []

  for (const job of locked) {
    const jobStart = Date.now()
    try {
      const result = await executeJob(job, supabase, instanceId)

      await supabase.from("ml_jobs").update({
        status:     "success",
        locked_at:  null,
        locked_by:  null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id)

      // Log de éxito
      await supabase.from("ml_job_logs").insert({
        job_id:  job.id,
        level:   "info",
        message: "Job completado exitosamente",
        meta:    { ...result, elapsed_ms: Date.now() - jobStart },
      })

      results.push({ job_id: job.id, type: job.type, status: "success", ...result })

    } catch (err: any) {
      const attempts  = (job.attempts || 0) + 1
      const backoff   = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
      const runAfter  = new Date(Date.now() + backoff * 1000).toISOString()
      const newStatus = attempts >= MAX_ATTEMPTS ? "error" : "queued"

      await supabase.from("ml_jobs").update({
        status:     newStatus,
        attempts,
        last_error: err.message,
        run_after:  newStatus === "queued" ? runAfter : undefined,
        locked_at:  null,
        locked_by:  null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id)

      // Log de error
      await supabase.from("ml_job_logs").insert({
        job_id:  job.id,
        level:   "error",
        message: err.message,
        meta:    { attempts, backoff_seconds: backoff, elapsed_ms: Date.now() - jobStart },
      })

      results.push({ job_id: job.id, type: job.type, status: newStatus, error: err.message, attempts })
    }
  }

  return NextResponse.json({ ok: true, processed: locked.length, results })
}
