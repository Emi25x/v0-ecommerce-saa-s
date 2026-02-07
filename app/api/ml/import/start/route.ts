import { NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/import/start
 * Inicia el proceso de importación por lotes de publicaciones de ML
 * Fase A: Indexa todos los item_ids y los encola para procesamiento
 */
export async function POST(request: Request) {
  try {
    console.log("[v0] ========== ML IMPORT START ==========")
    console.log("[v0] Request URL:", request.url)
    console.log("[v0] Request method:", request.method)
    
    // Import Supabase DENTRO del try-catch para capturar errores de importación
    const { createClient } = await import("@/lib/supabase/server")
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
    console.log("[v0] Index response content-type:", indexResponse.headers.get("content-type"))
    console.log("[v0] Index response url:", indexResponse.url)

    // Leer el body como texto primero
    const bodyText = await indexResponse.text()
    console.log("[v0] Index response body (text):", bodyText.substring(0, 300))

    // Verificar content-type antes de parsear JSON
    const contentType = indexResponse.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      const errorMsg = `Index endpoint devolvió ${contentType} en vez de JSON. Status: ${indexResponse.status}. Body: ${bodyText.substring(0, 300)}`
      console.error("[v0] Invalid content-type:", errorMsg)
      
      const { error: updateError } = await supabase
        .from("ml_import_jobs")
        .update({ status: "failed", error_message: "Error iniciando indexado: respuesta inválida" })
        .eq("id", newJob.id)
      
      if (updateError) {
        console.error("[v0] Supabase update error:", updateError.code, updateError.message)
      }
      
      return NextResponse.json({ error: "Error iniciando indexado: respuesta inválida del servidor" }, { status: 500 })
    }

    // Parsear JSON
    let indexData
    try {
      indexData = JSON.parse(bodyText)
      console.log("[v0] Index response body (parsed):", indexData)
    } catch (parseError: any) {
      console.error("[v0] Failed to parse JSON:", parseError.message)
      
      const { error: updateError } = await supabase
        .from("ml_import_jobs")
        .update({ status: "failed", error_message: "Error iniciando indexado: JSON inválido" })
        .eq("id", newJob.id)
      
      if (updateError) {
        console.error("[v0] Supabase update error:", updateError.code, updateError.message)
      }
      
      return NextResponse.json({ error: "Error iniciando indexado: respuesta JSON inválida" }, { status: 500 })
    }

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
