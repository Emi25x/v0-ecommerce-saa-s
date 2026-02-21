import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

export const maxDuration = 30 // Anti-timeout: máximo 30s por chunk

const CHUNK_SIZE = 2000 // Procesar 2000 filas por vez

/**
 * Normaliza un header del CSV:
 * - Quita BOM invisible (\uFEFF)
 * - Trim de espacios
 * - toLowerCase
 * - Remueve tildes/acentos
 * - Reemplaza espacios por underscore
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "") // Quitar BOM
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/\s+/g, "_") // Espacios → underscore
}

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

    // 3. Auto-detectar delimiter en primer chunk si no existe en metadata
    const runMetadata = run.metadata as any
    let detectedDelimiter = runMetadata?.detected_delimiter || null
    
    if (!detectedDelimiter && run.processed_rows === 0) {
      // Auto-detectar delimiter mirando la primera línea
      const firstLine = csvText.split("\n")[0] || ""
      const candidates = ["|", ";", "\t", ","]
      const counts = candidates.map(d => ({
        delimiter: d,
        count: firstLine.split(d).length
      }))
      
      // El delimiter más probable es el que tiene más ocurrencias
      counts.sort((a, b) => b.count - a.count)
      detectedDelimiter = counts[0].delimiter
      
      console.log(`[v0][RUN/STEP] Auto-detected delimiter: "${detectedDelimiter}" (counts:`, 
        counts.map(c => `"${c.delimiter}"=${c.count}`).join(", "), ")")
      
      // Guardar en metadata para siguientes chunks
      await supabase
        .from("import_runs")
        .update({
          metadata: {
            ...runMetadata,
            detected_delimiter: detectedDelimiter
          }
        })
        .eq("id", run_id)
    } else if (run.processed_rows === 0) {
      console.log(`[v0][RUN/STEP] Usando delimiter del metadata: "${detectedDelimiter}"`)
    }
    
    // Fallback a coma si aún no hay delimiter
    if (!detectedDelimiter) {
      detectedDelimiter = ","
      console.log(`[v0][RUN/STEP] Warning: No se pudo detectar delimiter, usando "," por defecto`)
    }

    // 4. Parsear CSV completo usando el delimiter correcto
    const parsed = Papa.parse(csvText, { 
      header: true, 
      skipEmptyLines: true,
      delimiter: detectedDelimiter 
    })
    
    // 5. Normalizar TODOS los headers
    const headersOriginal = parsed.meta.fields || []
    const headersNormalized = headersOriginal.map(normalizeHeader)
    
    // Debug headers (SIEMPRE en primer chunk)
    if (run.processed_rows === 0) {
      console.log(`[v0][DEBUG] ========================================`)
      console.log(`[v0][DEBUG] === INICIO DEBUG PRIMER CHUNK ===`)
      console.log(`[v0][DEBUG] ========================================`)
      console.log(`[v0][DEBUG] Total headers detectados: ${headersOriginal.length}`)
      console.log(`[v0][DEBUG] === HEADERS ORIGINALES (primeros 30) ===`)
      console.log(headersOriginal.slice(0, 30).join(" | "))
      console.log(`[v0][DEBUG] === HEADERS NORMALIZADOS (primeros 30) ===`)
      console.log(headersNormalized.slice(0, 30).join(" | "))
      console.log(`[v0][DEBUG] Delimiter usado: "${detectedDelimiter}"`)
      console.log(`[v0][DEBUG] ========================================`)
    }
    
    // Crear mapeo: header original → normalizado
    const headerMap = new Map<string, string>()
    headersOriginal.forEach((orig, idx) => {
      headerMap.set(orig, headersNormalized[idx])
    })
    
    // Convertir TODAS las filas a usar headers normalizados
    const allRowsRaw = parsed.data as Array<Record<string, any>>
    const allRows = allRowsRaw.map((row) => {
      const normalized: Record<string, string> = {}
      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = headerMap.get(key) || normalizeHeader(key)
        normalized[normalizedKey] = value
      })
      return normalized
    })

    console.log(`[v0][RUN/STEP] CSV parseado: ${allRows.length} filas totales (headers normalizados)`)

    // 6. Tomar chunk actual
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

    // 7. Obtener source para mapping
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", run.source_id)
      .single()

    if (!source) {
      return NextResponse.json({ error: "Source no encontrada" }, { status: 404 })
    }

    const mapping = source.column_mapping || {}

    // 8. Ya no necesitamos auto-detectar porque los headers están normalizados
    // Accedemos directamente usando headers normalizados: "ean", "isbn", "titulo", etc.
    
    // 9. Procesar chunk
    const productsToInsert: Array<Record<string, any>> = []
    let skipped_missing = 0
    let skipped_invalid = 0

    const normalizeEan = (raw: string | undefined): string | null => {
      if (!raw) return null
      const digits = raw.replace(/\D/g, "")
      return digits || null
    }

    for (const row of chunk) {
      // Acceder directamente con headers normalizados
      // "Ean" → "ean", "EAN" → "ean", " Ean " → "ean", "﻿Ean" → "ean"
      let eanRaw = row["ean"]?.trim() || row["ean13"]?.trim() || row["gtin"]?.trim()
      const isbnRaw = row["isbn"]?.trim() || row["isbn13"]?.trim()
      
      // Debug primera fila del primer chunk
      if (run.processed_rows === 0 && productsToInsert.length === 0 && skipped_missing === 0) {
        console.log(`[v0][DEBUG] === PRIMERA FILA - EXTRACCIÓN ===`)
        console.log(`[v0][DEBUG] Total claves en row: ${Object.keys(row).length}`)
        console.log(`[v0][DEBUG] TODAS las claves (primeras 30):`, Object.keys(row).slice(0, 30).join(" | "))
        console.log(`[v0][DEBUG] Buscando: row["ean"] = "${row["ean"] || '(NO EXISTE)'}"`)
        console.log(`[v0][DEBUG] Buscando: row["ean13"] = "${row["ean13"] || '(NO EXISTE)'}"`)
        console.log(`[v0][DEBUG] Buscando: row["gtin"] = "${row["gtin"] || '(NO EXISTE)'}"`)
        console.log(`[v0][DEBUG] Buscando: row["isbn"] = "${row["isbn"] || '(NO EXISTE)'}"`)
        console.log(`[v0][DEBUG] Buscando: row["isbn13"] = "${row["isbn13"] || '(NO EXISTE)'}"`)
        console.log(`[v0][DEBUG] eanRaw resultante = "${eanRaw || '(VACÍO)'}"`)
        console.log(`[v0][DEBUG] isbnRaw resultante = "${isbnRaw || '(VACÍO)'}"`)
        
        // Mostrar primeros 10 valores de la fila como ejemplo
        const firstKeys = Object.keys(row).slice(0, 10)
        console.log(`[v0][DEBUG] === VALORES DE EJEMPLO (primeros 10 campos) ===`)
        firstKeys.forEach(key => {
          const val = row[key]
          console.log(`[v0][DEBUG]   "${key}" => "${val ? val.substring(0, 60) : '(vacío)'}"`)
        })
      }
      
      let ean = normalizeEan(eanRaw)
      if (!ean && isbnRaw) {
        ean = normalizeEan(isbnRaw)
      }

      if (!ean) {
        skipped_missing++
        if (run.processed_rows === 0 && skipped_missing === 1) {
          console.log(`[v0][DEBUG] DESCARTADO: EAN/ISBN faltante`)
        }
        continue
      }

      if (ean.length !== 13) {
        skipped_invalid++
        if (run.processed_rows === 0 && skipped_invalid === 1) {
          console.log(`[v0][DEBUG] DESCARTADO: EAN inválido (longitud=${ean.length}, esperado=13)`)
        }
        continue
      }

      const title = row["titulo"]?.trim() || row["title"]?.trim() || ean
      const author = row["autor"]?.trim() || row["author"]?.trim() || null
      const price = parseFloat(row["pvp"]?.replace(",", ".") || row["precio"]?.replace(",", ".") || row["price"]?.replace(",", ".") || "0")
      const imageUrl = row["portada"]?.trim() || row["imagen"]?.trim() || row["image"]?.trim() || null

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

    // 10. Insertar en DB (upsert por EAN)
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

    // 11. Actualizar run
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

    // Preparar info de debug para retornar (solo en primer chunk)
    const debugInfo = run.processed_rows === 0 ? {
      headers_original: headersOriginal.slice(0, 30),
      headers_normalized: headersNormalized.slice(0, 30),
      delimiter: detectedDelimiter,
      first_row_keys: chunk.length > 0 ? Object.keys(chunk[0]).slice(0, 20) : [],
      first_row_ean: chunk.length > 0 ? (chunk[0]["ean"] || '(NO EXISTE)') : null,
      first_row_isbn: chunk.length > 0 ? (chunk[0]["isbn"] || '(NO EXISTE)') : null,
      first_row_sample: chunk.length > 0 ? Object.fromEntries(
        Object.entries(chunk[0]).slice(0, 5).map(([k, v]: [string, any]) => [k, v?.substring?.(0, 50) || v])
      ) : null
    } : undefined

    return NextResponse.json({
      ok: true,
      status: done ? "completed" : "running",
      processed_rows: newProcessedRows,
      total_rows: run.total_rows,
      created_count: run.created_count + createdCount,
      updated_count: run.updated_count + updatedCount,
      skipped_missing_key: run.skipped_missing_key + skipped_missing,
      skipped_invalid_key: run.skipped_invalid_key + skipped_invalid,
      continue: !done,
      debug_first_chunk: debugInfo // Solo en primer chunk
    })

  } catch (error: any) {
    console.error("[v0][RUN/STEP] Error inesperado:", error)
    return NextResponse.json({ 
      error: error.message || "Error interno del servidor" 
    }, { status: 500 })
  }
}
