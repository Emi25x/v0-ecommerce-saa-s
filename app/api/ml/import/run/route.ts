import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { executeImportRun } from "@/domains/mercadolibre/import/orchestrator"

export const maxDuration = 60

function authenticate(request: Request): boolean {
  const url = new URL(request.url)
  const secretFromQuery = url.searchParams.get("secret")
  const secretFromHeader = request.headers.get("x-cron-secret")
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false
  return secretFromQuery === expectedSecret || secretFromHeader === expectedSecret
}

/**
 * POST /api/ml/import/run
 * Executes multiple import ticks in a loop (max 20s).
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT RUN ==========")

  if (!authenticate(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    const { ticksRun, elapsed, results, lastResult } = await executeImportRun(supabase)

    console.log(`[v0] RUN - Completed ${ticksRun} ticks in ${elapsed}ms`)

    return NextResponse.json({
      ok: true,
      ticksRun,
      elapsed,
      lastAction: lastResult?.action || "none",
      offset_before: results[0]?.offset_before || 0,
      offset_after: lastResult?.offset_after || 0,
      status: lastResult?.status || "unknown",
      results,
    })
  } catch (error: any) {
    console.error("[v0] RUN - Error:", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
