import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const status   = searchParams.get("status")
  const priority = searchParams.get("priority")
  const page     = parseInt(searchParams.get("page") ?? "0")
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200)

  try {
    let qb = supabase
      .from("editorial_radar_adaptations")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (status)   qb = qb.eq("status", status)
    if (priority) qb = qb.eq("priority", priority)

    const { data, error, count } = await qb
    if (error) throw error
    return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from("editorial_radar_adaptations")
      .insert({ ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ ok: true, row: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
