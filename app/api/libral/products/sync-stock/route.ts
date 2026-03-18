import { type NextRequest, NextResponse } from "next/server"
import { updateLibralStock } from "@/domains/suppliers/libral/client"
import { createClient } from "@/lib/db/server"

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("libral_access_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated with Libral" }, { status: 401 })
    }

    const { ean, quantity } = await request.json()

    if (!ean || quantity === undefined) {
      return NextResponse.json({ error: "ean and quantity are required" }, { status: 400 })
    }

    console.log("[v0] Libral Stock Sync - EAN:", ean, "Quantity:", quantity)

    // Update stock in Libral
    await updateLibralStock(token, ean, quantity)

    // Log the sync in database
    const supabase = await createClient()

    await supabase.from("stock_sync_log").insert({
      listing_id: ean,
      new_quantity: quantity,
      source: "libral_sync",
    })

    console.log("[v0] Libral Stock Sync - Success")

    return NextResponse.json({
      success: true,
      message: "Stock updated in Libral",
      ean,
      quantity,
    })
  } catch (error) {
    console.error("[v0] Libral stock sync error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Failed to sync stock with Libral", details: errorMessage }, { status: 500 })
  }
}
