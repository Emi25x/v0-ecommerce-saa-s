import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/cs/ml-questions
 * Fetches unanswered ML questions from all connected ML accounts
 * and syncs them into cs_conversations / cs_messages.
 *
 * Query params:
 *   account_id - specific ML account UUID (optional)
 *   sync       - if "1", fetch fresh from ML API and upsert
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("account_id") || undefined
  const doSync    = searchParams.get("sync") === "1"

  const adminSupabase = createAdminClient()

  // Load ML accounts
  let accQuery = adminSupabase
    .from("ml_accounts")
    .select("id, nickname, ml_user_id, access_token, refresh_token, expires_at")
    .or(`user_id.eq.${user.id},user_id.is.null`)
  if (accountId) accQuery = accQuery.eq("id", accountId)

  const { data: accounts } = await accQuery
  if (!accounts?.length) return NextResponse.json({ conversations: [], synced: 0 })

  let synced = 0

  if (doSync) {
    const { refreshTokenIfNeeded } = await import("@/lib/mercadolibre")

    for (const acc of accounts) {
      try {
        const token = await refreshTokenIfNeeded(acc.id)

        // Fetch unanswered questions (ML API)
        const qRes = await fetch(
          `https://api.mercadolibre.com/questions/search?seller_id=${acc.ml_user_id}&status=UNANSWERED&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!qRes.ok) {
          console.warn(`[CS][ML] Failed to fetch questions for account ${acc.id}: HTTP ${qRes.status}`)
          continue
        }
        const qData = await qRes.json()
        const questions: any[] = qData.questions ?? []

        for (const q of questions) {
          const extId = String(q.id)

          // Upsert conversation
          const { data: conv } = await adminSupabase
            .from("cs_conversations")
            .upsert(
              {
                user_id: user.id,
                channel: "ml_question",
                external_id: extId,
                ml_account_id: acc.id,
                customer_name: q.from?.nickname ?? `Comprador ${q.from?.id ?? ""}`,
                customer_id: String(q.from?.id ?? ""),
                subject: q.text,
                status: q.status === "UNANSWERED" ? "pending_reply" : "answered",
                last_message_at: q.date_created ?? new Date().toISOString(),
              },
              { onConflict: "channel,external_id,user_id" }
            )
            .select("id")
            .single()

          if (conv?.id) {
            // Upsert the question as an inbound message
            await adminSupabase
              .from("cs_messages")
              .upsert(
                {
                  conversation_id: conv.id,
                  user_id: user.id,
                  direction: "inbound",
                  author_type: "customer",
                  author_name: q.from?.nickname ?? "Comprador",
                  content: q.text,
                  content_type: "text",
                  external_id: `q_${extId}`,
                  created_at: q.date_created ?? new Date().toISOString(),
                },
                { onConflict: "conversation_id,external_id" }
              )
              .catch(() => {})
          }
          synced++
        }
      } catch (err: any) {
        console.error(`[CS][ML] Error syncing account ${acc.id}:`, err.message)
      }
    }
  }

  // Return conversations from DB
  const { data: conversations } = await adminSupabase
    .from("cs_conversations")
    .select("*")
    .eq("user_id", user.id)
    .eq("channel", "ml_question")
    .order("last_message_at", { ascending: false })
    .limit(100)

  return NextResponse.json({ conversations: conversations ?? [], synced })
}
