import { NextResponse } from "next/server"
import { getShopifyProducts } from "@/lib/shopify"

export async function POST() {
  try {
    const syncResults = {
      shopify: { success: false, count: 0, error: null as string | null },
      mercadolibre: { success: false, count: 0, error: null as string | null },
      timestamp: new Date().toISOString(),
    }

    // Try to sync from Shopify
    try {
      const shopifyProducts = await getShopifyProducts()
      syncResults.shopify.success = true
      syncResults.shopify.count = shopifyProducts.length
      console.log(`[v0] Synced ${shopifyProducts.length} products from Shopify`)
    } catch (error) {
      syncResults.shopify.error = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] Shopify sync failed:", error)
    }

    // Try to sync from Mercado Libre (would need access token and user ID from database)
    // For now, we'll skip this as it requires OAuth tokens
    syncResults.mercadolibre.error = "OAuth tokens required - connect Mercado Libre first"

    return NextResponse.json({
      success: syncResults.shopify.success || syncResults.mercadolibre.success,
      results: syncResults,
    })
  } catch (error) {
    console.error("[v0] Sync failed:", error)
    return NextResponse.json(
      { error: "Sync failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
