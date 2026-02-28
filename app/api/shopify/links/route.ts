import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/shopify/links?store_id=xxx&page=0&limit=50&q=titulo
// Lista los vínculos de una tienda con datos de ambos lados
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const page     = Number(searchParams.get("page") || "0")
    const limit    = Math.min(Number(searchParams.get("limit") || "50"), 200)
    const q        = searchParams.get("q") || ""
    const status   = searchParams.get("status") || ""  // linked | conflict | unlinked

    if (!store_id) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    let query = supabase
      .from("shopify_product_links")
      .select(`
        id, product_id, store_id,
        shopify_product_id, shopify_variant_id,
        shopify_title, shopify_sku, shopify_barcode,
        shopify_price, shopify_status, shopify_image_url,
        matched_by, matched_value, sync_status, last_synced_at,
        products ( id, title, ean, isbn, sku, image_url )
      `, { count: "exact" })
      .eq("store_id", store_id)

    if (status)  query = query.eq("sync_status", status)
    if (q)       query = query.or(`shopify_title.ilike.%${q}%,shopify_sku.ilike.%${q}%,shopify_barcode.ilike.%${q}%`)

    const { data, count, error } = await query
      .order("shopify_title", { ascending: true })
      .range(page * limit, page * limit + limit - 1)

    if (error) throw error

    return NextResponse.json({ ok: true, links: data ?? [], total: count ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/shopify/links  { link_id }
// Elimina un vínculo manualmente
export async function DELETE(request: Request) {
  try {
    const { link_id } = await request.json()
    if (!link_id) return NextResponse.json({ error: "link_id requerido" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { error } = await supabase
      .from("shopify_product_links")
      .delete()
      .eq("id", link_id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
