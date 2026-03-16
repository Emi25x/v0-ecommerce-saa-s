import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/cs/conversations/[id]/reply
 * Send a reply in a conversation.
 * For ML channel: posts the answer via ML API.
 * For other channels: stores the message (WhatsApp / Instagram sending TBD).
 *
 * Body: { content, template_id? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { content, template_id } = body
  if (!content?.trim()) return NextResponse.json({ error: "content is required" }, { status: 400 })

  const adminSupabase = createAdminClient()

  // Load conversation
  const { data: conv, error: convErr } = await adminSupabase
    .from("cs_conversations")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single()

  if (convErr || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

  let channelError: string | null = null

  // ── ML question reply ──────────────────────────────────────────────────────
  if (conv.channel === "ml_question" && conv.external_id && conv.ml_account_id) {
    try {
      const { data: mlAcc } = await adminSupabase
        .from("ml_accounts")
        .select("access_token, refresh_token, ml_user_id, expires_at")
        .eq("id", conv.ml_account_id)
        .single()

      if (!mlAcc) throw new Error("ML account not found")

      // Use refreshTokenIfNeeded if token expired
      let token = mlAcc.access_token
      if (mlAcc.expires_at && new Date(mlAcc.expires_at) < new Date()) {
        const { refreshTokenIfNeeded } = await import("@/lib/mercadolibre")
        token = await refreshTokenIfNeeded(conv.ml_account_id)
      }

      const mlRes = await fetch(
        `https://api.mercadolibre.com/answers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            question_id: parseInt(conv.external_id),
            text: content.trim(),
          }),
        }
      )
      const mlData = await mlRes.json()
      if (!mlRes.ok) {
        channelError = `ML API error ${mlRes.status}: ${mlData?.message ?? JSON.stringify(mlData)}`
      }
    } catch (err: any) {
      channelError = `Error sending ML reply: ${err.message}`
    }
  }

  // ── Store message locally ──────────────────────────────────────────────────
  const { data: message, error: msgErr } = await adminSupabase
    .from("cs_messages")
    .insert({
      conversation_id: params.id,
      user_id: user.id,
      direction: "outbound",
      author_type: "agent",
      author_name: user.email ?? "Agent",
      content: content.trim(),
      content_type: "text",
      template_id: template_id ?? null,
      is_read: true,
    })
    .select()
    .single()

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  // Update conversation
  const newStatus = channelError ? conv.status : "answered"
  await adminSupabase
    .from("cs_conversations")
    .update({
      status: newStatus,
      last_message_at: new Date().toISOString(),
      message_count: (conv.message_count ?? 0) + 1,
    })
    .eq("id", params.id)

  // Update template last_used_at if a template was used (use_count requires DB-side increment)
  if (template_id) {
    try {
      await adminSupabase
        .from("cs_response_templates")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", template_id)
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok: true,
    message,
    channel_error: channelError,
    warning: channelError
      ? "Mensaje guardado localmente pero no se pudo enviar al canal: " + channelError
      : undefined,
  })
}
