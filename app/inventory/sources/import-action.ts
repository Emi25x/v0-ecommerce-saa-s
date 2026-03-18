"use server"

import { createClient } from "@/lib/db/server"

export async function executeImportAction(sourceId: string, importMode: string) {
  console.log("[v0] SERVER ACTION - Starting import", { sourceId, importMode })

  try {
    const supabase = await createClient()

    // Get source configuration
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      console.log("[v0] SERVER ACTION - Source not found", sourceError)
      throw new Error("Fuente no encontrada")
    }

    console.log("[v0] SERVER ACTION - Source found", source.name)

    // Download CSV
    console.log("[v0] SERVER ACTION - Downloading CSV from", source.feed_url)
    const response = await fetch(source.feed_url)
    const csvText = await response.text()
    console.log("[v0] SERVER ACTION - CSV downloaded, size:", csvText.length)

    // Detect separator
    const firstLine = csvText.split("\n")[0]
    let separator = ","
    if (firstLine.includes("|")) separator = "|"
    else if (firstLine.includes(";")) separator = ";"
    console.log("[v0] SERVER ACTION - Detected separator:", separator)

    // Parse CSV
    const lines = csvText.split("\n").filter((line) => line.trim())
    const headers = lines[0].split(separator).map((h) => h.trim().replace(/^"|"$/g, ""))
    console.log("[v0] SERVER ACTION - Headers:", headers)

    const columnMapping = source.column_mapping as Record<string, string>
    const skuColumnName = columnMapping["sku"]
    const stockColumnName = columnMapping["stock"]
    const priceColumnName = columnMapping["price"]

    console.log("[v0] SERVER ACTION - Column mapping:", { skuColumnName, stockColumnName, priceColumnName })

    const skuIndex = headers.indexOf(skuColumnName)
    const stockIndex = headers.indexOf(stockColumnName)
    const priceIndex = priceColumnName ? headers.indexOf(priceColumnName) : -1

    if (skuIndex === -1) {
      throw new Error(`Columna SKU no encontrada: ${skuColumnName}`)
    }
    if (stockIndex === -1) {
      throw new Error(`Columna Stock no encontrada: ${stockColumnName}`)
    }

    console.log("[v0] SERVER ACTION - Column indexes:", { skuIndex, stockIndex, priceIndex })

    const imported = 0
    let updated = 0
    let skipped = 0
    let failed = 0

    // Process products
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue

      const values = line.split(separator).map((v) => v.trim().replace(/^"|"$/g, ""))
      const sku = values[skuIndex]
      const stockStr = values[stockIndex]
      const priceStr = priceIndex >= 0 ? values[priceIndex] : null

      if (!sku) {
        failed++
        continue
      }

      const stock = Number.parseInt(stockStr) || 0
      const price = priceStr ? Number.parseFloat(priceStr.replace(",", ".")) : null

      // Check if product exists
      const { data: existing } = await supabase.from("products").select("id").eq("sku", sku).single()

      if (existing) {
        // Update existing product
        const updateData: any = { stock }
        if (price !== null) updateData.price = price

        const { error: updateError } = await supabase.from("products").update(updateData).eq("id", existing.id)

        if (updateError) {
          console.error("[v0] SERVER ACTION - Update error:", updateError)
          failed++
        } else {
          updated++
        }
      } else {
        skipped++
      }

      // Log progress every 100 products
      if (i % 100 === 0) {
        console.log(`[v0] SERVER ACTION - Progress: ${i}/${lines.length - 1}`, { imported, updated, skipped, failed })
      }
    }

    console.log("[v0] SERVER ACTION - Import completed", { imported, updated, skipped, failed })

    // Save import history
    await supabase.from("import_history").insert({
      source_id: sourceId,
      status: "completed",
      products_imported: imported,
      products_updated: updated,
      products_failed: failed,
    })

    return { success: true, imported, updated, skipped, failed }
  } catch (error: any) {
    console.error("[v0] SERVER ACTION - Error:", error)
    return { success: false, error: error.message }
  }
}
