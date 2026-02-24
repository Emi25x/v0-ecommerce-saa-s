import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"
import { fetchWithAuth } from "@/lib/import/fetch-with-auth"
import { normalizeEan } from "@/lib/ean-utils"
import { ImportHeartbeat } from "@/lib/import/heartbeat"
import { inflateRawSync } from "node:zlib"

const BATCH_SIZE = 5000 // Procesar 5000 filas por batch (optimizado)
export const maxDuration = 300 // Máximo 300s (5 minutos) por request

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
  const heartbeat = new ImportHeartbeat(null) // Se inicializará después
  
  try {
    const { sourceId, offset = 0, mode = "upsert", historyId = null } = await request.json()

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId es requerido" }, { status: 400 })
    }

    // Iniciar heartbeat si tenemos historyId
    if (historyId) {
      const hb = new ImportHeartbeat(historyId)
      hb.start()
      // Guardar referencia para limpieza
      Object.assign(heartbeat, hb)
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

    // Descargar como buffer para detectar ZIP
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())
    console.log(`[v0][BATCH] File downloaded: ${fileBuffer.length} bytes`)
    
    // Detectar si es ZIP (magic bytes: PK = 0x50 0x4B)
    const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B
    console.log(`[v0][BATCH] Is ZIP: ${isZip}`)
    
    let csvText: string
    
    if (isZip) {
      console.log(`[v0][BATCH] Extracting CSV from ZIP...`)
      try {
        // Buscar local file header: 0x04034b50
        let offset_zip = 0
        let found = false
        
        while (offset_zip < fileBuffer.length - 30 && !found) {
          if (fileBuffer.readUInt32LE(offset_zip) === 0x04034b50) {
            const compressionMethod = fileBuffer.readUInt16LE(offset_zip + 8)
            const compressedSize = fileBuffer.readUInt32LE(offset_zip + 18)
            const fileNameLength = fileBuffer.readUInt16LE(offset_zip + 26)
            const extraFieldLength = fileBuffer.readUInt16LE(offset_zip + 28)
            
            const fileName = fileBuffer.toString('utf-8', offset_zip + 30, offset_zip + 30 + fileNameLength)
            console.log(`[v0][BATCH] Found file in ZIP: ${fileName}`)
            
            if (fileName.toLowerCase().endsWith('.csv')) {
              const dataStart = offset_zip + 30 + fileNameLength + extraFieldLength
              const compressedData = fileBuffer.subarray(dataStart, dataStart + compressedSize)
              
              if (compressionMethod === 0) {
                // For very large files, convert in chunks to avoid string length limit
                const chunks: string[] = []
                const chunkSize = 100 * 1024 * 1024 // 100MB chunks
                for (let i = 0; i < compressedData.length; i += chunkSize) {
                  chunks.push(compressedData.subarray(i, i + chunkSize).toString('utf-8'))
                }
                csvText = chunks.join('')
                console.log(`[v0][BATCH] CSV extracted (stored): ${csvText.length} chars`)
              } else if (compressionMethod === 8) {
                const decompressed = inflateRawSync(compressedData)
                // Convert in chunks
                const chunks: string[] = []
                const chunkSize = 100 * 1024 * 1024 // 100MB chunks
                for (let i = 0; i < decompressed.length; i += chunkSize) {
                  chunks.push(decompressed.subarray(i, i + chunkSize).toString('utf-8'))
                }
                csvText = chunks.join('')
                console.log(`[v0][BATCH] CSV extracted (DEFLATE): ${csvText.length} chars`)
              } else {
                throw new Error(`Unsupported compression method: ${compressionMethod}`)
              }
              found = true
            }
          }
          offset_zip++
        }
        
        if (!found) {
          throw new Error("No CSV file found in ZIP")
        }
      } catch (error: any) {
        console.error(`[v0][BATCH] Error extracting ZIP:`, error)
        return NextResponse.json({ 
          error: `Error extracting ZIP: ${error.message}` 
        }, { status: 500 })
      }
    } else {
      csvText = fileBuffer.toString('utf-8')
      console.log(`[v0][BATCH] Direct CSV file: ${csvText.length} chars`)
    }
    
    const fetchElapsed = Date.now() - startTime
    console.log(`[v0][BATCH] Processing completed in ${fetchElapsed}ms`)

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
      // Buscar EAN/ISBN usando normalizeEan (previene notación científica)
      const eanRaw = row["ean"] || row["ean13"] || row["gtin"] || row["codigo_de_barras"]
      const isbnRaw = row["isbn"] || row["isbn13"]
      
      // Usar normalizeEan que maneja correctamente números grandes
      let ean = normalizeEan(eanRaw || isbnRaw)

      if (!ean) {
        missing_ean++
        continue
      }

      // Validar longitud EAN (13 dígitos después de normalización)
      if (ean.length !== 13) {
        invalid_ean++
        continue
      }

      const title = row["titulo"] || row["title"] || ean
      const author = row["autor"] || row["author"] || null
      const price = parseFloat(row["pvp"]?.replace(",", ".") || row["precio"]?.replace(",", ".") || "0")
      const imageUrl = row["portada"] || row["imagen"] || row["image"] || null
      const stock = parseInt(row["stock"] || "0", 10)

      productsToInsert.push({
        ean,
        isbn: isbnRaw || null,
        title,
        author,
        cost_price: price,
        image_url: imageUrl,
        stock,
        brand: row["marca"] || row["brand"] || null,
        category: row["categoria"] || row["category"] || null,
        description: row["descripcion"] || row["description"] || null,
      })
    }

    const rows_processed = productsToInsert.length

    // 8. Upsert en DB - chunked para mejor performance
    let created = 0
    let updated = 0
    let upsert_attempted = 0
    let last_reason: string | null = null
    let last_error: string | null = null

    if (productsToInsert.length > 0) {
      upsert_attempted = productsToInsert.length
      
      // Detectar si es una fuente de Stock (solo actualiza, no crea)
      const isStockImport = source.name.toLowerCase().includes('stock')
      console.log(`[v0][BATCH] Is Stock import: ${isStockImport}`)
      
      // Dividir en chunks de 100 para evitar timeouts
      const UPSERT_CHUNK_SIZE = 100
      const chunks = []
      for (let i = 0; i < productsToInsert.length; i += UPSERT_CHUNK_SIZE) {
        chunks.push(productsToInsert.slice(i, i + UPSERT_CHUNK_SIZE))
      }

      console.log(`[v0][BATCH] Processing ${productsToInsert.length} products in ${chunks.length} chunks`)

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex]
        console.log(`[v0][BATCH] Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} products)`)

        // Buscar productos existentes por EAN
        const eans = chunk.map(p => p.ean)
        const { data: existingProducts } = await supabase
          .from("products")
          .select("ean, sku")
          .in("ean", eans)
        
        // Crear map de EAN -> SKU existente
        const eanToSku = new Map<string, string>()
        existingProducts?.forEach(p => eanToSku.set(p.ean, p.sku))
        
        let chunkToUpsert: any[]
        
        if (isStockImport) {
          // Stock: SOLO actualizar productos existentes, ignorar los nuevos
          chunkToUpsert = chunk
            .filter(p => eanToSku.has(p.ean)) // Solo los que existen
            .map(p => ({
              ...p,
              sku: eanToSku.get(p.ean)! // Usar SKU existente
            }))
          
          const skipped = chunk.length - chunkToUpsert.length
          if (skipped > 0) {
            console.log(`[v0][BATCH] Stock mode: skipped ${skipped} new products (not in DB)`)
          }
        } else {
          // Catálogos: upsert normal (crea o actualiza)
          chunkToUpsert = chunk.map(p => ({
            ...p,
            sku: eanToSku.get(p.ean) || `${p.ean}-${Date.now().toString(36)}`
          }))
        }

        if (chunkToUpsert.length === 0) {
          console.log(`[v0][BATCH] Chunk ${chunkIndex + 1}: nothing to upsert (all filtered)`)
          continue
        }

        const { error: chunkError } = await supabase
          .from("products")
          .upsert(chunkToUpsert, { onConflict: "ean" })

        if (error) {
          console.error(`[v0][BATCH] Upsert error in chunk ${i + 1}/${chunks.length}:`, error)
          last_error = error.message
          last_reason = "upsert_failed"
          break
        } else {
          updated += chunk.length
        }
      }

      if (!last_error) {
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

    // Detener heartbeat
    heartbeat.stop()

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
    heartbeat.stop() // Limpiar heartbeat en caso de error
    return NextResponse.json({ 
      error: error.message || "Error interno" 
    }, { status: 500 })
  }
}
