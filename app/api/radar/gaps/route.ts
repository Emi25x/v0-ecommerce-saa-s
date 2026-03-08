import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const page   = parseInt(searchParams.get("page") ?? "0")
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200)

  try {
    let qb = supabase
      .from("editorial_radar_gaps")
      .select("*", { count: "exact" })
      .order("gap_score", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (status) qb = qb.eq("status", status)

    const { data, error, count } = await qb
    if (error) throw error
    return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from("editorial_radar_gaps")
      .insert({ ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ ok: true, row: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
