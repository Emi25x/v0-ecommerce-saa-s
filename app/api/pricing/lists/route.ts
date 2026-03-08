import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase    = await createClient()
    const { searchParams } = req.nextUrl
    const activeOnly  = searchParams.get("active_only") === "1"

    let q = supabase
      .from("price_lists")
      .select(`
        *,
        rules:price_list_rules(*),
        fee_rules:price_list_fee_rules(*),
        assignments:price_list_assignments(count),
        warehouse:warehouses(id,name,base_currency,code)
      `)
      .order("created_at", { ascending: false })

    if (activeOnly) q = q.eq("is_active", true)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ ok: true, lists: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await req.json()
    const { name, channel = "ml", country_code = "AR", currency = "ARS",
            pricing_base = "cost", description = "", is_active = true,
            warehouse_id = null } = body

    if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 })

    const { data: list, error: listErr } = await supabase
      .from("price_lists")
      .insert({ name, channel, country_code, currency, pricing_base, description, is_active, warehouse_id })
      .select()
      .single()

    if (listErr) throw listErr

    // Create default rules row
    await supabase.from("price_list_rules").insert({ price_list_id: list.id })

    return NextResponse.json({ ok: true, list })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
