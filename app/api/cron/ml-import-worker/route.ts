import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { executeSingleTick } from "@/lib/ml/import-orchestrator"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/cron/ml-import-worker
 * Cron job that processes active ML import jobs.
 */
export async function GET() {
  console.log("[v0] ========== ML IMPORT WORKER CRON ==========")

  try {
    const supabase = await createClient()

    // Find active jobs
    const { data: jobs } = await supabase
      .from("ml_import_jobs")
      .select("id")
      .in("status", ["processing", "indexing"])
      .limit(5)

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ success: true, message: "No hay jobs pendientes" })
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

    return NextResponse.json({ success: true, jobs_processed: jobs.length, results })
  } catch (error: any) {
    console.error("[v0] Error in cron worker:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
