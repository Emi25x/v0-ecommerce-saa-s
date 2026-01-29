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
      delimiter: ";",
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

    // Procesar el lote según el modo
    for (const row of batch) {
      try {
        const sku = row[mapping.sku || "SKU"]?.trim()
        const ean = row[mapping.ean || "EAN"]?.trim()
        const title = row[mapping.title || "TITULO"]?.trim()
        const price = parseFloat(row[mapping.price || "PRECIO"]?.replace(",", ".") || "0")

        if (!sku) continue

        if (mode === "update") {
          // Solo actualizar existentes (por SKU) - actualizar EAN si no tiene
          if (ean) {
            const { count } = await supabase
              .from("products")
              .update({ ean, updated_at: new Date().toISOString() })
              .eq("sku", sku)
              .is("ean", null)

            if (count && count > 0) updatedCount++
          }
        } else if (mode === "create") {
          // Solo crear nuevos - verificar si no existe
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("sku", sku)
            .single()

          if (!existing) {
            const { error } = await supabase.from("products").insert({
              sku,
              ean: ean || null,
              name: title || sku,
              price: price || 0,
              source_id: sourceId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            if (!error) createdCount++
          }
        } else if (mode === "upsert") {
          // Crear o actualizar
          const { data: existing } = await supabase
            .from("products")
            .select("id")
            .eq("sku", sku)
            .single()

          if (existing) {
            // Actualizar
            const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
            if (ean) updateData.ean = ean
            if (title) updateData.name = title
            if (price > 0) updateData.price = price

            const { error } = await supabase
              .from("products")
              .update(updateData)
              .eq("sku", sku)

            if (!error) updatedCount++
          } else {
            // Crear
            const { error } = await supabase.from("products").insert({
              sku,
              ean: ean || null,
              name: title || sku,
              price: price || 0,
              source_id: sourceId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            if (!error) createdCount++
          }
        }
      } catch {
        failedCount++
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
