import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()

    const [
      { count: activeLists },
      { count: calculated },
      { count: warnings },
      { count: marginLow },
      { count: sinCosto },
      { count: sinPvp },
      { data: recentLists },
    ] = await Promise.all([
      supabase.from("price_lists").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("product_prices").select("product_id", { count: "exact", head: true }),
      supabase.from("product_prices").select("product_id", { count: "exact", head: true }).eq("has_warnings", true),
      supabase.from("product_prices").select("product_id", { count: "exact", head: true }).eq("margin_below_min", true),
      supabase.from("product_costs").select("product_id", { count: "exact", head: true }).is("supplier_cost", null),
      supabase.from("products").select("id", { count: "exact", head: true }).is("pvp_editorial", null),
      supabase.from("price_lists").select("id, name, channel, currency, pricing_base, updated_at")
        .order("updated_at", { ascending: false }).limit(5),
    ])

    return NextResponse.json({
      ok: true,
      stats: {
        active_lists:      activeLists ?? 0,
        calculated:        calculated  ?? 0,
        with_warnings:     warnings    ?? 0,
        margin_low:        marginLow   ?? 0,
        sin_costo:         sinCosto    ?? 0,
        sin_pvp:           sinPvp      ?? 0,
      },
      recent_lists: recentLists ?? [],
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
