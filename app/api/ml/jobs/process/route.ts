import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"

export const dynamic    = "force-dynamic"
export const maxDuration = 60

const MAX_JOBS_PER_RUN = 20

/**
 * POST /api/ml/jobs/process
 * Procesa hasta MAX_JOBS_PER_RUN jobs encolados en ml_jobs.
 * Llamado por cron o manualmente.
 *
 * Tipos soportados:
 *   pause_item     → PUT /items/{id} { status: "paused" }
 *   catalog_optin  → POST /items/{id}/optin { domain_id }
 *   price_update   → PUT /items/{id} { price }
 */
export async function POST(request: NextRequest) {
  // Verificar CRON_SECRET si viene de cron
  const secret = request.headers.get("x-cron-secret")
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 })
  }

  const supabase = await createClient()

  // Tomar jobs encolados ordenados por created_at
  const { data: jobs, error: fetchErr } = await supabase
    .from("ml_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN)

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "No hay jobs encolados" })
  }

  const results: { id: string; type: string; status: string; error?: string }[] = []

  for (const job of jobs) {
    // Marcar como running
    await supabase.from("ml_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job.id)

    let success   = false
    let errMsg    = ""

    try {
      const token = await getValidAccessToken(job.account_id)
      const auth  = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      const { item_id } = job.payload ?? {}

      if (!item_id) throw new Error("payload.item_id requerido")

      if (job.type === "pause_item") {
        const res = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
          method:  "PUT",
          headers: auth,
          body:    JSON.stringify({ status: "paused" }),
          signal:  AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `ML ${res.status}`)
        }
        // Actualizar estado local en ml_publications
        await supabase
          .from("ml_publications")
          .update({ status: "paused", updated_at: new Date().toISOString() })
          .eq("ml_item_id", item_id)
          .eq("account_id", job.account_id)
        success = true

      } else if (job.type === "catalog_optin") {
        // Primero obtener el domain_id del item
        const itemRes  = await fetch(`https://api.mercadolibre.com/items/${item_id}?attributes=domain_id`, {
          headers: { Authorization: `Bearer ${token}` },
          signal:  AbortSignal.timeout(8_000),
        })
        const itemData = itemRes.ok ? await itemRes.json() : {}
        const domainId = job.payload?.domain_id || itemData.domain_id

        const res = await fetch(`https://api.mercadolibre.com/items/${item_id}/optin`, {
          method:  "POST",
          headers: auth,
          body:    JSON.stringify({ domain_id: domainId }),
          signal:  AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `ML ${res.status}`)
        }
        success = true

      } else if (job.type === "price_update") {
        const { price } = job.payload ?? {}
        if (!price) throw new Error("payload.price requerido")
        const res = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
          method:  "PUT",
          headers: auth,
          body:    JSON.stringify({ price }),
          signal:  AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `ML ${res.status}`)
        }
        await supabase
          .from("ml_publications")
          .update({ price, updated_at: new Date().toISOString() })
          .eq("ml_item_id", item_id)
          .eq("account_id", job.account_id)
        success = true

      } else {
        throw new Error(`Tipo de job no implementado: ${job.type}`)
      }
    } catch (e: any) {
      errMsg = e.message
    }

    const finalStatus = success ? "done" : "error"
    await supabase.from("ml_jobs").update({
      status:       finalStatus,
      finished_at:  new Date().toISOString(),
      error_message: errMsg || null,
    }).eq("id", job.id)

    results.push({ id: job.id, type: job.type, status: finalStatus, ...(errMsg ? { error: errMsg } : {}) })
  }

  const done   = results.filter(r => r.status === "done").length
  const errors = results.filter(r => r.status === "error").length

  return NextResponse.json({ ok: true, processed: results.length, done, errors, results })
}

/**
 * GET /api/ml/jobs/process — resumen de jobs pendientes (para monitoreo)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("account_id")

  let q = supabase
    .from("ml_jobs")
    .select("status, type, created_at, error_message")
    .order("created_at", { ascending: false })
    .limit(100)

  if (accountId) q = q.eq("account_id", accountId)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const queued  = data?.filter(j => j.status === "queued").length  ?? 0
  const running = data?.filter(j => j.status === "running").length ?? 0
  const done    = data?.filter(j => j.status === "done").length    ?? 0
  const errored = data?.filter(j => j.status === "error").length   ?? 0

  return NextResponse.json({ ok: true, queued, running, done, errored, jobs: data })
}
