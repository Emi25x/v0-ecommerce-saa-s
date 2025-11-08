import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

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

    // Procesar productos
    let imported = 0
    let updated = 0
    let failed = 0

    const columnMapping = source.column_mapping || {}

    const skuColumn = columnMapping["sku"] // Nombre de la columna CSV para SKU
    const stockColumn = columnMapping["stock"] // Nombre de la columna CSV para stock
    const priceColumn = columnMapping["price"] // Nombre de la columna CSV para price

    if (!skuColumn) {
      console.error("[v0] Column mapping:", columnMapping)
      console.error("[v0] Headers:", headers)
      return NextResponse.json({ error: "Columna SKU no mapeada" }, { status: 400 })
    }

    const skuIndex = headers.indexOf(skuColumn)
    const stockIndex = stockColumn ? headers.indexOf(stockColumn) : -1
    const priceIndex = priceColumn ? headers.indexOf(priceColumn) : -1

    console.log("[v0] Columnas mapeadas - SKU:", skuColumn, "Stock:", stockColumn, "Price:", priceColumn)
    console.log("[v0] Índices - SKU:", skuIndex, "Stock:", stockIndex, "Price:", priceIndex)

    if (skuIndex === -1) {
      return NextResponse.json({ error: `Columna SKU "${skuColumn}" no encontrada en el CSV` }, { status: 400 })
    }

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(separator)
        const sku = values[skuIndex]?.trim()

        if (!sku) continue

        const updateData: any = {}
        if (stockIndex >= 0) {
          const stockValue = values[stockIndex]?.trim()
          updateData.stock = stockValue ? Number.parseInt(stockValue) : 0
        }
        if (priceIndex >= 0) {
          const priceValue = values[priceIndex]?.trim()
          updateData.price = priceValue ? Number.parseFloat(priceValue) : 0
        }

        // Verificar si existe
        const { data: existing } = await supabase.from("products").select("id").eq("sku", sku).single()

        if (existing) {
          // Actualizar
          const { error: updateError } = await supabase.from("products").update(updateData).eq("sku", sku)

          if (updateError) {
            console.error("[v0] Error actualizando producto:", sku, updateError)
            failed++
          } else {
            updated++
          }
        } else if (importMode !== "skip") {
          // Insertar nuevo
          const { error: insertError } = await supabase.from("products").insert({
            sku,
            ...updateData,
            title: sku,
            source: [source.name],
          })

          if (insertError) {
            console.error("[v0] Error insertando producto:", sku, insertError)
            failed++
          } else {
            imported++
          }
        }

        // Actualizar progreso cada 100 productos
        if (i % 100 === 0) {
          await supabase
            .from("import_history")
            .update({
              products_imported: imported,
              products_updated: updated,
              products_failed: failed,
            })
            .eq("id", history.id)

          console.log("[v0] Progreso:", i, "/", lines.length - 1, "- Importados:", imported, "Actualizados:", updated)
        }
      } catch (error) {
        console.error("[v0] Error procesando línea:", i, error)
        failed++
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
