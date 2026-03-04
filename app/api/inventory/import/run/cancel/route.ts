import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/inventory/import/run/cancel
 * Cancela una importación en progreso
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { run_id } = body

    if (!run_id) {
      return NextResponse.json({ error: "run_id es requerido" }, { status: 400 })
    }

    console.log(`[v0][RUN/CANCEL] Cancelando run_id=${run_id}`)

    const { data: run, error: runError } = await supabase
      .from("import_runs")
      .select("*")
      .eq("id", run_id)
      .single()

    if (runError || !run) {
      return NextResponse.json({ error: "Run no encontrado" }, { status: 404 })
    }

    // Solo se puede cancelar si está en running o queued
    if (run.status !== "running" && run.status !== "queued") {
      return NextResponse.json({
        ok: false,
        error: `No se puede cancelar un run en estado ${run.status}`
      }, { status: 400 })
    }

    await supabase
      .from("import_runs")
      .update({
        status: "canceled",
        finished_at: new Date().toISOString()
      })
      .eq("id", run_id)

    console.log(`[v0][RUN/CANCEL] Run cancelado exitosamente`)

    return NextResponse.json({
      ok: true,
      status: "canceled"
    })

  } catch (error: any) {
    console.error("[v0][RUN/CANCEL] Error inesperado:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno del servidor" 
    }, { status: 500 })
  }
}
