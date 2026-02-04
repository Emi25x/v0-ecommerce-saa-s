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

    // Count products that have been synced from any source using COUNT (no limit)
    console.log("[v0] Counting products with source...")
    const { count: totalSynced, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("source", "is", null)

    if (error) {
      console.error("[v0] Error counting synced products:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] Total synced products:", totalSynced)

    // Count by source using SQL for efficiency
    const bySources: Record<string, number> = {}
    const libralSynced = 0

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
