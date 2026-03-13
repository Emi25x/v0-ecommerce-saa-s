import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/cs/conversations/[id]
 * Returns a conversation with its messages.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: conversation, error } = await supabase
    .from("cs_conversations")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single()

  if (error || !conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: messages } = await supabase
    .from("cs_messages")
    .select("*")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true })

  // Mark all inbound messages as read
  await supabase
    .from("cs_messages")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("conversation_id", params.id)
    .eq("is_read", false)
    .eq("direction", "inbound")

  // Reset unread count
  await supabase
    .from("cs_conversations")
    .update({ unread_count: 0 })
    .eq("id", params.id)

  return NextResponse.json({ conversation, messages: messages ?? [] })
}

/**
 * PATCH /api/cs/conversations/[id]
 * Update conversation status, priority, etc.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const allowed = ["status", "priority", "customer_name", "subject"]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("cs_conversations")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conversation: data })
}
