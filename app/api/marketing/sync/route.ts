import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  const { data: connections } = await supabase
    .from("marketing_connections")
    .select("id, platform, credentials")
    .eq("is_active", true)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "No hay plataformas conectadas" })
  }

  const results: Record<string, any> = {}

  for (const conn of connections) {
    try {
      // Update last_synced_at
      await supabase
        .from("marketing_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", conn.id)

      results[conn.platform] = { ok: true }
    } catch (err: any) {
      results[conn.platform] = { ok: false, error: err.message }
    }
  }

  return NextResponse.json({ ok: true, synced: connections.length, results })
}
