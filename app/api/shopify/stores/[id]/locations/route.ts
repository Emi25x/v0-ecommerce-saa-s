import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getShopifyLocations } from "@/domains/shopify/types"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch store credentials
    const { data: store, error: storeError } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Fetch locations from Shopify
    const locations = await getShopifyLocations({
      shop_domain: store.shop_domain,
      access_token: store.access_token,
    })

    return NextResponse.json({ locations })
  } catch (error: any) {
    console.error("[SHOPIFY-LOCATIONS] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
