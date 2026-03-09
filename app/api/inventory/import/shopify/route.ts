import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const shopifyResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL}/admin/api/2024-01/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN || "",
        },
      },
    )

    if (!shopifyResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch Shopify products" }, { status: 500 })
    }

    const shopifyData = await shopifyResponse.json()
    const shopifyProducts = shopifyData.products || []

    let imported = 0

    for (const shopifyProduct of shopifyProducts) {
      const variant = shopifyProduct.variants?.[0]
      const image = shopifyProduct.images?.[0]

      // Verificar si el producto ya existe por SKU
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("sku", variant?.sku || shopifyProduct.id.toString())
        .single()

      if (existing) {
        // Actualizar producto existente
        await supabase
          .from("products")
          .update({
            title: shopifyProduct.title,
            description: shopifyProduct.body_html,
            price: Number.parseFloat(variant?.price || "0"),
            stock: variant?.inventory_quantity || 0,
            image_url: image?.src,
            brand: shopifyProduct.vendor,
          })
          .eq("id", existing.id)
      } else {
        // Crear nuevo producto
        await supabase.from("products").insert({
          sku: variant?.sku || shopifyProduct.id.toString(),
          title: shopifyProduct.title,
          description: shopifyProduct.body_html,
          price: Number.parseFloat(variant?.price || "0"),
          stock: variant?.inventory_quantity || 0,
          image_url: image?.src,
          brand: shopifyProduct.vendor,
        })
        imported++
      }
    }

    return NextResponse.json({ imported, total: shopifyProducts.length })
  } catch (error) {
    console.error("Error importing from Shopify:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
