import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

const BATCH_SIZE = 3000 // Procesar 3000 productos por request

export const maxDuration = 60 // Máximo tiempo permitido en Vercel

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

    const data = parseResult.data as Record<string, string>[]
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
    const productsToInsert: Array<{
      sku: string
      ean: string | null
      title: string
      price: number
      source: string[]
      created_at: string
      updated_at: string
    }> = []

    const now = new Date().toISOString()

    for (const row of batch) {
      const sku = row[mapping.sku || "SKU"]?.trim()
      const ean = row[mapping.ean || "EAN"]?.trim()
      const title = row[mapping.title || "TITULO"]?.trim()
      const price = parseFloat(row[mapping.price || "PRECIO"]?.replace(",", ".") || "0")

      if (!sku) continue

      productsToInsert.push({
        sku,
        ean: ean || null,
        title: title || sku,
        price: price || 0,
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
        const { error, count } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "sku", ignoreDuplicates: mode === "create" })
        
        if (error) {
          console.error("[v0] Error insertando chunk:", error.message)
          failedCount += chunk.length
        } else {
          createdCount += chunk.length
        }
      } else if (mode === "update") {
        // Para update, solo actualizamos EAN donde no existe
        for (const product of chunk) {
          if (product.ean) {
            const { count } = await supabase
              .from("products")
              .update({ ean: product.ean, updated_at: now })
              .eq("sku", product.sku)
              .is("ean", null)
            if (count && count > 0) updatedCount++
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
