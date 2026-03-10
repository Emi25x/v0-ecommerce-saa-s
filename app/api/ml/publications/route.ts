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
    const conStock      = searchParams.get("con_stock") === "1"
    const stockFirst    = searchParams.get("stock_first") === "1"
    const countsOnly    = searchParams.get("counts_only") === "1"
    const alertsMode    = searchParams.get("alerts_mode") as
      "eligible_catalog" | "under_review" | "about_to_pause" | null

    const supabase = await createClient()

    // ── Base filter helper (account + text search, no extra conditions) ───
    function baseFilters(qb: any): any {
      if (accountId) qb = qb.eq("account_id", accountId)
      if (q)         qb = qb.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%,sku.ilike.%${q}%`)
      return qb
    }

    // ── Counts: 7 parallel HEAD queries — no row fetch, no cap ────────────
    if (countsOnly) {
      const head = (extraFn: (qb: any) => any) => {
        let qb = supabase.from("ml_publications").select("id", { count: "exact", head: true })
        qb = baseFilters(qb)
        return extraFn(qb)
      }

      const [
        { count: total },
        { count: active },
        { count: paused },
        { count: closed },
        { count: sin_producto },
        { count: sin_stock },
        { count: con_stock },
        { count: eligible_catalog },
      ] = await Promise.all([
        head(qb => qb),
        head(qb => qb.eq("status", "active")),
        head(qb => qb.eq("status", "paused")),
        head(qb => qb.eq("status", "closed")),
        head(qb => qb.is("product_id", null)),
        head(qb => qb.lte("current_stock", 0)),
        head(qb => qb.gt("current_stock", 0)),
        head(qb => qb.eq("catalog_listing_eligible", true).or("catalog_listing.is.null,catalog_listing.eq.false")),
      ])

      return NextResponse.json({
        ok: true,
        counts: {
          total:            total            ?? 0,
          active:           active           ?? 0,
          paused:           paused           ?? 0,
          closed:           closed           ?? 0,
          sin_producto:     sin_producto     ?? 0,
          sin_stock:        sin_stock        ?? 0,
          con_stock:        con_stock        ?? 0,
          eligible_catalog: eligible_catalog ?? 0,
        },
      })
    }

    // ── alerts_mode: about_to_pause has no column yet ─────────────────────
    if (alertsMode === "about_to_pause") {
      return NextResponse.json({ ok: true, rows: [], total: 0, placeholder: true })
    }

    // ── Full filter helper (all active params) ────────────────────────────
    function applyFilters(qb: any): any {
      if (accountId)     qb = qb.eq("account_id", accountId)
      if (status)        qb = qb.eq("status", status)
      if (sinProducto)   qb = qb.is("product_id", null)
      if (soloElegibles) qb = qb.eq("catalog_listing_eligible", true).or("catalog_listing.is.null,catalog_listing.eq.false")
      if (sinStock)      qb = qb.lte("current_stock", 0)
      if (conStock)      qb = qb.gt("current_stock", 0)
      if (q)             qb = qb.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%,sku.ilike.%${q}%`)
      if (alertsMode === "eligible_catalog") qb = qb.eq("catalog_listing_eligible", true).eq("status", "active").or("catalog_listing.is.null,catalog_listing.eq.false")
      if (alertsMode === "under_review")     qb = qb.eq("status", "under_review")
      return qb
    }

    // ── 1. Exact count — HEAD query, no range, no cap ─────────────────────
    let countQuery = supabase.from("ml_publications").select("id", { count: "exact", head: true })
    countQuery = applyFilters(countQuery)
    const { count: exactCount, error: countErr } = await countQuery
    if (countErr) throw countErr

    // ── 2. Paginated data query ───────────────────────────────────────────
    let dataQuery = supabase
      .from("ml_publications")
      .select(
        "id, ml_item_id, account_id, title, status, price, current_stock, sku, ean, isbn, gtin, catalog_listing_eligible, catalog_listing, product_id, permalink, meli_weight_g, last_sync_at, updated_at"
      )
      .range(page * limit, (page + 1) * limit - 1)

    const useStockFirst = stockFirst || !!alertsMode
    if (useStockFirst) {
      dataQuery = dataQuery
        .order("current_stock", { ascending: false, nullsFirst: false })
        .order("updated_at",    { ascending: false, nullsFirst: false })
    } else {
      dataQuery = dataQuery.order("updated_at", { ascending: false, nullsFirst: false })
    }

    dataQuery = applyFilters(dataQuery)

    const { data, error } = await dataQuery
    if (error) throw error

    // ── 3. Import progress audit data ─────────────────────────────────────
    let progressAudit: Record<string, any> | null = null
    if (accountId) {
      const { data: prog } = await supabase
        .from("ml_import_progress")
        .select("status, publications_total, ml_items_seen_count, db_rows_upserted_count, upsert_errors_count, last_run_at, last_sync_batch_at, finished_at")
        .eq("account_id", accountId)
        .maybeSingle()

      if (prog) {
        progressAudit = {
          status:                 prog.status,
          ml_total:               prog.publications_total     ?? 0,
          ml_items_seen:          prog.ml_items_seen_count    ?? 0,
          db_rows_upserted:       prog.db_rows_upserted_count ?? 0,
          upsert_errors:          prog.upsert_errors_count    ?? 0,
          db_gap:                 (prog.publications_total ?? 0) - (prog.db_rows_upserted_count ?? 0),
          last_run_at:            prog.last_run_at,
          last_sync_batch_at:     prog.last_sync_batch_at,
          finished_at:            prog.finished_at,
        }
      }
    }

    return NextResponse.json({
      ok:       true,
      rows:     data ?? [],
      total:    exactCount ?? 0,
      db_count: exactCount ?? 0,
      progress: progressAudit,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
