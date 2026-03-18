import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

/**
 * GET /api/cs/channel-configs
 * Returns channel configurations for the current user.
 * Config fields with tokens are redacted for security.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("cs_channel_configs")
    .select("id, channel, name, is_active, created_at, updated_at")
    .eq("user_id", user.id)
    .order("channel")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ configs: data ?? [] })
}

/**
 * POST /api/cs/channel-configs
 * Create or update a channel config.
 * Body: { channel, name, is_active, config: { ... } }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.channel || !body?.name) {
    return NextResponse.json({ error: "channel and name are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("cs_channel_configs")
    .upsert(
      {
        user_id: user.id,
        channel: body.channel,
        name: body.name,
        is_active: body.is_active ?? false,
        config: body.config ?? {},
      },
      { onConflict: "user_id,channel,name" }
    )
    .select("id, channel, name, is_active, created_at, updated_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
