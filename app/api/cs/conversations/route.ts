import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/cs/conversations
 * Returns paginated conversation list for the current user.
 * Query params:
 *   channel   - filter by channel (ml_question, whatsapp, instagram, etc.)
 *   status    - filter by status (open, pending_reply, answered, closed)
 *   q         - search in subject or customer_name
 *   page      - page number (default 1)
 *   limit     - page size (default 30)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const channel       = searchParams.get("channel")        || undefined
  const status        = searchParams.get("status")         || undefined
  const q             = searchParams.get("q")              || undefined
  const ml_account_id = searchParams.get("ml_account_id") || undefined
  const page    = Math.max(1, parseInt(searchParams.get("page")  || "1"))
  const limit   = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30")))
  const offset  = (page - 1) * limit

  let query = supabase
    .from("cs_conversations")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (channel)       query = query.eq("channel", channel)
  if (status)        query = query.eq("status", status)
  if (ml_account_id) query = query.eq("ml_account_id", ml_account_id)
  if (q) {
    query = query.or(`subject.ilike.%${q}%,customer_name.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    conversations: data ?? [],
    total: count ?? 0,
    page,
    limit,
  })
}

/**
 * POST /api/cs/conversations
 * Create or update (upsert) a conversation.
 * Body: { channel, external_id, customer_name, customer_id, subject, ... }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.channel) return NextResponse.json({ error: "channel is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("cs_conversations")
    .upsert(
      { ...body, user_id: user.id },
      { onConflict: "channel,external_id,user_id", ignoreDuplicates: false }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conversation: data })
}
