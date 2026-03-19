import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const signal_type = searchParams.get("signal_type")
  const q = searchParams.get("q")?.trim()
  const source_id = searchParams.get("source_id")
  const days = parseInt(searchParams.get("days") ?? "30")
  const page = parseInt(searchParams.get("page") ?? "0")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500)

  try {
    const since = new Date(Date.now() - days * 86400_000).toISOString()

    let qb = supabase
      .from("editorial_radar_signals")
      .select("*", { count: "exact" })
      .gte("captured_at", since)
      .order("score", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (signal_type) qb = qb.eq("signal_type", signal_type)
    if (source_id) qb = qb.eq("source_id", source_id)
    if (q) qb = qb.or(`title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%`)

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
      .from("editorial_radar_signals")
      .insert({ ...body, captured_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ ok: true, row: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
