import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { executeSingleTick } from "@/domains/mercadolibre/import/orchestrator"

export const maxDuration = 60

function authenticate(request: Request): boolean {
  const url = new URL(request.url)
  const secretFromQuery = url.searchParams.get("secret")
  const secretFromHeader = request.headers.get("x-cron-secret")
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false
  return secretFromQuery === expectedSecret || secretFromHeader === expectedSecret
}

/** GET /api/ml/import/tick — manual execution from browser */
export async function GET(request: Request) {
  return handleTick(request)
}

/** POST /api/ml/import/tick — Vercel Cron */
export async function POST(request: Request) {
  return handleTick(request)
}

async function handleTick(request: Request) {
  console.log("[v0] ========== ML IMPORT TICK ==========")

  if (!authenticate(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ranAt = new Date().toISOString()

  try {
    const supabase = await createClient()
    const result = await executeSingleTick(supabase)

    if (!result.ok) {
      return NextResponse.json({
        ok: true,
        ranAt,
        message: result.reason === "no_active_job" ? "No active jobs" : result.reason,
      })
    }

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
    console.error("[v0] Error in tick:", error)
    return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
  }
}
