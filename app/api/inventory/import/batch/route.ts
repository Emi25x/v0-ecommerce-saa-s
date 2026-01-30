import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

const BATCH_SIZE = 3000 // Procesar 3000 productos por request

export const maxDuration = 60 // Máximo tiempo permitido en Vercel

// Cache global para el archivo CSV parseado (evita re-descarga en cada request)
const csvCache: Map<string, { data: Record<string, string>[], timestamp: number }> = new Map()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutos

export async function POST(request: NextRequest) {
  try {
    const { sourceId, offset = 0, mode = "update" } = await request.json()

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId es requerido" }, { status: 400 })
    }

    console.log(`[v0] Batch import: Modo = ${mode}, Offset = ${offset}`)

    const supabase = await createClient()

    // Obtener la fuente
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    const fileUrl = source.url_template
    if (!fileUrl) {
      return NextResponse.json({ error: "URL no configurada" }, { status: 400 })
    }

    // Verificar si tenemos el CSV en cache
    let data: Record<string, string>[]
    const cached = csvCache.get(sourceId)
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[v0] Batch import: Usando CSV desde cache`)
      data = cached.data
    } else {
      console.log(`[v0] Batch import: Descargando archivo desde ${fileUrl}`)

      // Descargar el archivo CSV
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        return NextResponse.json({ error: `Error descargando: ${fileResponse.status}` }, { status: 500 })
      }

      const csvText = await fileResponse.text()
      console.log(`[v0] Batch import: Archivo descargado, ${csvText.length} caracteres`)

      // Parsear CSV
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        delimiter: "|",
      })

      data = parseResult.data as Record<string, string>[]
      
      // Guardar en cache
      csvCache.set(sourceId, { data, timestamp: Date.now() })
      console.log(`[v0] Batch import: CSV guardado en cache`)
    }

    const totalRows = data.length

    console.log(`[v0] Batch import: ${totalRows} filas totales, procesando desde offset ${offset}`)

    // Si el offset es mayor que el total, ya terminamos
    if (offset >= totalRows) {
      return NextResponse.json({
        success: true,
        done: true,
        total: totalRows,
        processed: totalRows,
      })
    }

    // Obtener el lote actual
    const batch = data.slice(offset, offset + BATCH_SIZE)
    const mapping = source.column_mapping || {}

    let updatedCount = 0
    let createdCount = 0
    let failedCount = 0

    // Preparar productos para inserción masiva
    const productsToInsert: Array<Record<string, any>> = []

    const now = new Date().toISOString()

    for (const row of batch) {
      const sku = row[mapping.sku || "SKU"]?.trim()
      const ean = row[mapping.ean || "EAN"]?.trim()
      const title = row[mapping.title || "TITULO"]?.trim()
      const price = parseFloat(row[mapping.price || "PRECIO"]?.replace(",", ".") || "0")
      const description = row[mapping.description]?.trim() || null
      const brand = row[mapping.brand]?.trim() || null
      const category = row[mapping.category]?.trim() || null
      const stock = parseInt(row[mapping.stock] || "0", 10)
      const internalCode = row[mapping.internal_code]?.trim() || null

      if (!sku) continue

      productsToInsert.push({
        sku,
        ean: ean || null,
        title: title || sku,
        price: price || 0,
        description,
        brand,
        category,
        stock,
        internal_code: internalCode,
        source: [sourceId],
        created_at: now,
        updated_at: now,
      })
    }

    // Inserción masiva en chunks de 500
    const CHUNK_SIZE = 500
    for (let i = 0; i < productsToInsert.length; i += CHUNK_SIZE) {
      const chunk = productsToInsert.slice(i, i + CHUNK_SIZE)
      
      if (mode === "create" || mode === "upsert") {
        // Filtrar productos sin EAN para el upsert por EAN
        const chunkWithEan = chunk.filter(p => p.ean)
        
        if (chunkWithEan.length > 0) {
          const { error } = await supabase
            .from("products")
            .upsert(chunkWithEan, { onConflict: "ean", ignoreDuplicates: mode === "create" })
          
          if (error) {
            console.error("[v0] Error insertando chunk:", error.message)
            failedCount += chunkWithEan.length
          } else {
            createdCount += chunkWithEan.length
          }
        }
      } else if (mode === "update") {
        // Para update, usamos upsert que actualiza si existe (por EAN)
        const chunkWithEan = chunk.filter(p => p.ean)
        
        if (chunkWithEan.length > 0) {
          const { error } = await supabase
            .from("products")
            .upsert(chunkWithEan, { onConflict: "ean", ignoreDuplicates: false })
          
          if (error) {
            console.error("[v0] Error actualizando chunk:", error.message)
            failedCount += chunkWithEan.length
          } else {
            updatedCount += chunkWithEan.length
          }
        }
      }
    }

    const newOffset = offset + batch.length
    const done = newOffset >= totalRows
    const progress = Math.round((newOffset / totalRows) * 100)

    console.log(`[v0] Batch import: Lote procesado. Creados: ${createdCount}, Actualizados: ${updatedCount}, Fallidos: ${failedCount}, Progreso: ${progress}%`)

    return NextResponse.json({
      success: true,
      done,
      total: totalRows,
      processed: newOffset,
      created: createdCount,
      updated: updatedCount,
      failed: failedCount,
      nextOffset: done ? null : newOffset,
      progress,
    })
  } catch (error) {
    console.error("[v0] Error en batch import:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
