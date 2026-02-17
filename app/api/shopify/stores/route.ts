import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getShopifyProducts } from "@/lib/shopify"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: stores, error } = await supabase
      .from("shopify_stores")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[SHOPIFY-STORES] Error fetching stores:", error)
      return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
    }

    return NextResponse.json({ stores: stores || [] })
  } catch (error: any) {
    console.error("[SHOPIFY-STORES] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { shop_domain, access_token, default_location_id } = body

    if (!shop_domain || !access_token) {
      return NextResponse.json({ error: "shop_domain and access_token are required" }, { status: 400 })
    }

    // Validate credentials by making a test API call
    console.log(`[SHOPIFY-STORES] Testing connection for ${shop_domain}`)
    try {
      await getShopifyProducts({ shop_domain, access_token })
    } catch (testError: any) {
      console.error("[SHOPIFY-STORES] Connection test failed:", testError)
      return NextResponse.json(
        {
          error: "Failed to connect to Shopify",
          details: testError.message,
        },
        { status: 400 }
      )
    }

    // Insert the new store
    const { data: store, error: insertError } = await supabase
      .from("shopify_stores")
      .insert({
        owner_user_id: user.id,
        shop_domain,
        access_token,
        default_location_id: default_location_id || null,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[SHOPIFY-STORES] Error inserting store:", insertError)
      
      // Handle unique constraint violation
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "This Shopify store is already connected" }, { status: 409 })
      }
      
      return NextResponse.json({ error: "Failed to add store" }, { status: 500 })
    }

    console.log(`[SHOPIFY-STORES] Successfully added store: ${store.id}`)
    return NextResponse.json({ success: true, store })
  } catch (error: any) {
    console.error("[SHOPIFY-STORES] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
