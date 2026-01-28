import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

// Declare the normalizeSku function
const normalizeSku = (val: string) => String(val).trim().replace(/^0+/, "") || val

export const maxDuration = 300 // 5 minutes max execution time

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { historyId, sourceId, importMode = "update" } = body

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

    // Función para normalizar valores (quitar ceros a la izquierda y espacios)
    const normalizeValue = (val: string) => String(val).trim().replace(/^0+/, "") || val

    // Determinar si debemos hacer match por EAN en lugar de SKU
    const matchField = mapping.match_field || "sku" // "sku" o "ean"
    const matchColumn = matchField === "ean" ? (mapping.ean || "ean") : (mapping.sku || "sku")

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE)
      
      // Obtener los valores para hacer match (EAN o SKU según configuración)
      const batchMatchValues = batch
        .map((p) => p[matchColumn])
        .filter(Boolean)
        .map(normalizeValue)

      // Buscar productos existentes por el campo de match
      const { data: existingProducts } = await supabase
        .from("products")
        .select("sku, ean")
        .in(matchField, batchMatchValues)

      // Crear set de valores existentes según el campo de match
      const existingMatchSet = new Set(
        existingProducts?.map((p) => matchField === "ean" ? p.ean : p.sku) || []
      )
      // También crear un mapa para obtener el SKU desde el EAN cuando hacemos match por EAN
      const eanToSkuMap = new Map(
        existingProducts?.map((p) => [p.ean, p.sku]) || []
      )

      const upsertPromises = batch.map(async (row) => {
        try {
          const skuColumn = mapping.sku || "sku"
          const eanColumn = mapping.ean || "ean"
          
          let sku = row[skuColumn]
          const ean = row[eanColumn]
          const price = row[mapping.price || "price"]
          const stock = row[mapping.stock || "stock"]

          // Debug: log primeras filas para ver qué columnas hay
          if (i === 0 && batch.indexOf(row) < 2) {
            console.log("[v0] Row keys:", Object.keys(row))
            console.log("[v0] SKU column:", skuColumn, "value:", sku)
            console.log("[v0] EAN column:", eanColumn, "value:", ean)
            console.log("[v0] Mapping:", JSON.stringify(mapping))
          }

          // Normalizar valores
          const normalizedSku = sku ? normalizeValue(sku) : null
          const normalizedEan = ean ? normalizeValue(ean) : null
          
          // El valor para hacer match
          const matchValue = matchField === "ean" ? normalizedEan : normalizedSku
          
          if (!matchValue) return null

          const exists = existingMatchSet.has(matchValue)
          
          // Si hacemos match por EAN, necesitamos el SKU existente para actualizar
          const existingSku = matchField === "ean" ? eanToSkuMap.get(matchValue) : normalizedSku

          // Si el modo es "skip" y el producto ya existe, saltarlo
          if (importMode === "skip" && exists) {
            return { success: true, skipped: true, sku: matchValue }
          }

          // Construir datos del producto
          let productData: any = {
            price: Number.parseFloat(price) || 0,
            stock: Number.parseInt(stock) || 0,
            source: [source.id],
          }
          
          // Agregar EAN si está disponible
          if (normalizedEan) {
            productData.ean = normalizedEan
          }
          
          // Agregar SKU si está disponible (para productos nuevos)
          if (normalizedSku) {
            productData.sku = normalizedSku
          }

          if (!exists && hasOnlyBasicData) {
            // Para fuentes de solo stock/precio, buscar en backup por EAN
            const backupProduct = backupProductsMap.get(normalizedEan) || backupProductsMap.get(normalizedSku)
            if (backupProduct) {
              productData = {
                ...productData,
                sku: backupProduct.sku || normalizedSku || normalizedEan,
                title: backupProduct.name || normalizedSku || normalizedEan,
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
            productData.sku = normalizedSku || normalizedEan
            productData.title = row[mapping.name || mapping.title || "name"] || normalizedSku || normalizedEan
            productData.description = row[mapping.description || "description"]
            productData.category = row[mapping.category || "category"]
            productData.brand = row[mapping.brand || "brand"]
          }

          // Si existe, actualizar por el campo de match
          if (exists) {
            const updateField = matchField === "ean" ? "ean" : "sku"
            const updateValue = matchField === "ean" ? normalizedEan : existingSku || normalizedSku
            
            const { error } = await supabase
              .from("products")
              .update(productData)
              .eq(updateField, updateValue)
            if (error) throw error
          } else {
            // Asegurar que tenga SKU para insertar
            if (!productData.sku) {
              productData.sku = normalizedEan || `AUTO-${Date.now()}`
            }
            const { error } = await supabase
              .from("products")
              .insert(productData)
            if (error) throw error
          }

          return { success: true, exists, sku: matchValue }
        } catch (error: any) {
          return { success: false, error: error.message, sku: row[mapping.sku || "sku"] }
        }
      })

      const results = await Promise.all(upsertPromises)

      results.forEach((result) => {
        if (result === null) return
        if (result.success) {
          if (result.skipped) {
            // Producto saltado porque ya existe (modo skip)
            return
          }
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
