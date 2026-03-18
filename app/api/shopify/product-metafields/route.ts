import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { getValidToken } from "@/domains/shopify/auth"

// GET /api/shopify/product-metafields?store_id=xxx&product_id=yyy
// Retorna los metafields de un producto Shopify
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const product_id = searchParams.get("product_id")

    if (!store_id || !product_id)
      return NextResponse.json({ error: "store_id y product_id son requeridos" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain, access_token, api_key, api_secret, token_expires_at")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    const token = await getValidToken(supabase, store)

    const res = await fetch(
      `https://${store.shop_domain}/admin/api/2024-01/products/${product_id}/metafields.json?limit=250`,
      { headers: { "X-Shopify-Access-Token": token } }
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Shopify HTTP ${res.status}: ${text.slice(0, 200)}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ metafields: data.metafields ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
