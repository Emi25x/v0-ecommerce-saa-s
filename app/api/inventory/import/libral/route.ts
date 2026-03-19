import { type NextRequest, NextResponse } from "next/server"
import { getLibralProducts } from "@/domains/suppliers/libral/client"
import { createClient } from "@/lib/db/server"
import { mergeStockBySource } from "@/domains/inventory/stock-helpers"

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("libral_access_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated with Libral" }, { status: 401 })
    }

    const { pageSize = 100 } = await request.json()

    console.log("[v0] Libral Import - Starting import with pageSize:", pageSize)

    const supabase = await createClient()

    // Fetch the Libral source to get its source_key for stock_by_source keying
    const { data: libralSource } = await supabase
      .from("import_sources")
      .select("id, source_key")
      .ilike("name", "%libral%")
      .limit(1)
      .single()
    // Usar source_key (clave corta sin guiones) en lugar de UUID para compatibilidad con filtros JSONB
    const libralSourceId: string = (libralSource as any)?.source_key ?? libralSource?.id ?? "libral"

    let totalImported = 0
    let page = 0
    let hasMore = true

    while (hasMore) {
      console.log("[v0] Libral Import - Fetching page:", page)

      const result = await getLibralProducts(page, pageSize)

      if (result.data.length === 0) {
        hasMore = false
        break
      }

      // Import products to database
      for (const libralProduct of result.data) {
        // Check if product already exists by EAN (SKU)
        const { data: existingProduct } = await supabase
          .from("products")
          .select("id, source, stock_by_source")
          .eq("sku", libralProduct.ean)
          .single()

        const { stock_by_source, stock } = mergeStockBySource(
          existingProduct?.stock_by_source,
          libralSourceId,
          libralProduct.stockdisponibletotal,
        )

        const productData = {
          sku: libralProduct.ean,
          title: libralProduct.titulo,
          description: libralProduct.sinopsis || libralProduct.resumen || null,
          price: libralProduct.precioventa,
          stock,
          stock_by_source,
          source: existingProduct ? [...(existingProduct.source || []), "libral"] : ["libral"],
          custom_fields: {
            libral_id: libralProduct.id,
            subtitulo: libralProduct.subtitulo,
            proveedor: libralProduct.nombreproveedor,
            editorial: libralProduct.nombreeditorial,
            tipo_articulo: libralProduct.nombretipoarticulo,
            imagen_url: libralProduct.urlfotografia,
            peso: libralProduct.peso,
            dimensiones: {
              ancho: libralProduct.ancho,
              alto: libralProduct.alto,
              grosor: libralProduct.grosor,
            },
          },
        }

        if (existingProduct) {
          // Update existing product
          const { error: updateError } = await supabase
            .from("products")
            .update(productData)
            .eq("id", existingProduct.id)

          if (updateError) {
            console.error("[v0] Libral Import - Failed to update product:", libralProduct.ean, updateError)
          } else {
            totalImported++
          }
        } else {
          // Insert new product
          const { error: insertError } = await supabase.from("products").insert(productData)

          if (insertError) {
            console.error("[v0] Libral Import - Failed to insert product:", libralProduct.ean, insertError)
          } else {
            totalImported++
          }
        }
      }

      console.log("[v0] Libral Import - Page", page, "completed. Total imported:", totalImported)

      // Check if there are more pages
      if (result.data.length < pageSize || totalImported >= result.totalCount) {
        hasMore = false
      } else {
        page++
      }
    }

    console.log("[v0] Libral Import - Completed. Total products imported:", totalImported)

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${totalImported} products from Libral`,
      totalImported,
    })
  } catch (error) {
    console.error("[v0] Libral import error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to import products from Libral", details: errorMessage }, { status: 500 })
  }
}
