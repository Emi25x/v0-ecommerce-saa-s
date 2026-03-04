/**
 * GET /api/ml/intel/data?account_id=UUID&type=opportunities|snapshots&status=new
 * Devuelve datos de ml_opportunities o ml_market_snapshots para la UI.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account_id = searchParams.get("account_id")
  const type = searchParams.get("type") || "opportunities"
  const status = searchParams.get("status") || "new"

  if (!account_id) {
    return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (type === "snapshots") {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from("ml_market_snapshots")
      .select("id, ean, category_id, min_price, median_price, avg_price, sellers_count, full_sellers_count, free_shipping_rate, sold_qty_proxy, captured_at")
      .eq("account_id", account_id)
      .eq("captured_day", today)
      .order("captured_at", { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  }

  // type === "opportunities"
  const { data, error } = await supabase
    .from("ml_opportunities")
    .select("id, ean, title, category_id, min_price, median_price, sellers_count, full_sellers_count, sold_qty_proxy, opportunity_score, status, created_at")
    .eq("account_id", account_id)
    .eq("status", status)
    .order("opportunity_score", { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}
