import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

export const maxDuration = 10

/**
 * POST /api/ml/import/retry-failed
 * Reintenta items fallidos de un job específico
 * Útil para recuperar items con errores temporales (429, timeout, etc)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { job_id } = await request.json()

    if (!job_id) {
      return NextResponse.json({ error: "job_id requerido" }, { status: 400 })
    }

    // Contar items fallidos
    const { count: failedCount } = await supabase
      .from("ml_import_queue")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job_id)
      .eq("status", "failed")

    if (failedCount === 0) {
      return NextResponse.json({
        success: true,
        message: "No hay items fallidos para reintentar",
        retried: 0
      })
    }

    // Resetear status de items fallidos a pending (máximo 3 intentos)
    const { data: retriedItems, error } = await supabase
      .from("ml_import_queue")
      .update({ 
        status: "pending",
        last_error: null
      })
      .eq("job_id", job_id)
      .eq("status", "failed")
      .lt("attempts", 3) // Solo reintentar si tiene menos de 3 intentos
      .select("id")

    if (error) {
      console.error("[v0] Error retrying failed items:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const retriedCount = retriedItems?.length || 0

    console.log("[v0] Retried", retriedCount, "failed items for job", job_id)

    return NextResponse.json({
      success: true,
      message: `${retriedCount} items marcados para reintentar`,
      retried: retriedCount,
      total_failed: failedCount
    })

  } catch (error: any) {
    console.error("[v0] Error in retry-failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
