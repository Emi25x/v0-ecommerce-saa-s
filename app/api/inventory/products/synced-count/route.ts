import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

console.log("[v0] ========================================")
console.log("[v0] SYNCED-COUNT ENDPOINT MODULE LOADED")
console.log("[v0] ========================================")

export async function GET() {
  console.log("[v0] ========================================")
  console.log("[v0] GET /api/inventory/products/synced-count - STARTING")
  console.log("[v0] ========================================")

  try {
    console.log("[v0] Creating Supabase client...")
    const supabase = await createClient()
    console.log("[v0] Supabase client created successfully")

    // Count products that have been synced from any source
    // A product is considered "synced" if it has a source assigned
    console.log("[v0] Querying products with source...")
    const { data: products, error } = await supabase
      .from("products")
      .select("source, custom_fields")
      .not("source", "is", null)

    if (error) {
      console.error("[v0] Error counting synced products:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] Products fetched:", products?.length || 0)

    // Count total synced products
    const totalSynced = products?.length || 0

    // Count by source
    const bySources: Record<string, number> = {}
    let libralSynced = 0

    if (products) {
      for (const product of products) {
        // Handle source as array or string
        const sources = Array.isArray(product.source) ? product.source : [product.source]

        for (const source of sources) {
          if (source) {
            bySources[source] = (bySources[source] || 0) + 1
          }
        }

        // Check if product has Libral sync data
        if (product.custom_fields && typeof product.custom_fields === "object") {
          const customFields = product.custom_fields as Record<string, any>
          if (customFields.libral_last_sync || customFields.libral_id) {
            libralSynced++
          }
        }
      }
    }

    console.log("[v0] Returning synced count:", { totalSynced, libralSynced })
    return NextResponse.json({
      totalSynced,
      libralSynced,
      bySources,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[v0] ========================================")
    console.error("[v0] ERROR in synced-count endpoint:", error)
    console.error("[v0] ========================================")
    return NextResponse.json(
      {
        error: error.message || "Error counting synced products",
        details: error.toString(),
      },
      { status: 500 },
    )
  }
}
