/**
 * GET /api/ml/catalog/eligibility
 *
 * Returns paginated ml_publications that have ISBN/EAN/GTIN,
 * along with their catalog eligibility state.
 *
 * Query params:
 *   account_id       – filter by ML account
 *   eligible         – "1" only eligible, "0" only not-eligible
 *   has_product_id   – "1" only those with catalog_product_id resolved
 *   q                – search title / item_id / isbn / ean
 *   page             – 0-based
 *   limit            – default 50, max 100
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const accountId = searchParams.get("account_id")
    const eligible = searchParams.get("eligible") // "1" | "0" | null
    const hasProductId = searchParams.get("has_product_id") // "1" | null
    const q = searchParams.get("q")?.trim()
    const page = parseInt(searchParams.get("page") ?? "0", 10)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)

    const supabase = await createClient()

    let query = supabase
      .from("ml_publications")
      .select(
        "id, ml_item_id, account_id, title, status, price, current_stock, sku, ean, isbn, gtin, catalog_listing_eligible, catalog_product_id, product_id, permalink, updated_at",
        { count: "exact" },
      )
      // Only show publications that have at least one identifier
      .or("isbn.not.is.null,ean.not.is.null,gtin.not.is.null")
      .order("catalog_listing_eligible", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (accountId) query = query.eq("account_id", accountId)

    if (eligible === "1") query = query.eq("catalog_listing_eligible", true)
    if (eligible === "0") query = query.or("catalog_listing_eligible.is.null,catalog_listing_eligible.eq.false")

    if (hasProductId === "1") query = query.not("catalog_product_id", "is", null)

    if (q) {
      query = query.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%,isbn.ilike.%${q}%,ean.ilike.%${q}%`)
    }

    const { data, count, error } = await query
    if (error) throw error

    // ── Counts for badges ────────────────────────────────────────────────────
    let countQ = supabase
      .from("ml_publications")
      .select("catalog_listing_eligible, catalog_product_id", { count: "exact", head: false })
      .or("isbn.not.is.null,ean.not.is.null,gtin.not.is.null")

    if (accountId) countQ = countQ.eq("account_id", accountId)

    const { data: allRows } = await countQ

    const totalWithId = allRows?.length ?? 0
    const eligible_count = allRows?.filter((r) => r.catalog_listing_eligible === true).length ?? 0
    const matched_count = allRows?.filter((r) => r.catalog_product_id !== null).length ?? 0
    const pending_count = allRows?.filter((r) => r.catalog_product_id === null).length ?? 0

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
      total: count ?? 0,
      counts: { total: totalWithId, eligible: eligible_count, matched: matched_count, pending: pending_count },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
