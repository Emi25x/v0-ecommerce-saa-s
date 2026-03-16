import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getShopifyProducts } from "@/lib/shopify"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await request.json()
    const { name, access_token, default_location_id, is_active } = body

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    }

    if (access_token !== undefined) {
      updates.access_token = access_token
      
      // If updating access token, validate it
      const { data: store } = await supabase
        .from("shopify_stores")
        .select("shop_domain")
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .single()

      if (store) {
        try {
          await getShopifyProducts({ shop_domain: store.shop_domain, access_token })
        } catch (testError: any) {
          return NextResponse.json(
            {
              error: "Invalid access token",
              details: testError.message,
            },
            { status: 400 }
          )
        }
      }
    }

    if (name !== undefined) {
      updates.name = name
    }

    if (default_location_id !== undefined) {
      updates.default_location_id = default_location_id
    }

    if (is_active !== undefined) {
      updates.is_active = is_active
    }

    const { data: store, error: updateError } = await supabase
      .from("shopify_stores")
      .update(updates)
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select()
      .single()

    if (updateError) {
      console.error("[SHOPIFY-STORES] Error updating store:", updateError)
      return NextResponse.json({ error: "Failed to update store" }, { status: 500 })
    }

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, store })
  } catch (error: any) {
    console.error("[SHOPIFY-STORES] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { error: deleteError } = await supabase
      .from("shopify_stores")
      .delete()
      .eq("id", id)
      .eq("owner_user_id", user.id)

    if (deleteError) {
      console.error("[SHOPIFY-STORES] Error deleting store:", deleteError)
      return NextResponse.json({ error: "Failed to delete store" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[SHOPIFY-STORES] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
