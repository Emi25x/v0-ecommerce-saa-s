import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const page         = parseInt(searchParams.get("page")  ?? "0", 10)
    const limit        = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)
    const accountId    = searchParams.get("account_id")
    const status       = searchParams.get("status")
    const q            = searchParams.get("q")?.trim()
    const sinProducto  = searchParams.get("sin_producto") === "1"
    const soloElegibles = searchParams.get("solo_elegibles") === "1"

    const supabase = await createClient()

    let query = supabase
      .from("ml_publications")
      .select(
        "id, ml_item_id, title, status, price, current_stock, sku, ean, isbn, catalog_listing_eligible, product_id, permalink, updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (accountId)    query = query.eq("account_id", accountId)
    if (status)       query = query.eq("status", status)
    if (sinProducto)  query = query.is("product_id", null)
    if (soloElegibles) query = query.eq("catalog_listing_eligible", true)
    if (q) {
      // Buscar por título o item_id
      query = query.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%`)
    }

    const { data, count, error } = await query

    if (error) throw error

    return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
