import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

export const maxDuration = 10

/**
 * POST /api/ml/import/start
 * Crea o retorna el job activo de importación ML
 * NO ejecuta indexado - eso lo hace el cron automático
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id } = await request.json()

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .maybeSingle()

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Buscar job activo
    const { data: activeJob } = await supabase
      .from("ml_import_jobs")
      .select("*")
      .eq("account_id", account_id)
      .in("status", ["pending", "indexing", "processing"])
      .maybeSingle()

    if (activeJob) {
      console.log("[v0] Active job found:", activeJob.id)
      return NextResponse.json({
        success: true,
        message: "Importación en progreso",
        job_id: activeJob.id,
        status: activeJob.status
      })
    }

    // Crear nuevo job
    const { data: newJob, error: jobError } = await supabase
      .from("ml_import_jobs")
      .insert({
        account_id: account.id,
        status: "indexing",
        total_items: account.total_ml_publications || 0,
        current_offset: 0,
        processed_items: 0,
        failed_items: 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (jobError || !newJob) {
      console.error("[v0] Error creating job:", jobError)
      return NextResponse.json({ error: "Error creando job" }, { status: 500 })
    }

    console.log("[v0] New job created:", newJob.id)

    return NextResponse.json({
      success: true,
      message: "Importación iniciada. El proceso se ejecutará automáticamente.",
      job_id: newJob.id,
      status: "indexing",
      total_items: account.total_ml_publications || 0
    })

  } catch (error: any) {
    console.error("[v0] Error in start:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
