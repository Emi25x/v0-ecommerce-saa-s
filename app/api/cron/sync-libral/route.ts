import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getLibralToken, queryLibralProducts, delayBetweenBatches } from "@/domains/suppliers/libral/client"
import { mergeStockBySource } from "@/domains/inventory/stock-helpers"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const log = createStructuredLogger({ request_id: genRequestId() })
    log.info("Starting Libral sync", "sync_libral.start")
    const startTime = new Date()

    const supabase = await createClient()

    const { data: libralSource } = await supabase
      .from("import_sources")
      .select("*")
      .eq("name", "Libral")
      .eq("enabled", true)
      .single()

    if (!libralSource) {
      return NextResponse.json({ message: "Libral no configurado", skipped: true })
    }

    const libralSourceKey: string =
      libralSource.source_key ?? libralSource.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") ?? libralSource.id

    const token = await getLibralToken()
    const fieldMapping = libralSource.column_mapping || {}

    let productsUpdated = 0
    let productsNew = 0
    let productsUnchanged = 0
    let errors = 0

    const pageSize = 50
    let page = 0
    let hasMore = true
    let totalProcessed = 0

    while (hasMore) {
      log.info(`Processing batch ${page + 1}`, "sync_libral.batch", { page: page + 1 })

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

      for (const apiProduct of result.data as unknown as Record<string, unknown>[]) {
        try {
          const sku = apiProduct[fieldMapping.sku as string] as string | undefined
          const newStock = (apiProduct[fieldMapping.stock as string] as number) || 0
          const newPrice = (apiProduct[fieldMapping.price as string] as number) || 0

          if (!sku) continue

          const { data: existingProduct } = await supabase
            .from("products")
            .select("id, stock, price, stock_by_source")
            .eq("sku", sku)
            .single()

          if (existingProduct) {
            const { stock_by_source, stock: totalStock } = mergeStockBySource(
              existingProduct.stock_by_source,
              libralSourceKey,
              newStock,
            )
            const stockChanged = existingProduct.stock !== totalStock
            const priceChanged = Math.abs(existingProduct.price - newPrice) > 0.01

            if (stockChanged || priceChanged) {
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
                log.error(`Error updating SKU ${sku}`, updateError, "sync_libral.update_error")
                errors++
              } else {
                productsUpdated++
              }
            } else {
              productsUnchanged++
            }
          } else {
            const { stock_by_source: newSbs, stock: totalStock } = mergeStockBySource(null, libralSourceKey, newStock)
            const productData: Record<string, unknown> = {
              sku,
              title: apiProduct[fieldMapping.title as string],
              description: (apiProduct[fieldMapping.description as string] as string) || null,
              price: newPrice,
              stock: totalStock,
              stock_by_source: newSbs,
              brand: (apiProduct[fieldMapping.brand as string] as string) || null,
              category: (apiProduct[fieldMapping.category as string] as string) || null,
              image_url: (apiProduct[fieldMapping.image_url as string] as string) || null,
              condition: apiProduct[fieldMapping.condition as string] ? "new" : "used",
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
              log.error(`Error inserting new product ${sku}`, insertError, "sync_libral.insert_error")
              errors++
            } else {
              productsNew++
            }
          }
        } catch (error: unknown) {
          log.error("Error processing product", error, "sync_libral.product_error")
          errors++
        }
      }

      page++

      if (result.data.length < pageSize) {
        hasMore = false
      } else {
        await delayBetweenBatches(1000)
      }
    }

    await supabase.from("import_sources").update({ last_import_at: new Date().toISOString() }).eq("id", libralSource.id)

    const duration = Math.round((Date.now() - startTime.getTime()) / 1000)

    log.info("Libral sync complete", "sync_libral.done", {
      totalProcessed,
      productsUpdated,
      productsNew,
      productsUnchanged,
      errors,
      duration,
    })

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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    const fatalLog = createStructuredLogger({ request_id: genRequestId() })
    fatalLog.error("Fatal error in sync-libral", error, "sync_libral.fatal")
    return NextResponse.json({ ok: false, error: { code: "internal_error", detail: msg } }, { status: 500 })
  }
}
