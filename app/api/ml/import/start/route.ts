import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import/start
 * Inicia el proceso de importación por lotes de publicaciones de ML
 * Fase A: Indexa todos los item_ids y los encola para procesamiento
 */
export async function POST(request: Request) {
  console.log("[v0] ========== ML IMPORT START ==========")
  
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
      .single()

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Verificar si ya hay un job activo
    const { data: activeJob } = await supabase
      .from("ml_import_jobs")
      .select("*")
      .eq("account_id", account_id)
      .in("status", ["pending", "indexing", "processing"])
      .maybeSingle()

    if (activeJob) {
      return NextResponse.json({
        success: true,
        message: "Ya hay una importación en progreso",
        job_id: activeJob.id
      })
    }

    // Crear nuevo job
    const { data: newJob, error: jobError } = await supabase
      .from("ml_import_jobs")
      .insert({
        account_id: account.id,
        status: "indexing",
        total_items: account.total_ml_publications || 0,
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (jobError || !newJob) {
      console.error("[v0] Error creating job:", jobError)
      return NextResponse.json({ error: "Error creando job" }, { status: 500 })
    }

    console.log("[v0] Job created:", newJob.id)

    // Construir URL absoluta para el index endpoint
    const indexUrl = new URL("/api/ml/import/index", request.url)
    console.log("[v0] Calling index endpoint:", indexUrl.toString())

    // Iniciar indexado en background
    const indexResponse = await fetch(indexUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: newJob.id, account_id })
    })

    console.log("[v0] Index response status:", indexResponse.status)
    const indexData = await indexResponse.json()
    console.log("[v0] Index response body:", indexData)

    if (!indexResponse.ok) {
      const errorMsg = indexData.error || "Error iniciando indexado"
      console.error("[v0] Index endpoint failed:", errorMsg)
      
      const { error: updateError } = await supabase
        .from("ml_import_jobs")
        .update({ status: "failed", error_message: errorMsg })
        .eq("id", newJob.id)
      
      if (updateError) {
        console.error("[v0] Supabase update error:", updateError.code, updateError.message)
      }
      
      return NextResponse.json({ error: errorMsg }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      job_id: newJob.id,
      status: "indexing",
      message: "Importación iniciada. Indexando publicaciones...",
      total_items: account.total_ml_publications || 0
    })

  } catch (error: any) {
    console.error("[v0] Error in start:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
