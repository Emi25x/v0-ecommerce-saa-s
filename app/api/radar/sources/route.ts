import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("editorial_radar_sources")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, rows: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = createAdminClient()
  const body = await req.json()
  const { name, kind, url, sync_interval_hours, config_json } = body
  if (!name || !kind) return NextResponse.json({ error: "name y kind son requeridos" }, { status: 400 })
  const { data, error } = await supabase
    .from("editorial_radar_sources")
    .insert({ name, kind, url: url || null, sync_interval_hours: sync_interval_hours ?? 24, config_json: config_json ?? null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: data })
}
