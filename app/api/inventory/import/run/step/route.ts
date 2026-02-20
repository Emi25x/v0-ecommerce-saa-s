import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

export const maxDuration = 30 // Anti-timeout: máximo 30s por chunk

const CHUNK_SIZE = 2000 // Procesar 2000 filas por vez

/**
 * POST /api/inventory/import/run/step
 * Procesa UN chunk de filas desde Storage (resumible, anti-timeout)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { run_id } = body

    if (!run_id) {
      return NextResponse.json({ error: "run_id es requerido" }, { status: 400 })
    }

    // 1. Obtener run actual
    const { data: run, error: runError } = await supabase
      .from("import_runs")
      .select("*")
      .eq("id", run_id)
      .single()

    if (runError || !run) {
      return NextResponse.json({ error: "Run no encontrado" }, { status: 404 })
    }

    // Si no está en running, no hacer nada
    if (run.status !== "running") {
      return NextResponse.json({
        ok: true,
        status: run.status,
        reason: `Run en estado ${run.status}, no se puede procesar`,
        continue: false
      })
    }

    console.log(`[v0][RUN/STEP] Procesando chunk para run_id=${run_id}, offset=${run.processed_rows}`)

    // 2. Leer CSV desde Storage
    const { data: csvBlob, error: downloadError } = await supabase
      .storage
      .from("imports")
      .download(run.storage_path!)

    if (downloadError || !csvBlob) {
      console.error(`[v0][RUN/STEP] Error leyendo Storage:`, downloadError)
      
      await supabase
        .from("import_runs")
        .update({ 
          status: "failed", 
          last_error: `Error leyendo Storage: ${downloadError?.message}`,
          finished_at: new Date().toISOString()
        })
        .eq("id", run_id)

      return NextResponse.json({ 
        error: `Error leyendo CSV: ${downloadError?.message}` 
      }, { status: 500 })
    }

    const csvText = await csvBlob.text()

    // 3. Parsear CSV completo (en memoria, pero solo procesamos un chunk)
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
    const allRows = parsed.data as Array<Record<string, any>>

    console.log(`[v0][RUN/STEP] CSV parseado: ${allRows.length} filas totales`)

    // 4. Tomar chunk actual
    const offset = run.processed_rows
    const chunk = allRows.slice(offset, offset + CHUNK_SIZE)

    if (chunk.length === 0) {
      // Terminado
      console.log(`[v0][RUN/STEP] No hay más filas, completando run`)
      
      await supabase
        .from("import_runs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString()
        })
        .eq("id", run_id)

      return NextResponse.json({
        ok: true,
        status: "completed",
        processed_rows: run.processed_rows,
        total_rows: run.total_rows,
        created_count: run.created_count,
        updated_count: run.updated_count,
        continue: false
      })
    }

    console.log(`[v0][RUN/STEP] Procesando ${chunk.length} filas`)

    // 5. Obtener source para mapping
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", run.source_id)
      .single()

    if (!source) {
      return NextResponse.json({ error: "Source no encontrada" }, { status: 404 })
    }

    const mapping = source.column_mapping || {}

    // 6. Auto-detectar columnas (igual que en batch)
    let detectedColumns = {
      ean: mapping.ean || null,
      isbn: mapping.isbn || null,
      title: mapping.title || null,
      author: mapping.author || null,
      price: mapping.price || null,
      image: mapping.image_url || null
    }

    if (!detectedColumns.ean && chunk.length > 0) {
      const headers = Object.keys(chunk[0])
      const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      
      // Auto-detectar EAN
      for (const h of headers) {
        const nh = normalize(h)
        if (nh === "ean" || nh === "ean13") { detectedColumns.ean = h; break }
      }
      if (!detectedColumns.ean) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "isbn" || nh === "isbn13") { detectedColumns.isbn = h; break }
        }
      }
    }

    // 7. Procesar chunk
    const productsToInsert: Array<Record<string, any>> = []
    let skipped_missing = 0
    let skipped_invalid = 0

    const normalizeEan = (raw: string | undefined): string | null => {
      if (!raw) return null
      const digits = raw.replace(/\D/g, "")
      return digits || null
    }

    for (const row of chunk) {
      const eanRaw = row[detectedColumns.ean || ""]?.trim()
      const isbnRaw = row[detectedColumns.isbn || ""]?.trim()
      
      let ean = normalizeEan(eanRaw)
      if (!ean && isbnRaw) {
        ean = normalizeEan(isbnRaw)
      }

      if (!ean) {
        skipped_missing++
        continue
      }

      if (ean.length !== 13) {
        skipped_invalid++
        continue
      }

      const title = row[detectedColumns.title || ""]?.trim() || ean
      const author = row[detectedColumns.author || ""]?.trim() || null
      const price = parseFloat(row[detectedColumns.price || ""]?.replace(",", ".") || "0")
      const imageUrl = row[detectedColumns.image || ""]?.trim() || null

      productsToInsert.push({
        sku: ean,
        ean,
        isbn: isbnRaw || null,
        title,
        author,
        price,
        image_url: imageUrl
      })
    }

    console.log(`[v0][RUN/STEP] Productos a insertar: ${productsToInsert.length}, skipped: ${skipped_missing + skipped_invalid}`)

    // 8. Insertar en DB (upsert por EAN)
    let createdCount = 0
    let updatedCount = 0

    if (productsToInsert.length > 0) {
      const { error } = await supabase
        .from("products")
        .upsert(productsToInsert, { onConflict: "ean" })

      if (error) {
        console.error(`[v0][RUN/STEP] Error insertando productos:`, error)
      } else {
        // Para simplificar, contamos todos como "creados"
        // (podríamos hacer query antes para contar updates vs creates)
        createdCount = productsToInsert.length
      }
    }

    // 9. Actualizar run
    const newProcessedRows = run.processed_rows + chunk.length
    const done = newProcessedRows >= (run.total_rows || allRows.length)

    await supabase
      .from("import_runs")
      .update({
        processed_rows: newProcessedRows,
        created_count: run.created_count + createdCount,
        updated_count: run.updated_count + updatedCount,
        skipped_missing_key: run.skipped_missing_key + skipped_missing,
        skipped_invalid_key: run.skipped_invalid_key + skipped_invalid,
        heartbeat_at: new Date().toISOString(),
        status: done ? "completed" : "running",
        finished_at: done ? new Date().toISOString() : null
      })
      .eq("id", run_id)

    console.log(`[v0][RUN/STEP] Chunk completado. Progreso: ${newProcessedRows}/${run.total_rows}`)

    return NextResponse.json({
      ok: true,
      status: done ? "completed" : "running",
      processed_rows: newProcessedRows,
      total_rows: run.total_rows,
      created_count: run.created_count + createdCount,
      updated_count: run.updated_count + updatedCount,
      skipped_missing_key: run.skipped_missing_key + skipped_missing,
      skipped_invalid_key: run.skipped_invalid_key + skipped_invalid,
      continue: !done
    })

  } catch (error: any) {
    console.error("[v0][RUN/STEP] Error inesperado:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno del servidor" 
    }, { status: 500 })
  }
}
