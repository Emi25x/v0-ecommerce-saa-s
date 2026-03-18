import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getLibralToken, queryLibralProducts, delayBetweenBatches } from "@/domains/suppliers/libral/client"
import { mergeStockBySource } from "@/domains/inventory/stock-helpers"

// Sincroniza stock y precios solo cuando hay cambios
// Detecta productos nuevos automáticamente

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    console.log("[v0] ===== INICIO SINCRONIZACIÓN LIBRAL =====")
    const startTime = new Date()

    const supabase = await createClient()

    // Verificar si Libral está configurado
    const { data: libralSource } = await supabase
      .from("import_sources")
      .select("*")
      .eq("name", "Libral")
      .eq("enabled", true)
      .single()

    if (!libralSource) {
      console.log("[v0] Libral no está configurado o no está activo")
      return NextResponse.json({ message: "Libral no configurado", skipped: true })
    }

    // Usar source_key (string corto) como clave en stock_by_source para compatibilidad con filtros del almacén
    const libralSourceKey: string = libralSource.source_key ?? libralSource.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") ?? libralSource.id

    // Obtener token de Libral
    const token = await getLibralToken()

    // Obtener mapeo de campos
    const fieldMapping = libralSource.column_mapping || {}

    let productsUpdated = 0
    let productsNew = 0
    let productsUnchanged = 0
    let errors = 0

    const pageSize = 50 // Lotes pequeños para no sobrecargar el servidor
    let page = 0
    let hasMore = true
    let totalProcessed = 0

    while (hasMore) {
      console.log(`[v0] Procesando lote ${page + 1} (productos ${page * pageSize + 1}-${(page + 1) * pageSize})...`)

      const result = await queryLibralProducts(token, {
        take: pageSize,
        skip: page * pageSize,
        select: Object.values(fieldMapping),
        requireTotalCount: true,
      })

      if (result.data.length === 0) {
        hasMore = false
        break
      }

      totalProcessed += result.data.length
      console.log(
        `[v0] Progreso: ${totalProcessed}/${result.totalCount} productos (${Math.round((totalProcessed / result.totalCount) * 100)}%)`,
      )

      // Procesar cada producto
      for (const apiProduct of result.data as Record<string, any>[]) {
        try {
          const sku = apiProduct[fieldMapping.sku]
          const newStock = apiProduct[fieldMapping.stock] || 0
          const newPrice = apiProduct[fieldMapping.price] || 0

          if (!sku) continue

          // Verificar si el producto existe (incluir stock_by_source para merge)
          const { data: existingProduct } = await supabase
            .from("products")
            .select("id, stock, price, stock_by_source")
            .eq("sku", sku)
            .single()

          if (existingProduct) {
            // Producto existe - verificar si hay cambios
            const { stock_by_source, stock: totalStock } = mergeStockBySource(
              existingProduct.stock_by_source, libralSourceKey, newStock
            )
            const stockChanged = existingProduct.stock !== totalStock
            const priceChanged = Math.abs(existingProduct.price - newPrice) > 0.01

            if (stockChanged || priceChanged) {
              // Actualizar solo si hay cambios
              const { error: updateError } = await supabase
                .from("products")
                .update({
                  stock: totalStock,
                  stock_by_source,
                  price: newPrice,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existingProduct.id)

              if (updateError) {
                console.error(`[v0] Error actualizando SKU ${sku}:`, updateError)
                errors++
              } else {
                productsUpdated++
              }
            } else {
              productsUnchanged++
            }
          } else {
            // Producto nuevo - importar
            const { stock_by_source: newSbs, stock: totalStock } = mergeStockBySource(null, libralSourceKey, newStock)
            const productData: any = {
              sku,
              title: apiProduct[fieldMapping.title],
              description: apiProduct[fieldMapping.description] || null,
              price: newPrice,
              stock: totalStock,
              stock_by_source: newSbs,
              brand: apiProduct[fieldMapping.brand] || null,
              category: apiProduct[fieldMapping.category] || null,
              image_url: apiProduct[fieldMapping.image_url] || null,
              condition: apiProduct[fieldMapping.condition] ? "new" : "used",
              source: [libralSourceKey],
              internal_code: `INT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
              custom_fields: {
                libral_id: apiProduct.id,
                libral_imported_at: new Date().toISOString(),
                auto_detected: true,
              },
            }

            const { error: insertError } = await supabase.from("products").insert(productData)

            if (insertError) {
              console.error(`[v0] Error insertando producto nuevo ${sku}:`, insertError)
              errors++
            } else {
              productsNew++
              console.log(`[v0] ✓ Producto nuevo detectado e importado: ${sku}`)
            }
          }
        } catch (error: any) {
          console.error(`[v0] Error procesando producto:`, error)
          errors++
        }
      }

      page++

      // Si la página devolvió menos productos que el tamaño de página, no hay más
      if (result.data.length < pageSize) {
        hasMore = false
      } else {
        console.log("[v0] Pausando 1 segundo antes del siguiente lote...")
        await delayBetweenBatches(1000)
      }
    }

    // Actualizar última sincronización
    await supabase.from("import_sources").update({ last_import_at: new Date().toISOString() }).eq("id", libralSource.id)

    const endTime = new Date()
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000)

    console.log("[v0] ===== RESUMEN SINCRONIZACIÓN =====")
    console.log(`[v0] Productos procesados: ${totalProcessed}`)
    console.log(`[v0] Productos actualizados: ${productsUpdated}`)
    console.log(`[v0] Productos nuevos: ${productsNew}`)
    console.log(`[v0] Productos sin cambios: ${productsUnchanged}`)
    console.log(`[v0] Errores: ${errors}`)
    console.log(`[v0] Duración: ${duration}s`)
    console.log("[v0] ===== FIN SINCRONIZACIÓN =====")

    return NextResponse.json({
      success: true,
      summary: {
        processed: totalProcessed,
        updated: productsUpdated,
        new: productsNew,
        unchanged: productsUnchanged,
        errors,
        duration,
      },
    })
  } catch (error: any) {
    console.error("[v0] Error en sincronización Libral:", error)
    return NextResponse.json(
      {
        error: error.message || "Error desconocido",
        details: error.toString(),
      },
      { status: 500 },
    )
  }
}
