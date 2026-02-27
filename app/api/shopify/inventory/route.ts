import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/shopify/inventory?store_id=&product_id=
// Devuelve locations de la tienda + stock por location para todas las variantes del producto
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const product_id = searchParams.get("product_id")

    if (!store_id || !product_id) {
      return NextResponse.json({ error: "store_id y product_id son requeridos" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: store } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    const headers = {
      "X-Shopify-Access-Token": store.access_token,
      "Content-Type": "application/json",
    }
    const base = `https://${store.shop_domain}/admin/api/2024-01`

    // 1. Traer locations de la tienda
    const locRes = await fetch(`${base}/locations.json`, { headers })
    const locJson = await locRes.json()
    const locations: Array<{ id: number; name: string; active: boolean }> = locJson.locations ?? []

    // 2. Traer variantes del producto con sus inventory_item_id
    const varRes = await fetch(`${base}/products/${product_id}/variants.json`, { headers })
    const varJson = await varRes.json()
    const variants: Array<{ id: number; title: string; sku: string; inventory_item_id: number; inventory_quantity: number; price: string }> =
      varJson.variants ?? []

    if (!variants.length) {
      return NextResponse.json({ ok: true, locations, variants: [], inventory_levels: [] })
    }

    // 3. Traer inventory levels para todos los inventory_item_ids de este producto
    const inventoryItemIds = variants.map(v => v.inventory_item_id).join(",")
    const invRes = await fetch(
      `${base}/inventory_levels.json?inventory_item_ids=${inventoryItemIds}&limit=250`,
      { headers }
    )
    const invJson = await invRes.json()
    const inventory_levels: Array<{ inventory_item_id: number; location_id: number; available: number }> =
      invJson.inventory_levels ?? []

    return NextResponse.json({ ok: true, locations, variants, inventory_levels })
  } catch (e: any) {
    console.error("[SHOPIFY-INVENTORY]", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
