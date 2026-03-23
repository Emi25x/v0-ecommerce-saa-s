/**
 * @internal Webhook queue monitor — returns count of unprocessed notifications.
 * Protected by requireUser() — only authenticated users can access.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {
    const supabase = createAdminClient()

    const { count, error } = await supabase
      .from("ml_webhook_queue")
      .select("*", { count: "exact", head: true })
      .eq("processed", false)

    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        return NextResponse.json({ count: 0, message: "Webhook queue not configured" })
      }
      console.error("[webhooks/queue] Error fetching count:", error)
      return NextResponse.json({ count: 0, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch (error) {
    console.error("[webhooks/queue] Error:", error)
    return NextResponse.json({ count: 0, error: "Internal server error" }, { status: 500 })
  }
}
