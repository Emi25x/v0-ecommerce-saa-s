import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const accountId = id

    const { data: account, error } = await supabase.from("ml_accounts").select("*").eq("id", accountId).single()

    if (error || !account) {
      return NextResponse.json({ connected: false, error: "Account not found" }, { status: 404 })
    }

    const now = new Date()
    const expiresAt = new Date(account.expires_at)
    const tokenExpired = now >= expiresAt

    return NextResponse.json({
      connected: !tokenExpired,
      tokenExpired,
      nickname: account.nickname,
      ml_user_id: account.ml_user_id,
      expires_at: account.expires_at,
    })
  } catch (error) {
    console.error("[v0] Error checking account status:", error)
    return NextResponse.json({ connected: false, error: "Failed to check status" }, { status: 500 })
  }
}
