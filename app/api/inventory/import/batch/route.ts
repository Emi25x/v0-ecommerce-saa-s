import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"
import { fetchWithAuth } from "@/lib/import/fetch-with-auth"
import { Readable } from "node:stream"

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
 * Procesa UN batch de filas usando STREAM parsing (no carga CSV completo)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { sourceId, offset = 0, mode = "upsert", historyId = null } = await request.json()

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId es requerido" }, { status: 400 })
    }

    console.log(`[v0][BATCH] START: sourceId=${sourceId}, mode=${mode}, offset=${offset}`)

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

    // 2. Descargar CSV con auth
    console.log(`[v0][BATCH] Fetching: ${source.url_template}`)
    const fileResponse = await fetchWithAuth({
      url_template: source.url_template,
      auth_type: source.auth_type,
      credentials: source.credentials
    })

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text()
      console.error(`[v0][BATCH] Fetch error: ${fileResponse.status}`, errorText.substring(0, 200))
      return NextResponse.json({ 
        error: `Error ${fileResponse.status}: ${fileResponse.statusText}` 
      }, { status: fileResponse.status })
    }

    // 3. Convertir web stream → node stream
    if (!fileResponse.body) {
      return NextResponse.json({ error: "Response body is null" }, { status: 500 })
    }

    const nodeStream = Readable.fromWeb(fileResponse.body as any)

    // 4. Stream parse con Papa
    let rowIndex = 0 // Índice de la fila de datos (0 = primera data row)
    let batchRows: Record<string, any>[] = []
    let totalRowsEstimate = 0
    let headers: string[] = []
    let headersNormalized: string[] = []
    let delimiter = source.delimiter || ","
    let parserAborted = false

    // Para auto-detect: guardar primera línea
    let firstLineSeen = false
    let firstLineBuffer = ""

    const parsePromise = new Promise<void>((resolve, reject) => {
      const parser = Papa.parse(nodeStream, {
        delimiter, // Inicial, se ajustará después del auto-detect
        header: true,
        skipEmptyLines: true,
        
        step: (results: any, parserInstance: any) => {
          if (parserAborted) return

          // Auto-detect delimiter en primera fila
          if (!firstLineSeen && results.meta?.fields) {
            firstLineSeen = true
            headers = results.meta.fields
            
            // Auto-detect si no hay delimiter definido
            if (!source.delimiter) {
              const firstLine = headers.join(delimiter)
              const detectedDelimiter = detectDelimiter(firstLine)
              if (detectedDelimiter !== delimiter) {
                console.log(`[v0][BATCH] Auto-detected delimiter: "${detectedDelimiter}" (was "${delimiter}")`)
                delimiter = detectedDelimiter
                // Reiniciar parser con nuevo delimiter (cancelar y volver a empezar)
                parserInstance.abort()
                parserAborted = true
                reject(new Error("REPARSE_WITH_NEW_DELIMITER"))
                return
              }
            }

            // Normalizar headers
            headersNormalized = headers.map(normalizeHeader)
            
            if (offset === 0) {
              console.log(`[v0][BATCH] Headers (first 20):`, headersNormalized.slice(0, 20).join(", "))
              console.log(`[v0][BATCH] Delimiter: "${delimiter}"`)
            }
          }

          totalRowsEstimate++

          // Saltar hasta offset
          if (rowIndex < offset) {
            rowIndex++
            return
          }

          // Recolectar hasta BATCH_SIZE
          if (batchRows.length < BATCH_SIZE) {
            // Normalizar keys del row
            const normalizedRow: Record<string, any> = {}
            Object.entries(results.data).forEach(([key, value]) => {
              const idx = headers.indexOf(key)
              const normalizedKey = idx >= 0 ? headersNormalized[idx] : normalizeHeader(key)
              normalizedRow[normalizedKey] = value
            })
            batchRows.push(normalizedRow)
            rowIndex++
          }

          // Si ya completamos el batch, abort
          if (batchRows.length >= BATCH_SIZE) {
            parserInstance.abort()
            parserAborted = true
            resolve()
          }
        },
        
        complete: () => {
          if (!parserAborted) {
            console.log(`[v0][BATCH] Parse complete. Total rows estimate: ${totalRowsEstimate}`)
            resolve()
          }
        },
        
        error: (error: any) => {
          console.error(`[v0][BATCH] Parse error:`, error)
          reject(error)
        }
      })
    })

    try {
      await parsePromise
    } catch (error: any) {
      if (error.message === "REPARSE_WITH_NEW_DELIMITER") {
        // Necesitamos rehacer el request con el nuevo delimiter detectado
        // Por ahora, retornamos error y pedimos retry con delimiter correcto
        return NextResponse.json({
          error: `Delimiter auto-detectado: "${delimiter}". Reintenta con este delimiter.`,
          detected_delimiter: delimiter
        }, { status: 400 })
      }
      throw error
    }

    const fetchElapsed = Date.now() - startTime
    console.log(`[v0][BATCH] Fetched & parsed in ${fetchElapsed}ms. Batch size: ${batchRows.length}`)

    // 5. Procesar batch
    const mapping = (source.column_mapping as Record<string, any>) || {}
    const productsToInsert: Record<string, any>[] = []
    let skippedMissingEan = 0
    let skippedInvalidEan = 0

    for (const row of batchRows) {
      // Buscar EAN en headers normalizados
      const eanRaw = row["ean"] || row["ean13"] || row["gtin"] || row["codigo_de_barras"]
      const isbnRaw = row["isbn"] || row["isbn13"]
      
      let ean = eanRaw?.toString().replace(/\D/g, "") || null
      if (!ean && isbnRaw) {
        ean = isbnRaw.toString().replace(/\D/g, "")
      }

      // Debug primera fila
      if (offset === 0 && productsToInsert.length === 0 && skippedMissingEan === 0) {
        console.log(`[v0][BATCH] First row keys:`, Object.keys(row).slice(0, 20).join(", "))
        console.log(`[v0][BATCH] First row ean="${row["ean"]}", isbn="${row["isbn"]}"`)
        console.log(`[v0][BATCH] Extracted EAN: "${ean}"`)
      }

      if (!ean) {
        skippedMissingEan++
        continue
      }

      // Validar longitud EAN (8/12/13/14 dígitos)
      if (![8, 12, 13, 14].includes(ean.length)) {
        skippedInvalidEan++
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
        price,
        image_url: imageUrl,
        stock,
        brand: row["marca"] || row["brand"] || null,
        category: row["categoria"] || row["category"] || null,
        description: row["descripcion"] || row["description"] || null,
      })
    }

    // 6. Insertar en DB
    let createdCount = 0
    let updatedCount = 0
    let failedCount = 0

    if (productsToInsert.length > 0) {
      const { error } = await supabase
        .from("products")
        .upsert(productsToInsert, { onConflict: "ean" })

      if (error) {
        console.error(`[v0][BATCH] DB error:`, error)
        failedCount = productsToInsert.length
      } else {
        // Simplificado: contar todos como updates (o podríamos hacer SELECT antes)
        updatedCount = productsToInsert.length
      }
    }

    // 7. Actualizar import_history si existe
    const newOffset = offset + batchRows.length
    const done = batchRows.length < BATCH_SIZE
    const progress = totalRowsEstimate > 0 ? Math.round((newOffset / totalRowsEstimate) * 100) : 0

    if (historyId) {
      const { data: history } = await supabase
        .from("import_history")
        .select("*")
        .eq("id", historyId)
        .single()

      if (history) {
        await supabase
          .from("import_history")
          .update({
            status: done ? "completed" : "running",
            processed_rows: newOffset,
            created_count: (history.created_count || 0) + createdCount,
            updated_count: (history.updated_count || 0) + updatedCount,
            skipped_count: (history.skipped_count || 0) + skippedMissingEan + skippedInvalidEan,
            error_count: (history.error_count || 0) + failedCount,
            current_offset: newOffset,
            total_rows: totalRowsEstimate,
            last_message: done ? "Importación completada" : `Procesando lote ${Math.floor(newOffset / BATCH_SIZE) + 1}`,
            completed_at: done ? new Date().toISOString() : null
          })
          .eq("id", historyId)
      }
    }

    const totalElapsed = Date.now() - startTime
    console.log(`[v0][BATCH] DONE in ${totalElapsed}ms. Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedMissingEan + skippedInvalidEan}`)

    return NextResponse.json({
      success: true,
      done,
      processed: newOffset,
      total: totalRowsEstimate,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedMissingEan + skippedInvalidEan,
      failed: failedCount,
      nextOffset: done ? null : newOffset,
      progress,
      debug: offset === 0 ? {
        headers: headersNormalized.slice(0, 20),
        delimiter,
        first_row_sample: batchRows[0] ? Object.fromEntries(
          Object.entries(batchRows[0]).slice(0, 5).map(([k, v]: [string, any]) => [k, v?.toString().substring(0, 50)])
        ) : null
      } : undefined
    })

  } catch (error: any) {
    console.error("[v0][BATCH] Fatal error:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno" 
    }, { status: 500 })
  }
}
