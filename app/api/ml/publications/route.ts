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
    const sinStock      = searchParams.get("sin_stock") === "1"
    const countsOnly    = searchParams.get("counts_only") === "1"
    const alertsMode    = searchParams.get("alerts_mode") as
      "eligible_catalog" | "under_review" | "about_to_pause" | null

    const supabase = await createClient()

    // ── Counts query (lightweight — for header badges) ─────────────────────
    if (countsOnly) {
      let base = supabase.from("ml_publications").select("status, product_id, current_stock", { count: "exact", head: false })
      if (accountId) base = base.eq("account_id", accountId)

      const { data: rows, error: cErr } = await base
      if (cErr) throw cErr

      const total        = rows?.length ?? 0
      const active       = rows?.filter(r => r.status === "active").length ?? 0
      const paused       = rows?.filter(r => r.status === "paused").length ?? 0
      const closed       = rows?.filter(r => r.status === "closed").length ?? 0
      const sin_producto = rows?.filter(r => !r.product_id).length ?? 0
      const sin_stock    = rows?.filter(r => (r.current_stock ?? 0) <= 0).length ?? 0

      return NextResponse.json({ ok: true, counts: { total, active, paused, closed, sin_producto, sin_stock } })
    }

    // ── alerts_mode: about_to_pause has no column yet ─────────────────────
    if (alertsMode === "about_to_pause") {
      return NextResponse.json({ ok: true, rows: [], total: 0, placeholder: true })
    }

    const stockFirst = !!alertsMode

    // ── Helper: apply shared filters to any query builder ─────────────────
    function applyFilters(qb: any): any {
      if (accountId)     qb = qb.eq("account_id", accountId)
      if (status)        qb = qb.eq("status", status)
      if (sinProducto)   qb = qb.is("product_id", null)
      if (soloElegibles) qb = qb.eq("catalog_listing_eligible", true)
      if (sinStock)      qb = qb.lte("current_stock", 0)
      if (q)             qb = qb.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%`)
      if (alertsMode === "eligible_catalog") qb = qb.eq("catalog_listing_eligible", true).eq("status", "active")
      if (alertsMode === "under_review")     qb = qb.eq("status", "under_review")
      return qb
    }

    // ── 1. Exact count — separate HEAD query, no range cap ─────────────────
    let countQuery = supabase
      .from("ml_publications")
      .select("id", { count: "exact", head: true })

    countQuery = applyFilters(countQuery)
    const { count: exactCount, error: countErr } = await countQuery
    if (countErr) throw countErr

    // ── 2. Paginated data query — no count needed here ────────────────────
    let dataQuery = supabase
      .from("ml_publications")
      .select(
        "id, ml_item_id, account_id, title, status, price, current_stock, sku, ean, isbn, gtin, catalog_listing_eligible, product_id, permalink, updated_at, meli_weight_g"
      )
      .range(page * limit, (page + 1) * limit - 1)

    if (stockFirst) {
      dataQuery = dataQuery
        .order("current_stock", { ascending: false, nullsFirst: false })
        .order("updated_at",    { ascending: false, nullsFirst: false })
    } else {
      dataQuery = dataQuery.order("updated_at", { ascending: false, nullsFirst: false })
    }

    dataQuery = applyFilters(dataQuery)

    const { data, error } = await dataQuery
    if (error) throw error

    return NextResponse.json({ ok: true, rows: data ?? [], total: exactCount ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
