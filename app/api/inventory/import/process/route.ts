import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

console.log("[v0] ========================================")
console.log("[v0] IMPORT PROCESS ENDPOINT MODULE LOADING")
console.log("[v0] ========================================")

export async function POST(request: NextRequest) {
  console.log("[v0] ========================================")
  console.log("[v0] POST /api/inventory/import/process - CALLED")
  console.log("[v0] ========================================")

  try {
    const body = await request.json()
    const { historyId, sourceId, importMode } = body

    console.log("[v0] Background import params:", { historyId, sourceId, importMode })

    const supabase = await createClient()

    // Actualizar estado a "running"
    await supabase.from("import_history").update({ status: "running" }).eq("id", historyId)

    // Obtener configuración de la fuente
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      throw new Error("Fuente no encontrada")
    }

    console.log("[v0] Source loaded:", source.name)

    // Descargar CSV
    const csvUrl = source.url_template
    if (!csvUrl) {
      throw new Error("URL del CSV no configurada")
    }

    console.log("[v0] Downloading CSV from:", csvUrl)
    const csvResponse = await fetch(csvUrl)
    if (!csvResponse.ok) {
      throw new Error(`Error descargando CSV: ${csvResponse.statusText}`)
    }

    const csvText = await csvResponse.text()
    console.log("[v0] CSV downloaded, size:", csvText.length, "bytes")

    // Detectar separador
    const firstLine = csvText.split("\n")[0]
    let separator = ","
    if (firstLine.includes("|")) separator = "|"
    else if (firstLine.includes(";")) separator = ";"

    console.log("[v0] Detected separator:", separator)

    // Parsear CSV
    const lines = csvText.split("\n").filter((line) => line.trim())
    const headers = lines[0].split(separator).map((h) => h.trim())
    const dataLines = lines.slice(1)

    console.log("[v0] CSV parsed - Headers:", headers.length, "Rows:", dataLines.length)

    const columnMapping = source.column_mapping || {}
    const skuColumnName = columnMapping["sku"]

    if (!skuColumnName) {
      throw new Error("Columna SKU no mapeada")
    }

    const skuIndex = headers.indexOf(skuColumnName)
    if (skuIndex === -1) {
      throw new Error(`Columna SKU "${skuColumnName}" no encontrada en el CSV`)
    }

    console.log("[v0] SKU column:", skuColumnName, "at index:", skuIndex)

    let imported = 0
    let updated = 0
    let failed = 0

    // Procesar productos en lotes de 100
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i]
      const values = line.split(separator).map((v) => v.trim())

      const sku = values[skuIndex]
      if (!sku) {
        failed++
        continue
      }

      // Construir objeto de producto
      const productData: any = {}

      for (const [dbField, csvColumn] of Object.entries(columnMapping)) {
        const columnIndex = headers.indexOf(csvColumn)
        if (columnIndex !== -1 && values[columnIndex]) {
          const value = values[columnIndex]

          // Validar campos numéricos
          if (["stock", "price", "cost"].includes(dbField)) {
            const numValue = Number.parseFloat(value.replace(",", "."))
            if (!isNaN(numValue)) {
              productData[dbField] = numValue
            }
          } else {
            productData[dbField] = value
          }
        }
      }

      // Verificar si el producto existe
      const { data: existingProduct } = await supabase.from("products").select("id").eq("sku", sku).single()

      if (existingProduct) {
        // Actualizar producto existente
        if (importMode === "skip") {
          // Saltar producto existente
          continue
        }

        const { error: updateError } = await supabase.from("products").update(productData).eq("id", existingProduct.id)

        if (updateError) {
          console.error("[v0] Error updating product:", sku, updateError)
          failed++
        } else {
          updated++
        }
      } else {
        // Insertar nuevo producto
        productData.sku = sku
        productData.source = [source.name]

        const { error: insertError } = await supabase.from("products").insert(productData)

        if (insertError) {
          console.error("[v0] Error inserting product:", sku, insertError)
          failed++
        } else {
          imported++
        }
      }

      // Actualizar progreso cada 100 productos
      if ((i + 1) % 100 === 0) {
        await supabase
          .from("import_history")
          .update({
            products_imported: imported,
            products_updated: updated,
            products_failed: failed,
          })
          .eq("id", historyId)

        console.log("[v0] Progress:", i + 1, "/", dataLines.length)
      }
    }

    // Actualizar estado final
    await supabase
      .from("import_history")
      .update({
        status: "success",
        products_imported: imported,
        products_updated: updated,
        products_failed: failed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", historyId)

    console.log("[v0] Import completed:", { imported, updated, failed })

    return NextResponse.json({ success: true, imported, updated, failed })
  } catch (error: any) {
    console.error("[v0] Error in background import:", error)

    // Actualizar estado a error
    const { historyId } = await request.json()
    if (historyId) {
      const supabase = await createClient()
      await supabase
        .from("import_history")
        .update({
          status: "error",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", historyId)
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
