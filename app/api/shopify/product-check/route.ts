import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/shopify/product-check?store_id=xxx&product_id=yyy
// Verifica si un producto local ya está publicado en una tienda Shopify
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

    const { data: link } = await supabase
      .from("shopify_product_links")
      .select("shopify_product_id, shopify_title, shopify_status, last_synced_at")
      .eq("product_id", product_id)
      .eq("store_id", store_id)
      .maybeSingle()

    return NextResponse.json({
      exists: !!link,
      link: link ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
