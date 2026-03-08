import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase    = await createClient()
    const { searchParams } = req.nextUrl
    const page         = parseInt(searchParams.get("page")  ?? "0", 10)
    const limit        = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)
    const priceListId  = searchParams.get("price_list_id")
    const warningsOnly = searchParams.get("warnings_only") === "1"
    const marginLow    = searchParams.get("margin_low")    === "1"

    let q = supabase
      .from("product_prices")
      .select(`
        *,
        product:products(id, title, ean, sku, pvp_editorial),
        list:price_lists(id, name, channel, currency)
      `, { count: "exact" })
      .range(page * limit, (page + 1) * limit - 1)
      .order("updated_at", { ascending: false })

    if (priceListId)  q = q.eq("price_list_id", priceListId)
    if (warningsOnly) q = q.eq("has_warnings", true)
    if (marginLow)    q = q.eq("margin_below_min", true)

    const { data, count, error } = await q
    if (error) throw error
    return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
