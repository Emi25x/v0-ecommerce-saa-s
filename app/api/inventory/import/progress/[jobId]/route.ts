import { createClient } from "@/lib/db/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  try {
    const supabase = await createClient()

    const { data: history, error } = await supabase.from("import_history").select("*").eq("id", jobId).single()

    if (error || !history) {
      return NextResponse.json({ error: "Import job not found" }, { status: 404 })
    }

    const processed =
      (history.products_imported || 0) + (history.products_updated || 0) + (history.products_failed || 0)

    let speed = 0
    if (history.started_at && processed > 0) {
      const elapsedSeconds = (new Date().getTime() - new Date(history.started_at).getTime()) / 1000
      speed = elapsedSeconds > 0 ? Math.round((processed / elapsedSeconds) * 10) / 10 : 0
    }

    return NextResponse.json({
      id: history.id,
      source_id: history.source_id,
      status: history.status,
      total: history.total_products || 0,
      processed,
      products_imported: history.products_imported || 0,
      products_updated: history.products_updated || 0,
      products_failed: history.products_failed || 0,
      started_at: history.started_at,
      completed_at: history.completed_at,
      error_message: history.error_message,
      speed,
      errors: [], // Los errores detallados no se almacenan en import_history, solo el contador
    })
  } catch (error: any) {
    console.error("[v0] Error fetching job progress:", error)
    return NextResponse.json({ error: "Failed to fetch progress", details: error.message }, { status: 500 })
  }
}
