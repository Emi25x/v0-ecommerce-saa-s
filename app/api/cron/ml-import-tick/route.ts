import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { executeSingleTick } from "@/domains/mercadolibre/import/orchestrator"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/cron/ml-import-tick
 * Vercel Cron: advances the ML import process automatically.
 */
export async function POST() {
  console.log("[CRON TICK] ========== ML IMPORT TICK ==========")
  const ranAt = new Date().toISOString()

  try {
    const supabase = await createClient()
    const result = await executeSingleTick(supabase)

    if (!result.ok) {
      console.log("[CRON TICK] No active jobs to process")
      return NextResponse.json({ ok: true, ranAt, message: "No active jobs" })
    }

    console.log("[CRON TICK] Job", result.job_id, result.action, "| offset:", result.offset_before, "→", result.offset_after)

    return NextResponse.json({
      ok: true,
      ranAt,
      job_id: result.job_id,
      status: result.status,
      offset_before: result.offset_before,
      offset_after: result.offset_after,
      action: result.action,
    })
  } catch (error: any) {
    console.error("[CRON TICK] Error:", error)
    return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
  }
}
