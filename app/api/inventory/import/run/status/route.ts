import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

/**
 * GET /api/inventory/import/run/status?run_id=xxx
 * Retorna estado actual del run con contrato estable
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const run_id = searchParams.get("run_id")

    if (!run_id) {
      return NextResponse.json({ error: "run_id es requerido" }, { status: 400 })
    }

    const { data: run, error: runError } = await supabase
      .from("import_runs")
      .select("*")
      .eq("id", run_id)
      .single()

    if (runError || !run) {
      return NextResponse.json({ error: "Run no encontrado" }, { status: 404 })
    }

    // Calcular velocidad y ETA
    let speed_rows_sec = 0
    let eta_sec = null

    if (run.started_at && run.processed_rows > 0) {
      const startedAt = new Date(run.started_at).getTime()
      const now = Date.now()
      const elapsedSec = (now - startedAt) / 1000

      if (elapsedSec > 0) {
        speed_rows_sec = run.processed_rows / elapsedSec
      }

      if (speed_rows_sec > 0 && run.total_rows) {
        const remaining = run.total_rows - run.processed_rows
        eta_sec = Math.round(remaining / speed_rows_sec)
      }
    }

    // Contrato estable con defaults
    return NextResponse.json({
      status: run.status || "unknown",
      started_at: run.started_at,
      finished_at: run.finished_at,
      processed_rows: run.processed_rows || 0,
      total_rows: run.total_rows || null,
      created_count: run.created_count || 0,
      updated_count: run.updated_count || 0,
      skipped_missing_key: run.skipped_missing_key || 0,
      skipped_invalid_key: run.skipped_invalid_key || 0,
      last_error: run.last_error || null,
      heartbeat_at: run.heartbeat_at,
      speed_rows_sec: Math.round(speed_rows_sec * 100) / 100,
      eta_sec
    })

  } catch (error: any) {
    console.error("[v0][RUN/STATUS] Error inesperado:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno del servidor" 
    }, { status: 500 })
  }
}
