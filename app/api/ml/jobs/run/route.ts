import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"
import { protectCron } from "@/lib/auth/protect-api"
import { randomUUID } from "crypto"
import { executeJob, BACKOFF_SECONDS, MAX_ATTEMPTS } from "@/domains/mercadolibre/jobs/handlers"

export const maxDuration = 60

/**
 * POST /api/ml/jobs/run
 *
 * Claim and execute queued ML background jobs.
 * Body: { limit?: number, account_id?: string }
 */
export async function POST(request: NextRequest) {
  const authCheck = await protectCron(request)
  if (authCheck.error) return authCheck.response

  const instanceId = randomUUID()
  const body = await request.json().catch(() => ({}))
  const limit = Math.min(50, Math.max(1, body.limit ?? 5))
  const accountId = body.account_id ?? null

  const supabase = createAdminClient()

  // 1. Claim jobs (atomic lock)
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

  // Lock pessimistically
  const jobIds = jobs.map((j: any) => j.id)
  await supabase
    .from("ml_jobs")
    .update({ status: "running", locked_at: new Date().toISOString(), locked_by: instanceId })
    .in("id", jobIds)
    .eq("status", "queued")

  const { data: locked } = await supabase
    .from("ml_jobs")
    .select("*")
    .in("id", jobIds)
    .eq("locked_by", instanceId)
    .eq("status", "running")

  if (!locked || locked.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [], message: "Jobs tomados por otro worker" })
  }

  // 2. Execute jobs
  const results: any[] = []

  for (const job of locked) {
    const jobStart = Date.now()
    try {
      const result = await executeJob(job, supabase, instanceId)

      await supabase
        .from("ml_jobs")
        .update({
          status: "success",
          locked_at: null,
          locked_by: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)

      await supabase.from("ml_job_logs").insert({
        job_id: job.id,
        level: "info",
        message: "Job completado exitosamente",
        meta: { ...result, elapsed_ms: Date.now() - jobStart },
      })

      results.push({ job_id: job.id, type: job.type, status: "success", ...result })
    } catch (err: any) {
      const attempts = (job.attempts || 0) + 1
      const backoff = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
      const runAfter = new Date(Date.now() + backoff * 1000).toISOString()
      const newStatus = attempts >= MAX_ATTEMPTS ? "error" : "queued"

      await supabase
        .from("ml_jobs")
        .update({
          status: newStatus,
          attempts,
          last_error: err.message,
          run_after: newStatus === "queued" ? runAfter : undefined,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)

      await supabase.from("ml_job_logs").insert({
        job_id: job.id,
        level: "error",
        message: err.message,
        meta: { attempts, backoff_seconds: backoff, elapsed_ms: Date.now() - jobStart },
      })

      results.push({ job_id: job.id, type: job.type, status: newStatus, error: err.message, attempts })
    }
  }

  return NextResponse.json({ ok: true, processed: locked.length, results })
}
