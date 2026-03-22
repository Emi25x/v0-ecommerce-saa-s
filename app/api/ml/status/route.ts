import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get("ml_user_id")?.value

    if (!userId) {
      return NextResponse.json({ connected: false })
    }

    const supabase = await createClient()
    const { data: account, error } = await supabase
      .from("ml_accounts")
      .select("ml_user_id, nickname, token_expires_at")
      .eq("ml_user_id", userId)
      .single()

    if (error || !account) {
      console.log("[v0] ML Status - No account found in database")
      return NextResponse.json({ connected: false })
    }

    const expiresAt = new Date(account.token_expires_at)
    const now = new Date()
    const isExpired = expiresAt <= now

    console.log("[v0] ML Status - Account found:", account.nickname)
    console.log("[v0] ML Status - Token expires at:", expiresAt)
    console.log("[v0] ML Status - Is expired:", isExpired)

    return NextResponse.json({
      connected: true,
      userId: account.ml_user_id,
      nickname: account.nickname,
      tokenExpired: isExpired,
    })
  } catch (error) {
    console.error("[v0] ML Status check error:", error)
    return NextResponse.json({ connected: false })
  }
}
