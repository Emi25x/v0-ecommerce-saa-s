import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { mergeStockBySource } from "@/lib/stock-helpers"

export const maxDuration = 300 // 5 minutos para imports grandes

console.log("[v0] ==================== PROCESS IMPORT MODULE LOADED ====================")
console.log("[v0] Module loaded at:", new Date().toISOString())

export async function POST(request: NextRequest) {
  console.log("[v0] ==================== POST /api/inventory/process-import ====================")
  console.log("[v0] Timestamp:", new Date().toISOString())
  console.log("[v0] Request received!")

  try {
    const cookieStore = await cookies()
    console.log("[v0] Cookies obtained")

    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    })
    console.log("[v0] Supabase client created")

    const body = await request.json()
    console.log("[v0] Request body parsed:", body)

    const { sourceId, importMode = "update", preview = false } = body

    console.log("[v0] Parameters:", { sourceId, importMode, preview })

    // Obtener la fuente
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      console.error("[v0] Error obteniendo fuente:", sourceError)
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    console.log("[v0] Fuente encontrada:", source.name)

    // Obtener el CSV
    if (!source.url_template) {
      return NextResponse.json({ error: "URL del CSV no configurada" }, { status: 400 })
    }

    console.log("[v0] Descargando CSV desde:", source.url_template)
    const csvResponse = await fetch(source.url_template)
    if (!csvResponse.ok) {
      return NextResponse.json({ error: "Error descargando CSV" }, { status: 500 })
    }

    const csvText = await csvResponse.text()
    console.log("[v0] CSV descargado, tamaño:", csvText.length, "bytes")

    // Detectar separador
    const firstLine = csvText.split("\n")[0]
    let separator = ","
    if (firstLine.includes("|")) separator = "|"
    else if (firstLine.includes(";")) separator = ";"

    console.log("[v0] Separador detectado:", separator)

    // Parsear CSV
    const lines = csvText.split("\n").filter((line) => line.trim())
    const headers = lines[0].split(separator).map((h) => h.trim())
    console.log("[v0] Headers:", headers)
    console.log("[v0] Total de líneas:", lines.length - 1)

    if (preview) {
      return NextResponse.json({
        success: true,
        totalRecords: lines.length - 1,
        headers,
        separator,
      })
    }

    // Crear registro de historial
    const { data: history, error: historyError } = await supabase
      .from("import_history")
      .insert({
        source_id: sourceId,
        status: "running",
        started_at: new Date().toISOString(),
        products_imported: 0,
        products_updated: 0,
        products_failed: 0,
      })
      .select()
      .single()

    if (historyError || !history) {
      console.error("[v0] Error creando historial:", historyError)
      return NextResponse.json({ error: "Error creando historial" }, { status: 500 })
    }

    console.log("[v0] Historial creado:", history.id)

    let imported = 0
    const updated = 0
    let failed = 0

    const columnMapping = source.column_mapping || {}

    const skuColumn = columnMapping["sku"]
    const stockColumn = columnMapping["stock"]
    const priceColumn = columnMapping["price"]
    const titleColumn = columnMapping["title"]

    if (!skuColumn) {
      console.error("[v0] Column mapping:", columnMapping)
      console.error("[v0] Headers:", headers)
      return NextResponse.json({ error: "Columna SKU no mapeada" }, { status: 400 })
    }

    const skuIndex = headers.indexOf(skuColumn)
    const stockIndex = stockColumn ? headers.indexOf(stockColumn) : -1
    const priceIndex = priceColumn ? headers.indexOf(priceColumn) : -1
    const titleIndex = titleColumn ? headers.indexOf(titleColumn) : -1

    console.log(
      "[v0] Columnas mapeadas - SKU:",
      skuColumn,
      "Stock:",
      stockColumn,
      "Price:",
      priceColumn,
      "Title:",
      titleColumn,
    )
    console.log("[v0] Índices - SKU:", skuIndex, "Stock:", stockIndex, "Price:", priceIndex, "Title:", titleIndex)

    if (skuIndex === -1) {
      return NextResponse.json({ error: `Columna SKU "${skuColumn}" no encontrada en el CSV` }, { status: 400 })
    }

    const products: any[] = []
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(separator)
        const sku = values[skuIndex]?.trim()

        if (!sku) continue

        const product: any = {
          sku,
          source: [source.id],
        }

        if (titleIndex >= 0) {
          product.title = values[titleIndex]?.trim() || sku
        } else {
          product.title = sku
        }

        if (stockIndex >= 0) {
          const stockValue = values[stockIndex]?.trim()
          product.stock = stockValue ? Number.parseInt(stockValue) || 0 : 0
        }

        if (priceIndex >= 0) {
          const priceValue = values[priceIndex]?.trim()
          product.price = priceValue ? Number.parseFloat(priceValue) || 0 : 0
        }

        products.push(product)
      } catch (error) {
        console.error("[v0] Error parseando línea:", i, error)
        failed++
      }
    }

    console.log("[v0] Productos parseados:", products.length)

    const BATCH_SIZE = 1000
    const totalBatches = Math.ceil(products.length / BATCH_SIZE)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE
      const endIdx = Math.min(startIdx + BATCH_SIZE, products.length)
      const batch = products.slice(startIdx, endIdx)

      console.log(`[v0] Procesando lote ${batchIndex + 1}/${totalBatches} (${batch.length} productos)`)

      try {
        // Read existing stock_by_source for this batch to do proper merge
        const batchSkus = batch.map((p: any) => p.sku).filter(Boolean)
        const { data: existingRows } = await supabase
          .from("products")
          .select("sku, stock_by_source")
          .in("sku", batchSkus)
        const sbsMap = new Map((existingRows ?? []).map((p: any) => [p.sku, p.stock_by_source]))

        // Enrich each product with merged stock_by_source
        const enrichedBatch = batch.map((p: any) => {
          if (p.stock == null) return p
          const { stock_by_source, stock } = mergeStockBySource(sbsMap.get(p.sku), source.id, p.stock)
          return { ...p, stock, stock_by_source }
        })

        const { data, error } = await supabase.from("products").upsert(enrichedBatch, {
          onConflict: "sku",
          ignoreDuplicates: false,
        })

        if (error) {
          console.error(`[v0] Error en lote ${batchIndex + 1}:`, error)
          failed += batch.length
        } else {
          // Contar como importados (nuevos) o actualizados
          imported += batch.length
          console.log(`[v0] Lote ${batchIndex + 1} completado exitosamente`)
        }

        await supabase
          .from("import_history")
          .update({
            products_imported: imported,
            products_updated: updated,
            products_failed: failed,
          })
          .eq("id", history.id)
      } catch (error) {
        console.error(`[v0] Error procesando lote ${batchIndex + 1}:`, error)
        failed += batch.length
      }
    }

    // Finalizar historial
    await supabase
      .from("import_history")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        products_imported: imported,
        products_updated: updated,
        products_failed: failed,
      })
      .eq("id", history.id)

    console.log("[v0] Importación completada - Importados:", imported, "Actualizados:", updated, "Fallidos:", failed)

    return NextResponse.json({
      success: true,
      historyId: history.id,
      summary: {
        total: lines.length - 1,
        imported,
        updated,
        failed,
      },
    })
  } catch (error: any) {
    console.error("[v0] ===== ERROR CRÍTICO =====")
    console.error("[v0] Error:", error)
    console.error("[v0] Error message:", error.message)
    console.error("[v0] Error stack:", error.stack)
    return NextResponse.json({ error: error.message || "Error desconocido" }, { status: 500 })
  }
}
