import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runLibralStockImport } from "@/domains/suppliers/libral/stock-import"
import { executeBatchImport } from "@/lib/import/batch-import"

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

    // Only route feed_type="api" sources to the Libral API importer.
    // "Libral Argentina" is feed_type="stock_price" (TAB text file) and must
    // go through the generic batch-import path instead.
    const isLibral = source.feed_type === "api"

    if (isLibral) {
      // Libral API: JSON paginada, ejecutar directamente con admin client
      console.log(`[SOURCES-RUN] Fuente API Libral detectada, ejecutando runLibralStockImport`)
      const sourceKey = source.source_key ?? "libral"
      const r = await runLibralStockImport(sourceKey)

      await supabase
        .from("import_history")
        .update({
          status: r.success ? "success" : "error",
          completed_at: new Date().toISOString(),
          products_updated: r.updated,
          error_message: r.error ?? null,
        })
        .eq("id", historyRecord.id)

      return NextResponse.json({
        success: r.success,
        message: r.error ?? `${r.updated} productos actualizados, ${r.zeroed} en cero`,
        source_id: source.id,
        source_name: source.name,
        history_id: historyRecord.id,
        result: r,
      })
    }

    // Resto de fuentes: ejecutar batch import directamente (sin self-fetch)
    // Se ejecuta en background sin esperar el resultado
    executeBatchImport(source.id, 0, mode as "update" | "upsert" | "create", true)
      .then((r) => {
        console.log(`[SOURCES-RUN] Batch import completado: created=${r.created}, updated=${r.updated}, failed=${r.failed}`)
        // Actualizar history record con resultado
        createClient().then(sb => {
          sb.from("import_history")
            .update({
              status: r.success ? "success" : "error",
              completed_at: new Date().toISOString(),
              products_imported: r.created,
              products_updated: r.updated,
              products_failed: r.failed,
              error_message: r.error ?? null,
            })
            .eq("id", historyRecord.id)
            .then(() => {})
        })
      })
      .catch((err) => {
        console.error(`[SOURCES-RUN] Error en batch import:`, err)
        createClient().then(sb => {
          sb.from("import_history")
            .update({
              status: "error",
              completed_at: new Date().toISOString(),
              error_message: err.message ?? "Unknown error",
            })
            .eq("id", historyRecord.id)
            .then(() => {})
        })
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
