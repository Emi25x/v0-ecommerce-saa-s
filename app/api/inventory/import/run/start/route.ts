import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchWithAuth } from "@/lib/import/fetch-with-auth"
import crypto from "crypto"

export const maxDuration = 300 // 5 minutos para descargas grandes

/**
 * POST /api/inventory/import/run/start
 * Inicia una importación PRO (ULTRA-RÁPIDO):
 * 1. Descarga CSV streaming
 * 2. Upload directo a Storage
 * 3. Crea run record
 * 4. Retorna inmediatamente (sanity check se hace en primer step)
 */
export async function POST(request: NextRequest) {
  console.log("[v0][RUN/START] ========== VERSION 2024-ZIP-FIX ==========")
  const startTime = Date.now()
  
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { source_id, mode = "upsert" } = body

    if (!source_id) {
      return NextResponse.json({ error: "source_id es requerido" }, { status: 400 })
    }

    console.log(`[v0][RUN/START] Iniciando importación PRO para source_id=${source_id}`)

    // 1. Obtener configuración de la fuente
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", source_id)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    // 2. Descargar CSV
    console.log(`[v0][RUN/START] Descargando CSV desde ${source.url_template}`)
    
    const fileResponse = await fetchWithAuth({
      url_template: source.url_template,
      auth_type: source.auth_type,
      credentials: source.credentials
    })

    if (!fileResponse.ok) {
      return NextResponse.json({ 
        error: `Error descargando CSV: ${fileResponse.status}` 
      }, { status: 500 })
    }

    // Descargar archivo como texto (asume CSV directo, no ZIP)
    const csvText = await fileResponse.text()
    
    const elapsed = Date.now() - startTime
    console.log(`[v0][RUN/START] CSV descargado en ${elapsed}ms, ${csvText.length} chars`)

    // 3. Upload a Storage (sin procesar el CSV aún)
    const runId = crypto.randomUUID()
    const storagePath = `imports/${source_id}/${runId}.csv`
    
    const uploadStart = Date.now()
    const { error: uploadError } = await supabase
      .storage
      .from("imports")
      .upload(storagePath, csvText, {
        contentType: "text/csv",
        upsert: false
      })

    if (uploadError) {
      console.error(`[v0][RUN/START] Error subiendo a Storage:`, uploadError)
      return NextResponse.json({ 
        error: `Error guardando CSV: ${uploadError.message}` 
      }, { status: 500 })
    }

    const uploadElapsed = Date.now() - uploadStart
    console.log(`[v0][RUN/START] CSV subido a Storage en ${uploadElapsed}ms: ${storagePath}`)

    // 4. Crear import_run (sin calcular total_rows aún, se hace en primer step)
    const { data: run, error: runError } = await supabase
      .from("import_runs")
      .insert({
        id: runId,
        source_id,
        mode,
        status: "pending", // pending hasta que step calcule total_rows
        storage_path: storagePath,
        total_rows: 0, // Se calcula en primer step
        processed_rows: 0,
        created_count: 0,
        updated_count: 0,
        failed_count: 0,
      })
      .select()
      .single()

    if (runError) {
      console.error(`[v0][RUN/START] Error creando run:`, runError)
      return NextResponse.json({ 
        error: `Error creando run: ${runError.message}` 
      }, { status: 500 })
    }

    const totalElapsed = Date.now() - startTime
    console.log(`[v0][RUN/START] Run creado exitosamente en ${totalElapsed}ms: ${runId}`)

    return NextResponse.json({
      ok: true,
      run_id: runId,
      storage_path: storagePath
    })

  } catch (error: any) {
    console.error("[v0][RUN/START] Error inesperado:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno del servidor" 
    }, { status: 500 })
  }
}
