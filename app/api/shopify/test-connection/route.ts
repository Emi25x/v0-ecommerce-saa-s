import { NextResponse } from "next/server"
import { getShopifyProducts } from "@/lib/shopify"

export async function GET() {
  try {
    // Try to fetch products to test the connection
    await getShopifyProducts()

    return NextResponse.json({
      connected: true,
      message: "Successfully connected to Shopify",
    })
  } catch (error) {
    console.error("[v0] Shopify connection test failed:", error)
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Failed to connect to Shopify",
      },
      { status: 500 },
    )
  }
}
