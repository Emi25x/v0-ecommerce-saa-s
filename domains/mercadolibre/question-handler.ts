import { createClient } from "@/lib/db/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

export async function handleQuestionNotification(notification: {
  topic: string
  resource: string
  user_id: string
  application_id?: string
  sent?: string
  received?: string
}) {
  try {
    const supabase = await createClient()
    const questionId = notification.resource.split("/").pop()

    console.log(`[v0] Processing question notification for question ${questionId}`)

    // Buscar la cuenta de ML
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("ml_user_id", notification.user_id.toString())
      .single()

    if (account) {
      const validAccount = await refreshTokenIfNeeded(account)

      // Obtener datos de la pregunta
      const questionResponse = await fetch(
        `https://api.mercadolibre.com/questions/${questionId}`,
        {
          headers: { Authorization: `Bearer ${validAccount.access_token}` },
        }
      )

      if (questionResponse.ok) {
        const questionData = await questionResponse.json()

        await supabase.from("ml_questions_cache").upsert(
          {
            id: questionData.id.toString(),
            account_id: account.id,
            item_id: questionData.item_id,
            question_text: questionData.text,
            status: questionData.status,
            from_user_id: questionData.from?.id?.toString(),
            question_data: questionData,
            cached_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )

        console.log(`[v0] Question ${questionId} synced to cache`)
      }
    }

    await supabase.from("ml_webhook_queue").insert({
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      processed: true,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Error handling question notification:", error)
  }
}
