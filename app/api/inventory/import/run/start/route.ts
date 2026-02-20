import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchWithAuth } from "@/lib/import/fetch-with-auth"
import crypto from "crypto"

export const maxDuration = 60

/**
 * POST /api/inventory/import/run/start
 * Inicia una importación PRO:
 * 1. Descarga CSV UNA SOLA VEZ
 * 2. Guarda en Supabase Storage
 * 3. Crea import_run con estado inicial
 * 4. Retorna run_id para procesamiento por chunks
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { source_id, feed_kind = "catalog", mode = "upsert" } = body

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

    // 2. Descargar CSV UNA SOLA VEZ
    console.log(`[v0][RUN/START] Descargando CSV desde ${source.url_template}`)
    
    const fileResponse = await fetchWithAuth({
      url_template: source.url_template,
      auth_type: source.auth_type,
      credentials: source.credentials
    })

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text()
      console.error(`[v0][RUN/START] Error descargando CSV:`, errorText.substring(0, 300))
      return NextResponse.json({ 
        error: `Error descargando CSV: ${fileResponse.status}` 
      }, { status: 500 })
    }

    const csvText = await fileResponse.text()
    const bytes = new TextEncoder().encode(csvText).length
    const checksum = crypto.createHash("sha256").update(csvText).digest("hex")

    console.log(`[v0][RUN/START] CSV descargado: ${bytes} bytes, checksum=${checksum.substring(0, 12)}...`)

    // 3. Guardar en Supabase Storage
    const runId = crypto.randomUUID()
    const storagePath = `imports/${source_id}/${runId}.csv`
    
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

    console.log(`[v0][RUN/START] CSV guardado en Storage: ${storagePath}`)

    // 4. Estimar total_rows (count '\n' en el CSV)
    const lines = csvText.split("\n").filter(line => line.trim())
    const total_rows = Math.max(0, lines.length - 1) // menos header

    console.log(`[v0][RUN/START] Total estimado de filas: ${total_rows}`)

    // 5. Crear import_run
    const { data: run, error: runError } = await supabase
      .from("import_runs")
      .insert({
        id: runId,
        source_id,
        feed_kind,
        mode,
        status: "running",
        storage_path: storagePath,
        bytes,
        checksum,
        total_rows,
        processed_rows: 0,
        created_count: 0,
        updated_count: 0,
        skipped_missing_key: 0,
        skipped_invalid_key: 0
      })
      .select()
      .single()

    if (runError) {
      console.error(`[v0][RUN/START] Error creando run:`, runError)
      return NextResponse.json({ 
        error: `Error creando run: ${runError.message}` 
      }, { status: 500 })
    }

    console.log(`[v0][RUN/START] Run creado exitosamente: ${runId}`)

    return NextResponse.json({
      ok: true,
      run_id: runId,
      total_rows,
      storage_path: storagePath,
      bytes,
      checksum: checksum.substring(0, 12)
    })

  } catch (error: any) {
    console.error("[v0][RUN/START] Error inesperado:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno del servidor" 
    }, { status: 500 })
  }
}
