import { type NextRequest } from "next/server"
import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { executeSingleTick } from "@/domains/mercadolibre/import/orchestrator"
import { requireCron } from "@/lib/auth/require-auth"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const STALE_CLAIM_MINUTES = 10

/**
 * GET /api/cron/ml-import-worker
 * Cron job that processes active ML import jobs.
 * Also recovers items stuck in 'processing' state (stale claims).
 */
export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  const log = createStructuredLogger({ request_id: genRequestId() })
  log.info("ML Import Worker started", "ml_import_worker.start")

  try {
    const supabase = await createClient()

    // ── Stale claim recovery: reset items stuck in 'processing' > 10 min ──
    const staleThreshold = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString()
    const { data: staleItems } = await supabase
      .from("ml_import_queue")
      .update({ status: "pending", last_error: `Stale claim recovered (>${STALE_CLAIM_MINUTES}min)` })
      .eq("status", "processing")
      .lt("updated_at", staleThreshold)
      .select("id")

    if (staleItems && staleItems.length > 0) {
      log.warn(`Recovered ${staleItems.length} stale claimed items`, "ml_import_worker.stale_items", {
        count: staleItems.length,
      })
    }

    // ── Also recover stale jobs stuck in running states > 2 hours ──
    const staleJobThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: staleJobs } = await supabase
      .from("ml_import_jobs")
      .update({ status: "failed", error_message: "Job timed out (>2h)", completed_at: new Date().toISOString() })
      .in("status", ["indexing", "processing"])
      .lt("updated_at", staleJobThreshold)
      .select("id")

    if (staleJobs && staleJobs.length > 0) {
      log.warn(`Marked ${staleJobs.length} stale jobs as failed`, "ml_import_worker.stale_jobs", {
        count: staleJobs.length,
      })
    }

    // Find active jobs
    const { data: jobs } = await supabase
      .from("ml_import_jobs")
      .select("id")
      .in("status", ["processing", "indexing"])
      .limit(5)

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay jobs pendientes",
        stale_recovered: staleItems?.length ?? 0,
      })
    }

    log.info(`Found ${jobs.length} jobs to process`, "ml_import_worker.jobs", { count: jobs.length })
    const results = []

    for (const job of jobs) {
      try {
        const result = await executeSingleTick(supabase)
        results.push({ job_id: job.id, success: result.ok, action: result.action, status: result.status })
      } catch (error: unknown) {
        log.error(`Error processing job ${job.id}`, error, "ml_import_worker.job_error", { job_id: job.id })
        results.push({ job_id: job.id, success: false, error: error instanceof Error ? error.message : "Unknown" })
      }
    }

    return NextResponse.json({
      success: true,
      jobs_processed: jobs.length,
      results,
      stale_recovered: staleItems?.length ?? 0,
    })
  } catch (error: unknown) {
    log.error("Fatal error in import worker cron", error, "ml_import_worker.fatal")
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ ok: false, error: { code: "internal_error", detail: message } }, { status: 500 })
  }
}
