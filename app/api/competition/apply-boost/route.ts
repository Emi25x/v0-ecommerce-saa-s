import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { item_id, boost_type, new_price } = await request.json()

    if (!item_id || !boost_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get ML account token
    const { data: listing } = await supabase
      .from("ml_listings")
      .select("account_id, mercadolibre_accounts(access_token)")
      .eq("ml_id", item_id)
      .maybeSingle()

    const mlAccounts = listing?.mercadolibre_accounts as unknown as { access_token: any } | null
    let accessToken = mlAccounts?.access_token

    if (!accessToken) {
      const { data: accounts } = await supabase
        .from("mercadolibre_accounts")
        .select("access_token")
        .eq("is_active", true)
        .limit(1)
        .single()

      accessToken = accounts?.access_token
    }

    if (!accessToken) {
      return NextResponse.json({ error: "No active MercadoLibre account found" }, { status: 400 })
    }

    // Apply the boost based on type
    let updateData: any = {}

    switch (boost_type) {
      case "price":
        if (!new_price || new_price <= 0) {
          return NextResponse.json({ error: "Invalid price" }, { status: 400 })
        }
        updateData = { price: new_price }
        break

      case "free_shipping":
        updateData = {
          shipping: {
            mode: "me2",
            free_shipping: true,
          },
        }
        break

      default:
        return NextResponse.json({ error: "Unsupported boost type" }, { status: 400 })
    }

    // Update item via MercadoLibre API
    const mlResponse = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateData),
    })

    if (!mlResponse.ok) {
      const errorData = await mlResponse.json()
      console.error("[v0] ML API error:", errorData)
      return NextResponse.json({ error: errorData.message || "Failed to update item" }, { status: mlResponse.status })
    }

    const updatedItem = await mlResponse.json()

    // Update local database
    if (boost_type === "price") {
      await supabase.from("ml_listings").update({ price: new_price }).eq("ml_id", item_id)
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
    })
  } catch (error: any) {
    console.error("[v0] Error applying boost:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
