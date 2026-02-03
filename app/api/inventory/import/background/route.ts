import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

const BATCH_SIZE = 100

// Función para normalizar valores
const normalizeValue = (val: string) => String(val).trim().replace(/^0+/, "") || val

// Función para obtener valor de columna case-insensitive
const getColumnValue = (row: Record<string, any>, columnName: string): any => {
  if (row[columnName] !== undefined) return row[columnName]
  const lowerColumnName = columnName.toLowerCase()
  const keys = Object.keys(row)
  const matchingKey = keys.find(k => k.toLowerCase() === lowerColumnName)
  return matchingKey ? row[matchingKey] : undefined
}

export async function POST(request: NextRequest) {
  try {
    const { sourceId, fileUrl, mode = "update" } = await request.json()

    if (!sourceId || !fileUrl) {
      return NextResponse.json({ error: "sourceId y fileUrl son requeridos" }, { status: 400 })
    }

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

    const mapping = source.column_mapping || {}

    // Crear registro de importación
    const { data: importRecord, error: importError } = await supabase
      .from("import_history")
      .insert({
        source_id: sourceId,
        status: "running",
        products_imported: 0,
        products_updated: 0,
        products_failed: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (importError) {
      return NextResponse.json({ error: "Error creando registro de importación" }, { status: 500 })
    }

    // Ejecutar la importación (ahora síncrona)
    console.log("[v0] Background import: Iniciando importación para", source.name)
    const result = await processImportInBackground(sourceId, fileUrl, mode, importRecord.id, source, supabase)

    return NextResponse.json({ 
      success: true, 
      importId: importRecord.id,
      message: "Importación completada",
      summary: result
    })

  } catch (error) {
    console.error("[v0] Error en background import:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// Función que procesa la importación en background
async function processImportInBackground(
  sourceId: string,
  fileUrl: string,
  mode: string,
  importId: string,
  source: any,
  supabaseClient: any
) {
  const supabase = supabaseClient
  const mapping = source.column_mapping || {}

  try {
    console.log("[v0] Background import: Descargando archivo desde", fileUrl)
    
    // Descargar el archivo CSV
    const fileResponse = await fetch(fileUrl)
    if (!fileResponse.ok) {
      await supabase.from("import_history").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", importId)
      console.error("[v0] Error descargando archivo:", fileResponse.status, fileResponse.statusText)
      return { total: 0, imported: 0, updated: 0, failed: 0, error: `Error descargando: ${fileResponse.status}` }
    }

    const csvText = await fileResponse.text()
    console.log("[v0] Background import: Archivo descargado, tamaño:", csvText.length, "caracteres")
    
    // Parsear CSV con delimitador pipe
    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: "|",
    })

    const data = parseResult.data as Record<string, any>[]
    const totalRows = data.length

    let importedCount = 0
    let updatedCount = 0
    let failedCount = 0

    // Actualizar total en import_history
    await supabase.from("import_history").update({ 
      products_total: totalRows 
    }).eq("id", importId)

    // Procesar en batches
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE)

      for (const row of batch) {
        try {
          const skuColumn = mapping.sku || "sku"
          const eanColumn = mapping.ean || "ean"

          let sku = getColumnValue(row, skuColumn)
          let ean = getColumnValue(row, eanColumn)
          const price = getColumnValue(row, mapping.price || "price")
          const stock = getColumnValue(row, mapping.stock || "stock")
          const title = getColumnValue(row, mapping.title || mapping.name || "title")
          const description = getColumnValue(row, mapping.description || "description")
          const category = getColumnValue(row, mapping.category || "category")
          const brand = getColumnValue(row, mapping.brand || "brand")

          // Normalizar valores
          const normalizedSku = sku ? normalizeValue(String(sku)) : null
          const normalizedEan = ean ? normalizeValue(String(ean)) : null

          if (!normalizedSku && !normalizedEan) {
            failedCount++
            continue
          }

          // Buscar producto existente
          let existingProduct = null
          if (normalizedSku) {
            const { data } = await supabase
              .from("products")
              .select("id, sku, ean")
              .eq("sku", normalizedSku)
              .single()
            existingProduct = data
          }
          if (!existingProduct && normalizedEan) {
            const { data } = await supabase
              .from("products")
              .select("id, sku, ean")
              .eq("ean", normalizedEan)
              .single()
            existingProduct = data
          }

          const productData: any = {
            price: price ? parseFloat(String(price).replace(",", ".")) : null,
            stock: stock ? parseInt(String(stock)) : 0,
            updated_at: new Date().toISOString(),
          }

          if (normalizedEan) {
            productData.ean = normalizedEan
          }

          if (existingProduct) {
            // Actualizar producto existente
            if (mode === "update" || mode === "full") {
              if (title) productData.title = title
              if (description) productData.description = description
              if (category) productData.category = category
              if (brand) productData.brand = brand
            }

            const { error } = await supabase
              .from("products")
              .update(productData)
              .eq("id", existingProduct.id)

            if (error) {
              failedCount++
            } else {
              updatedCount++
            }
          } else if (mode !== "stock_only") {
            // Crear nuevo producto
            productData.sku = normalizedSku || normalizedEan
            productData.ean = normalizedEan
            productData.title = title || `Producto ${normalizedSku || normalizedEan}`
            productData.description = description
            productData.category = category
            productData.brand = brand
            productData.source = [source.name]

            const { error } = await supabase.from("products").insert(productData)

            if (error) {
              failedCount++
            } else {
              importedCount++
            }
          }
        } catch (error) {
          failedCount++
        }
      }

      // Actualizar progreso cada batch
      await supabase
        .from("import_history")
        .update({
          products_imported: importedCount,
          products_updated: updatedCount,
          products_failed: failedCount,
        })
        .eq("id", importId)
    }

    // Marcar como completado
    await supabase
      .from("import_history")
      .update({
        status: "completed",
        products_imported: importedCount,
        products_updated: updatedCount,
        products_failed: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importId)

    // Actualizar última importación de la fuente
    await supabase
      .from("import_sources")
      .update({ last_import: new Date().toISOString() })
      .eq("id", sourceId)

    console.log(`[v0] Importación completada: ${importedCount} importados, ${updatedCount} actualizados, ${failedCount} fallidos`)
    
    return {
      total: totalRows,
      imported: importedCount,
      updated: updatedCount,
      failed: failedCount,
    }
  } catch (error) {
    console.error("[v0] Error en importación background:", error)
    // Marcar como fallido
    const supabase = await createClient()
    await supabase.from("import_history").update({ 
      status: "failed",
      completed_at: new Date().toISOString(),
    }).eq("id", importId)
    
    return { total: 0, imported: 0, updated: 0, failed: 0, error: String(error) }
  }
}

// GET para verificar el estado de una importación
export async function GET(request: NextRequest) {
  const importId = request.nextUrl.searchParams.get("importId")

  if (!importId) {
    return NextResponse.json({ error: "importId es requerido" }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("import_history")
    .select("*")
    .eq("id", importId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Importación no encontrada" }, { status: 404 })
  }

  return NextResponse.json(data)
}
