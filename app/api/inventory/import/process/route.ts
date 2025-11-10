import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

export const maxDuration = 300 // 5 minutes max execution time

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { historyId, sourceId } = body

    const supabase = await createClient()

    await supabase
      .from("import_history")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", historyId)

    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      throw new Error("Source not found")
    }

    const csvResponse = await fetch(source.url_template)
    if (!csvResponse.ok) {
      throw new Error(`Failed to download CSV: ${csvResponse.statusText}`)
    }
    const csvText = await csvResponse.text()

    const delimiters = ["|", ";", ",", "\t"]
    let maxColumns = 0
    let bestDelimiter = ","
    for (const delimiter of delimiters) {
      const parsed = Papa.parse(csvText, { delimiter, preview: 1 })
      const columnCount = parsed.data[0]?.length || 0
      if (columnCount > maxColumns) {
        maxColumns = columnCount
        bestDelimiter = delimiter
      }
    }

    const parsed = Papa.parse(csvText, {
      delimiter: bestDelimiter,
      header: true,
      skipEmptyLines: true,
    })

    const products = parsed.data as any[]
    const mapping = source.column_mapping || {}

    const sampleProduct = products[0] || {}
    const hasName = sampleProduct[mapping.name || "name"]
    const hasDescription = sampleProduct[mapping.description || "description"]
    const hasCategory = sampleProduct[mapping.category || "category"]
    const hasOnlyBasicData = !hasName && !hasDescription && !hasCategory

    const backupProductsMap = new Map()

    if (hasOnlyBasicData) {
      const { data: allSources } = await supabase
        .from("import_sources")
        .select("*")
        .eq("is_active", true)
        .neq("id", sourceId)

      if (allSources) {
        const backupSources = allSources
          .filter((s) => s.name.toLowerCase().includes("arnoia") && !s.name.toLowerCase().includes("stock"))
          .sort((a, b) => {
            const aHasAct = a.name.toLowerCase().includes("act")
            const bHasAct = b.name.toLowerCase().includes("act")
            if (aHasAct === bHasAct) return 0
            return aHasAct ? 1 : -1
          })

        for (const backupSource of backupSources) {
          try {
            const backupResponse = await fetch(backupSource.url_template)
            if (backupResponse.ok) {
              const backupCsvText = await backupResponse.text()
              const backupParsed = Papa.parse(backupCsvText, {
                delimiter: bestDelimiter,
                header: true,
                skipEmptyLines: true,
              })
              const backupMapping = backupSource.column_mapping || {}

              backupParsed.data.forEach((row: any) => {
                const sku = row[backupMapping.sku || "sku"]
                if (sku) {
                  backupProductsMap.set(sku, {
                    name: row[backupMapping.name || "name"] || "",
                    description: row[backupMapping.description || "description"] || "",
                    category: row[backupMapping.category || "category"] || "",
                    brand: row[backupMapping.brand || "brand"] || "",
                  })
                }
              })
            }
          } catch (err) {
            console.error(`Failed to load backup source ${backupSource.name}:`, err)
          }
        }
      }
    }

    const BATCH_SIZE = 50
    let importedCount = 0
    let updatedCount = 0
    let failedCount = 0

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE)
      const batchSkus = batch.map((p) => p[mapping.sku || "sku"]).filter(Boolean)

      const { data: existingProducts } = await supabase.from("products").select("sku").in("sku", batchSkus)

      const existingSkusSet = new Set(existingProducts?.map((p) => p.sku) || [])

      const upsertPromises = batch.map(async (row) => {
        try {
          const sku = row[mapping.sku || "sku"]
          const price = row[mapping.price || "price"]
          const stock = row[mapping.stock || "stock"]

          if (!sku) return null

          const exists = existingSkusSet.has(sku)

          let productData: any = {
            sku,
            price: Number.parseFloat(price) || 0,
            stock: Number.parseInt(stock) || 0,
            source: [source.id],
          }

          if (!exists && hasOnlyBasicData) {
            const backupProduct = backupProductsMap.get(sku)
            if (backupProduct) {
              productData = {
                ...productData,
                title: backupProduct.name || sku,
                description: backupProduct.description,
                category: backupProduct.category,
                brand: backupProduct.brand,
              }
            } else {
              // Skip if not found in backup sources
              return null
            }
          } else if (!exists) {
            // New product with complete data
            productData.title = row[mapping.name || "name"] || sku
            productData.description = row[mapping.description || "description"]
            productData.category = row[mapping.category || "category"]
            productData.brand = row[mapping.brand || "brand"]
          }

          const { error } = await supabase.from("products").upsert(productData, {
            onConflict: "sku",
          })

          if (error) throw error

          return { success: true, exists, sku }
        } catch (error: any) {
          return { success: false, error: error.message, sku: row[mapping.sku || "sku"] }
        }
      })

      const results = await Promise.all(upsertPromises)

      results.forEach((result) => {
        if (result === null) return
        if (result.success) {
          if (result.exists) updatedCount++
          else importedCount++
        } else {
          failedCount++
        }
      })

      await supabase
        .from("import_history")
        .update({
          products_imported: importedCount,
          products_updated: updatedCount,
          products_failed: failedCount,
        })
        .eq("id", historyId)
    }

    await supabase
      .from("import_history")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        products_imported: importedCount,
        products_updated: updatedCount,
        products_failed: failedCount,
      })
      .eq("id", historyId)

    return NextResponse.json({
      success: true,
      imported: importedCount,
      updated: updatedCount,
      failed: failedCount,
    })
  } catch (error: any) {
    console.error("Import process error:", error)

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

    return NextResponse.json({ error: "Import failed", details: error.message }, { status: 500 })
  }
}
