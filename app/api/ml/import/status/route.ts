import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/ml/import/status?job_id=xxx
 * Obtiene el estado actual de un job de importación
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const job_id = searchParams.get("job_id")
    const account_id = searchParams.get("account_id")

    if (!job_id && !account_id) {
      return NextResponse.json({ error: "job_id o account_id requerido" }, { status: 400 })
    }

    let query = supabase.from("ml_import_jobs").select("*")
    
    if (job_id) {
      query = query.eq("id", job_id)
    } else if (account_id) {
      query = query.eq("account_id", account_id).order("started_at", { ascending: false }).limit(1)
    }

    const { data: job } = await query.single()

    if (!job) {
      return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
    }

    // Obtener estadísticas de la cola
    const { data: queueStats } = await supabase
      .from("ml_import_queue")
      .select("status")
      .eq("job_id", job.id)

    const pending = queueStats?.filter(i => i.status === "pending").length || 0
    const processing = queueStats?.filter(i => i.status === "processing").length || 0
    const completed = queueStats?.filter(i => i.status === "completed").length || 0
    const failed = queueStats?.filter(i => i.status === "failed").length || 0

    const progress = job.total_items > 0 
      ? Math.round(((completed + failed) / job.total_items) * 100)
      : 0

    return NextResponse.json({
      job_id: job.id,
      status: job.status,
      total_items: job.total_items,
      processed_items: completed,
      failed_items: failed,
      pending_items: pending,
      processing_items: processing,
      progress,
      started_at: job.started_at,
      completed_at: job.completed_at,
      error_message: job.error_message
    })

  } catch (error: any) {
    console.error("[v0] Error in status:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
