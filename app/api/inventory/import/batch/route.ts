import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"
import { fetchWithAuth } from "@/lib/import/fetch-with-auth"

const BATCH_SIZE = 1000 // Procesar 1000 filas por batch
export const maxDuration = 60 // Máximo 60s por request

/**
 * Normaliza un header: trim + remove BOM + lowercase + remove accents
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "") // Remove BOM
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, "_") // Spaces → underscore
}

/**
 * Auto-detecta el delimiter leyendo la primera línea
 */
function detectDelimiter(firstLine: string): string {
  const candidates = ["|", ";", "\t", ","]
  const counts = candidates.map(d => ({
    delimiter: d,
    count: (firstLine.match(new RegExp(`\\${d === "\t" ? "t" : d}`, "g")) || []).length
  }))
  const best = counts.reduce((max, curr) => curr.count > max.count ? curr : max)
  return best.count > 0 ? best.delimiter : ","
}

/**
 * POST /api/inventory/import/batch
 * Procesa UN batch de filas (NO calcula total_rows, retorna null)
 * Devuelve: { ok, offset, batch_size, rows_seen, rows_processed, created, updated, missing_ean, invalid_ean, done, next_offset, last_reason }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { sourceId, offset = 0, mode = "upsert", historyId = null } = await request.json()

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Obtener source
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    // 2. Descargar CSV completo (en memoria)
    const fileResponse = await fetchWithAuth({
      url_template: source.url_template,
      auth_type: source.auth_type,
      credentials: source.credentials
    })

    if (!fileResponse.ok) {
      return NextResponse.json({ 
        error: `Error ${fileResponse.status}: ${fileResponse.statusText}` 
      }, { status: fileResponse.status })
    }

    const csvText = await fileResponse.text()
    const fetchElapsed = Date.now() - startTime
    console.log(`[v0][BATCH] CSV downloaded in ${fetchElapsed}ms, ${csvText.length} chars`)

    // 3. Auto-detect delimiter si no está configurado
    let delimiter = source.delimiter || ","
    if (!source.delimiter) {
      const firstLine = csvText.split("\n")[0] || ""
      delimiter = detectDelimiter(firstLine)
      if (offset === 0) {
        console.log(`[v0][BATCH] Auto-detected delimiter: "${delimiter}"`)
      }
    }

    // 4. Parse CSV completo
    const parsed = Papa.parse(csvText, {
      delimiter,
      header: true,
      skipEmptyLines: true
    })

    const headers = parsed.meta.fields || []
    const headersNormalized = headers.map(normalizeHeader)

    // Debug solo en offset=0
    if (offset === 0) {
      console.log(`[v0][BATCH][DEBUG] ======================================`)
      console.log(`[v0][BATCH][DEBUG] Delimiter: "${delimiter}"`)
      console.log(`[v0][BATCH][DEBUG] Headers (first 20):`, headersNormalized.slice(0, 20).join(", "))
    }

    // 5. Normalizar todas las filas
    const headerMap = new Map<string, string>()
    headers.forEach((orig, idx) => {
      headerMap.set(orig, headersNormalized[idx])
    })

    const allRowsRaw = parsed.data as Array<Record<string, any>>
    const allRows = allRowsRaw.map((row) => {
      const normalized: Record<string, string> = {}
      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = headerMap.get(key) || normalizeHeader(key)
        normalized[normalizedKey] = value as string
      })
      return normalized
    })

    const totalRows = allRows.length

    // 6. Tomar batch actual (desde offset hasta offset + BATCH_SIZE)
    const batchRows = allRows.slice(offset, offset + BATCH_SIZE)
    const rows_seen = batchRows.length
    const done = rows_seen === 0 || (offset + rows_seen >= totalRows)

    // Debug solo en offset=0
    if (offset === 0 && batchRows.length > 0) {
      const sampleRow = batchRows[0]
      const sampleKeys = Object.keys(sampleRow).slice(0, 20)
      const sampleEan = sampleRow["ean"] || sampleRow["ean13"] || sampleRow["gtin"]
      const sampleIsbn = sampleRow["isbn"] || sampleRow["isbn13"]
      console.log(`[v0][BATCH][DEBUG] Sample row keys (first 20):`, sampleKeys.join(", "))
      console.log(`[v0][BATCH][DEBUG] Sample EAN raw: "${sampleEan}"`)
      console.log(`[v0][BATCH][DEBUG] Sample ISBN raw: "${sampleIsbn}"`)
      if (sampleEan) {
        const digitsOnly = sampleEan.replace(/\D/g, "")
        console.log(`[v0][BATCH][DEBUG] Sample EAN digits only: "${digitsOnly}" (length=${digitsOnly.length})`)
      }
      console.log(`[v0][BATCH][DEBUG] ======================================`)
    }

    // 7. Procesar batch
    const productsToInsert: Record<string, any>[] = []
    let missing_ean = 0
    let invalid_ean = 0

    for (const row of batchRows) {
      // Buscar EAN/ISBN
      const eanRaw = row["ean"] || row["ean13"] || row["gtin"] || row["codigo_de_barras"]
      const isbnRaw = row["isbn"] || row["isbn13"]
      
      let ean = eanRaw?.toString().replace(/\D/g, "") || null
      if (!ean && isbnRaw) {
        ean = isbnRaw.toString().replace(/\D/g, "")
      }

      if (!ean) {
        missing_ean++
        continue
      }

      // Validar longitud EAN (8/12/13/14 dígitos)
      if (![8, 12, 13, 14].includes(ean.length)) {
        invalid_ean++
        continue
      }

      const title = row["titulo"] || row["title"] || ean
      const author = row["autor"] || row["author"] || null
      const price = parseFloat(row["pvp"]?.replace(",", ".") || row["precio"]?.replace(",", ".") || "0")
      const imageUrl = row["portada"] || row["imagen"] || row["image"] || null
      const stock = parseInt(row["stock"] || "0", 10)

      productsToInsert.push({
        sku: ean,
        ean,
        isbn: isbnRaw || null,
        title,
        author,
        cost_price: price, // Asumir que price del CSV es cost_price
        image_url: imageUrl,
        stock,
        brand: row["marca"] || row["brand"] || null,
        category: row["categoria"] || row["category"] || null,
        description: row["descripcion"] || row["description"] || null,
      })
    }

    const rows_processed = productsToInsert.length

    // 8. Upsert en DB
    let created = 0
    let updated = 0
    let upsert_attempted = 0
    let last_reason: string | null = null
    let last_error: string | null = null

    if (productsToInsert.length > 0) {
      upsert_attempted = productsToInsert.length
      
      const { error } = await supabase
        .from("products")
        .upsert(productsToInsert, { onConflict: "ean" })

      if (error) {
        console.error(`[v0][BATCH] Upsert error:`, error)
        last_error = error.message
        last_reason = "upsert_failed"
      } else {
        // Simplificado: contar todos como updated (o podríamos SELECT antes para distinguir)
        updated = productsToInsert.length
        last_reason = "success"
      }
    } else {
      // No se insertó nada
      if (missing_ean === rows_seen) {
        last_reason = "all_missing_ean"
      } else if (invalid_ean === rows_seen) {
        last_reason = "all_invalid_ean"
      } else if (rows_seen === 0) {
        last_reason = "no_rows_in_batch"
      } else {
        last_reason = "upsert_never_called"
      }
    }

    // 9. Calcular next_offset
    const next_offset = done ? null : offset + rows_seen

    // Log del batch (sin spam)
    console.log(`[v0][BATCH] offset=${offset}, seen=${rows_seen}, processed=${rows_processed}, missing_ean=${missing_ean}, invalid_ean=${invalid_ean}, upsert_attempted=${upsert_attempted}, created=${created}, updated=${updated}, done=${done}, last_reason=${last_reason}`)

    // 10. Actualizar import_history si existe
    if (historyId) {
      const { data: history } = await supabase
        .from("import_history")
        .select("*")
        .eq("id", historyId)
        .single()

      if (history) {
        const totalProcessed = (history.processed_rows || 0) + rows_processed
        const totalCreated = (history.created_count || 0) + created
        const totalUpdated = (history.updated_count || 0) + updated
        const totalSkipped = (history.skipped_count || 0) + missing_ean + invalid_ean

        await supabase
          .from("import_history")
          .update({
            status: done ? "completed" : "running",
            processed_rows: totalProcessed,
            created_count: totalCreated,
            updated_count: totalUpdated,
            skipped_count: totalSkipped,
            error_count: last_error ? (history.error_count || 0) + 1 : history.error_count,
            current_offset: next_offset,
            total_rows: null, // NO inventamos total, dejamos null
            last_message: done ? `Completado: ${totalProcessed} procesadas` : `Procesando lote offset ${offset}`,
            completed_at: done ? new Date().toISOString() : null
          })
          .eq("id", historyId)
      }
    }

    const totalElapsed = Date.now() - startTime

    // 11. Respuesta
    return NextResponse.json({
      ok: true,
      offset,
      batch_size: BATCH_SIZE,
      rows_seen,
      rows_processed,
      created,
      updated,
      missing_ean,
      invalid_ean,
      done,
      next_offset,
      last_reason,
      last_error,
      elapsed_ms: totalElapsed,
      // Debug solo en primer batch
      debug: offset === 0 ? {
        delimiter,
        headers_normalized: headersNormalized.slice(0, 20),
        sample_row_keys: batchRows[0] ? Object.keys(batchRows[0]).slice(0, 20) : [],
        sample_ean: batchRows[0]?.["ean"] || batchRows[0]?.["ean13"] || "(no encontrado)"
      } : undefined
    })

  } catch (error: any) {
    console.error("[v0][BATCH] Fatal error:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno" 
    }, { status: 500 })
  }
}
