import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const page          = parseInt(searchParams.get("page")  ?? "0", 10)
    const limit         = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)
    const accountId     = searchParams.get("account_id")
    const status        = searchParams.get("status")
    const q             = searchParams.get("q")?.trim()
    const sinProducto   = searchParams.get("sin_producto") === "1"
    const soloElegibles = searchParams.get("solo_elegibles") === "1"
    const countsOnly    = searchParams.get("counts_only") === "1"

    const supabase = await createClient()

    // ── Counts query (lightweight — for header badges) ─────────────────────
    if (countsOnly) {
      let base = supabase.from("ml_publications").select("status, product_id", { count: "exact", head: false })
      if (accountId) base = base.eq("account_id", accountId)

      const { data: rows, error: cErr } = await base
      if (cErr) throw cErr

      const total   = rows?.length ?? 0
      const active  = rows?.filter(r => r.status === "active").length ?? 0
      const paused  = rows?.filter(r => r.status === "paused").length ?? 0
      const closed  = rows?.filter(r => r.status === "closed").length ?? 0
      const sin_producto = rows?.filter(r => !r.product_id).length ?? 0

      return NextResponse.json({ ok: true, counts: { total, active, paused, closed, sin_producto } })
    }

    // ── Main paginated query ────────────────────────────────────────────────
    let query = supabase
      .from("ml_publications")
      .select(
        "id, ml_item_id, title, status, price, current_stock, sku, ean, isbn, gtin, catalog_listing_eligible, product_id, permalink, updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false, nullsFirst: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (accountId)    query = query.eq("account_id", accountId)
    if (status)       query = query.eq("status", status)
    if (sinProducto)  query = query.is("product_id", null)
    if (soloElegibles) query = query.eq("catalog_listing_eligible", true)
    if (q) {
      query = query.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%`)
    }

    const { data, count, error } = await query

    if (error) throw error

    return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
