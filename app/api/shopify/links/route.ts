import { createClient } from "@/lib/db/server"
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

    const { data, error } = await supabase.rpc("get_shopify_links", {
      p_store_id: store_id,
      p_status:   status,
      p_search:   q,
      p_offset:   page * limit,
      p_limit:    limit,
    })

    if (error) throw error

    return NextResponse.json(data)
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
