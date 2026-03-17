import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { executeSingleTick } from "@/lib/ml/import-orchestrator"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const STALE_CLAIM_MINUTES = 10

/**
 * GET /api/cron/ml-import-worker
 * Cron job that processes active ML import jobs.
 * Also recovers items stuck in 'processing' state (stale claims).
 */
export async function GET() {
  console.log("[v0] ========== ML IMPORT WORKER CRON ==========")

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
      console.log(`[v0] Recovered ${staleItems.length} stale claimed items`)
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
      console.log(`[v0] Marked ${staleJobs.length} stale jobs as failed`)
    }

    // Find active jobs
    const { data: jobs } = await supabase
      .from("ml_import_jobs")
      .select("id")
      .in("status", ["processing", "indexing"])
      .limit(5)

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, message: "No hay jobs pendientes", stale_recovered: staleItems?.length ?? 0 })
    }

    console.log("[v0] Found", jobs.length, "jobs to process")
    const results = []

    for (const job of jobs) {
      try {
        const result = await executeSingleTick(supabase)
        results.push({ job_id: job.id, success: result.ok, action: result.action, status: result.status })
      } catch (error: any) {
        console.error("[v0] Error processing job", job.id, error)
        results.push({ job_id: job.id, success: false, error: error.message })
      }
    }

    return NextResponse.json({ success: true, jobs_processed: jobs.length, results, stale_recovered: staleItems?.length ?? 0 })
  } catch (error: any) {
    console.error("[v0] Error in cron worker:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
