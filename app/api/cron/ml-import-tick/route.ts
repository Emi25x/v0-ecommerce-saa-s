import { type NextRequest } from "next/server"
import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { executeSingleTick } from "@/domains/mercadolibre/import/orchestrator"
import { requireCron } from "@/lib/auth/require-auth"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/cron/ml-import-tick
 * Vercel Cron: advances the ML import process automatically.
 */
export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  const log = createStructuredLogger({ request_id: genRequestId() })
  log.info("ML Import Tick started", "ml_import_tick.start")
  const ranAt = new Date().toISOString()

  try {
    const supabase = await createClient()
    const result = await executeSingleTick(supabase)

    if (!result.ok) {
      log.info("No active jobs to process", "ml_import_tick.idle")
      return NextResponse.json({ ok: true, ranAt, message: "No active jobs" })
    }

    log.info("Tick completed", "ml_import_tick.done", {
      job_id: result.job_id,
      action: result.action,
      offset_before: result.offset_before,
      offset_after: result.offset_after,
    })

    return NextResponse.json({
      ok: true,
      ranAt,
      job_id: result.job_id,
      status: result.status,
      offset_before: result.offset_before,
      offset_after: result.offset_after,
      action: result.action,
    })
  } catch (error: unknown) {
    log.error("ML Import Tick error", error, "ml_import_tick.fatal")
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ ok: false, ranAt, error: message }, { status: 500 })
  }
}
