import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_API_BASE = "https://api.mercadolibre.com"

export async function POST(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated with Mercado Libre" }, { status: 401 })
    }

    const accessToken = await getValidAccessToken(userId)

    const { product_id } = await request.json()

    if (!product_id) {
      return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    }

    console.log("[v0] Creating new catalog listing for product:", product_id)

    const productResponse = await fetch(`${ML_API_BASE}/items/${product_id}?include_attributes=all`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!productResponse.ok) {
      const errorText = await productResponse.text()
      console.error("[v0] Failed to fetch product:", errorText)
      throw new Error("Failed to fetch product details")
    }

    const product = await productResponse.json()

    console.log("[v0] Product tags:", product.tags)
    console.log("[v0] Product catalog_listing:", product.catalog_listing)
    console.log("[v0] Product catalog_product_id:", product.catalog_product_id)

    if (product.catalog_listing) {
      return NextResponse.json({
        success: true,
        message: "Este producto ya es una publicación de catálogo",
        product_id,
      })
    }

    let catalogProductId = product.catalog_product_id

    if (!catalogProductId) {
      console.log("[v0] No catalog_product_id found, searching by SKU...")

      let sku = product.seller_custom_field
      if (!sku && product.attributes) {
        const skuAttr = product.attributes.find(
          (attr: any) => attr.id === "SELLER_SKU" || attr.name === "SKU" || attr.id === "SKU",
        )
        if (skuAttr) {
          sku = skuAttr.value_name || skuAttr.value
        }
      }

      console.log("[v0] Product SKU:", sku)

      try {
        if (sku) {
          const skuSearchUrl = `${ML_API_BASE}/marketplace/products/search?q=${encodeURIComponent(sku)}&status=active&limit=10`
          console.log("[v0] Searching by SKU:", skuSearchUrl)

          const skuSearchResponse = await fetch(skuSearchUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          if (skuSearchResponse.ok) {
            const skuSearchData = await skuSearchResponse.json()
            console.log("[v0] SKU search results:", skuSearchData.results?.length || 0)

            if (skuSearchData.results && skuSearchData.results.length > 0) {
              catalogProductId = skuSearchData.results[0].id
              console.log("[v0] Found catalog_product_id by SKU:", catalogProductId)
            }
          }
        }

        if (!catalogProductId) {
          console.log("[v0] SKU search didn't find results, trying by title...")
          const searchQuery = encodeURIComponent(product.title.substring(0, 50))
          const titleSearchUrl = `${ML_API_BASE}/marketplace/products/search?q=${searchQuery}&status=active&limit=10`

          const titleSearchResponse = await fetch(titleSearchUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          if (titleSearchResponse.ok) {
            const titleSearchData = await titleSearchResponse.json()
            console.log("[v0] Title search results:", titleSearchData.results?.length || 0)

            if (titleSearchData.results && titleSearchData.results.length > 0) {
              catalogProductId = titleSearchData.results[0].id
              console.log("[v0] Found catalog_product_id by title:", catalogProductId)
            }
          }
        }
      } catch (searchError) {
        console.error("[v0] Error searching products:", searchError)
      }
    }

    if (!catalogProductId) {
      return NextResponse.json(
        {
          error: "No se encontró un catalog_product_id para este producto",
          suggestion:
            "No se pudo encontrar un producto de catálogo correspondiente. Verifica que el SKU del producto coincida con un producto del catálogo de Mercado Libre.",
          product_sku: product.seller_custom_field,
        },
        { status: 404 },
      )
    }

    console.log("[v0] Creating new catalog listing with catalog_product_id:", catalogProductId)

    const catalogListingData: any = {
      catalog_product_id: catalogProductId,
      catalog_listing: true,
      category_id: product.category_id,
      price: product.price,
      currency_id: product.currency_id,
      available_quantity: product.available_quantity,
      listing_type_id: product.listing_type_id,
      condition: product.condition,
    }

    if (product.video_id) {
      catalogListingData.video_id = product.video_id
    }
    if (product.warranty) {
      catalogListingData.warranty = product.warranty
    }
    if (product.shipping) {
      catalogListingData.shipping = product.shipping
    }
    if (product.sale_terms) {
      catalogListingData.sale_terms = product.sale_terms
    }

    console.log("[v0] Creating catalog listing with data:", JSON.stringify(catalogListingData, null, 2))

    const createResponse = await fetch(`${ML_API_BASE}/items`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(catalogListingData),
    })

    const createData = await createResponse.json()
    console.log("[v0] Create response status:", createResponse.status)
    console.log("[v0] Create response data:", JSON.stringify(createData, null, 2))

    if (!createResponse.ok) {
      console.error("[v0] Failed to create catalog listing:", createData)
      return NextResponse.json(
        {
          error: "No se pudo crear la publicación de catálogo",
          details: createData.message || JSON.stringify(createData),
          ml_error: createData,
          catalog_product_id: catalogProductId,
          suggestion:
            "Mercado Libre rechazó la creación. Verifica que el catalog_product_id sea correcto y que todos los datos del producto sean válidos.",
        },
        { status: 400 },
      )
    }

    console.log("[v0] Successfully created new catalog listing! New ID:", createData.id)

    try {
      const supabase = await createClient()

      const { error: relationshipError } = await supabase.from("listing_relationships").insert({
        original_listing_id: product_id,
        catalog_listing_id: createData.id,
      })

      if (relationshipError) {
        console.error("[v0] Failed to save relationship:", relationshipError)
      } else {
        console.log("[v0] Relationship saved successfully")

        await supabase
          .from("ml_publications")
          .update({ catalog_linked_item_id: createData.id })
          .eq("ml_item_id", product_id)
      }
    } catch (dbError) {
      console.error("[v0] Database error:", dbError)
    }

    return NextResponse.json({
      success: true,
      message: "Nueva publicación de catálogo creada exitosamente y vinculada",
      original_product_id: product_id,
      new_catalog_listing_id: createData.id,
      catalog_product_id: catalogProductId,
      permalink: createData.permalink,
      new_listing: {
        id: createData.id,
        title: createData.title,
        price: createData.price?.toString() || "0",
        available_quantity: createData.available_quantity || 0,
        status: createData.status,
        thumbnail: createData.thumbnail,
        catalog_listing: true,
        listing_type_id: createData.listing_type_id,
        permalink: createData.permalink,
      },
    })
  } catch (error) {
    console.error("[v0] Create catalog listing error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to create catalog listing", details: errorMessage }, { status: 500 })
  }
}
