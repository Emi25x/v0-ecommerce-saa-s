import { NextResponse } from "next/server"
import { getShopifyProducts, isShopifyConfigured } from "@/lib/shopify"

export async function GET() {
  try {
    if (!isShopifyConfigured()) {
      return NextResponse.json({
        products: [],
        configured: false,
        message:
          "Shopify no está configurado. Agrega las variables de entorno SHOPIFY_STORE_DOMAIN y SHOPIFY_ACCESS_TOKEN.",
      })
    }

    const products = await getShopifyProducts()

    return NextResponse.json({ products, configured: true })
  } catch (error) {
    console.error("[v0] Failed to fetch Shopify products:", error)
    return NextResponse.json(
      {
        products: [],
        configured: false,
        error: error instanceof Error ? error.message : "Failed to fetch products",
      },
      { status: 500 },
    )
  }
}
