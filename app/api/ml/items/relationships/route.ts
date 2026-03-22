import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: relationships, error } = await supabase
      .from("listing_relationships")
      .select("original_listing_id, catalog_listing_id")

    if (error) {
      console.error("[v0] Failed to fetch relationships:", error)
      return NextResponse.json({ error: "Failed to fetch relationships" }, { status: 500 })
    }

    const relationshipMap: Record<string, string> = {}

    relationships?.forEach((rel) => {
      relationshipMap[rel.original_listing_id] = rel.catalog_listing_id
      relationshipMap[rel.catalog_listing_id] = rel.original_listing_id
    })

    return NextResponse.json({ relationships: relationshipMap })
  } catch (error) {
    console.error("[v0] Relationships error:", error)
    return NextResponse.json({ error: "Failed to fetch relationships" }, { status: 500 })
  }
}
