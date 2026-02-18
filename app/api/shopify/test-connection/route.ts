import { NextResponse } from "next/server"
import { getShopifyProducts } from "@/lib/shopify"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get("store_id")

    let credentials = undefined

    // If store_id is provided, fetch credentials from database
    if (storeId) {
      const supabase = await createClient()

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { data: store, error: storeError } = await supabase
        .from("shopify_stores")
        .select("shop_domain, access_token")
        .eq("id", storeId)
        .eq("owner_user_id", user.id)
        .single()

      if (storeError || !store) {
        return NextResponse.json(
          {
            connected: false,
            error: "Store not found",
          },
          { status: 404 }
        )
      }

      credentials = {
        shop_domain: store.shop_domain,
        access_token: store.access_token,
      }
    }

    // Try to fetch products to test the connection
    await getShopifyProducts(credentials)

    return NextResponse.json({
      connected: true,
      message: "Successfully connected to Shopify",
    })
  } catch (error) {
    console.error("[SHOPIFY-TEST] Connection test failed:", error)
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Failed to connect to Shopify",
      },
      { status: 500 }
    )
  }
}
