import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Get total listings count
    const { count: totalListings } = await supabase.from("ml_listings").select("*", { count: "exact", head: true })

    // Get catalog listings count
    const { count: catalogListings } = await supabase
      .from("ml_listings")
      .select("*", { count: "exact", head: true })
      .eq("catalog_listing", true)

    // Get active listings count
    const { count: activeListings } = await supabase
      .from("ml_listings")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")

    return NextResponse.json({
      total: totalListings || 0,
      catalog: catalogListings || 0,
      active: activeListings || 0,
      analyzed: 0, // Competition analysis is done on-demand, not stored
      winning: 0,
      losing: 0,
      sharing: 0,
      listed: 0,
      penalized: 0,
    })
  } catch (error) {
    console.error("[v0] Competition stats error:", error)
    return NextResponse.json(
      {
        total: 0,
        catalog: 0,
        active: 0,
        analyzed: 0,
        winning: 0,
        losing: 0,
        sharing: 0,
        listed: 0,
        penalized: 0,
      },
      { status: 500 },
    )
  }
}
