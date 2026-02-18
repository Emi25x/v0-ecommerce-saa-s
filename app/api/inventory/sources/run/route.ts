import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/inventory/sources/run
 * Ejecuta una importación para una fuente específica usando su UUID
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { source_id, mode = "update" } = body

    console.log(`[SOURCES-RUN] Iniciando importación para source_id: ${source_id}, mode: ${mode}`)

    // Validar que source_id sea un UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!source_id || !uuidRegex.test(source_id)) {
      return NextResponse.json(
        { error: "source_not_found", message: "Invalid source_id format" },
        { status: 404 }
      )
    }

    const supabase = await createClient()

    // Verificar que la fuente existe
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", source_id)
      .single()

    if (sourceError || !source) {
      console.error(`[SOURCES-RUN] Fuente no encontrada:`, sourceError)
      return NextResponse.json(
        { error: "source_not_found", message: "Import source not found" },
        { status: 404 }
      )
    }

    console.log(`[SOURCES-RUN] Fuente encontrada: ${source.name} (${source.feed_type})`)

    // Verificar que tiene URL configurada
    if (!source.url_template) {
      return NextResponse.json(
        { error: "no_url_configured", message: "Source has no URL template configured" },
        { status: 400 }
      )
    }

    // Crear registro en import_history
    const { data: historyRecord, error: historyError } = await supabase
      .from("import_history")
      .insert({
        source_id: source.id,
        status: "running",
        started_at: new Date().toISOString(),
        mode: mode,
      })
      .select()
      .single()

    if (historyError) {
      console.error(`[SOURCES-RUN] Error creando history:`, historyError)
      return NextResponse.json(
        { error: "failed_to_create_history", message: historyError.message },
        { status: 500 }
      )
    }

    console.log(`[SOURCES-RUN] History record creado: ${historyRecord.id}`)

    // Disparar el proceso de importación en background usando el endpoint de batch
    // Esto permite que el proceso continúe aunque el usuario cierre la ventana
    const batchImportUrl = `${process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "http://localhost:3000"}/api/inventory/import/batch`

    // No esperamos la respuesta - fire and forget
    fetch(batchImportUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: source.id,
        historyId: historyRecord.id,
        mode: mode,
      }),
    }).catch((err) => {
      console.error(`[SOURCES-RUN] Error disparando batch import:`, err)
    })

    return NextResponse.json({
      success: true,
      message: "Import started",
      source_id: source.id,
      source_name: source.name,
      history_id: historyRecord.id,
      mode: mode,
    })
  } catch (error: any) {
    console.error(`[SOURCES-RUN] Error general:`, error)
    return NextResponse.json(
      { error: "internal_error", message: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
