import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get("platform")

  let query = supabase
    .from("marketing_connections")
    .select("id, platform, account_id, account_name, is_active, last_synced_at, metadata, created_at, updated_at")
    .order("created_at", { ascending: false })

  if (platform) query = query.eq("platform", platform)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connections: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { platform, account_id, account_name, credentials, metadata } = body
  if (!platform) return NextResponse.json({ error: "platform requerido" }, { status: 400 })

  // Upsert by platform (one connection per platform for now)
  const { data, error } = await supabase
    .from("marketing_connections")
    .upsert(
      {
        platform,
        account_id: account_id ?? null,
        account_name: account_name ?? null,
        credentials: credentials ?? {},
        metadata: metadata ?? {},
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform" },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connection: data })
}
