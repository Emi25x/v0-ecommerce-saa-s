import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/ml/matcher/status?account_id=xxx
 * Retorna progreso actual del matcher con TODOS los campos garantizados (defaults 0/null)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "missing_account_id" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: progress, error } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    // Garantizar todos los campos con defaults (NUNCA omitir keys)
    const safeProgress = {
      account_id: accountId,
      status: progress?.status || "idle",

      // Timestamps
      started_at: progress?.started_at || null,
      finished_at: progress?.finished_at || null,
      last_heartbeat_at: progress?.last_heartbeat_at || null,
      last_run_at: progress?.last_run_at || null,

      // Contadores principales
      total_target: progress?.total_target || 0,
      processed_count: progress?.processed_count || 0,

      // Contadores de outcomes
      matched_count: progress?.matched_count || 0,
      ambiguous_count: progress?.ambiguous_count || 0,
      not_found_count: progress?.not_found_count || 0,
      invalid_identifier_count: progress?.invalid_identifier_count || 0,
      error_count: progress?.error_count || 0,

      // Métricas calculadas
      percent:
        progress?.total_target > 0 ? Math.min(100, ((progress.processed_count || 0) / progress.total_target) * 100) : 0,

      speed_per_sec: calculateSpeed(progress),
      eta_seconds: calculateETA(progress),

      // Error tracking
      last_error: progress?.last_error || null,

      // Cursor para reanudar
      cursor: progress?.cursor || null,
    }

    return NextResponse.json({
      ok: true,
      progress: safeProgress,
    })
  } catch (error: any) {
    console.error(`[MATCHER-STATUS] Error:`, error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}

/**
 * Calcular velocidad (items/segundo) basado en progreso
 */
function calculateSpeed(progress: any): number {
  if (!progress?.started_at || !progress?.processed_count) return 0

  try {
    const elapsed = (Date.now() - new Date(progress.started_at).getTime()) / 1000
    if (elapsed <= 0) return 0
    return Math.round((progress.processed_count / elapsed) * 10) / 10
  } catch {
    return 0
  }
}

/**
 * Calcular ETA (segundos restantes) basado en velocidad actual
 */
function calculateETA(progress: any): number | null {
  if (!progress?.total_target || !progress?.processed_count) return null

  const remaining = progress.total_target - progress.processed_count
  if (remaining <= 0) return 0

  const speed = calculateSpeed(progress)
  if (speed <= 0) return null

  return Math.round(remaining / speed)
}
