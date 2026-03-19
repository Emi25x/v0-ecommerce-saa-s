import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[DEBUG-ML-ACCOUNT] Looking up account: ${accountId}`)

    // Usar service role para bypassear RLS
    const supabase = createAdminClient()

    const { data: account, error } = await supabase
      .from("ml_accounts")
      .select("id, nickname, ml_user_id, token_expires_at, refresh_token")
      .eq("id", accountId)
      .single()

    if (error) {
      console.error(`[DEBUG-ML-ACCOUNT] Error fetching account:`, error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Retornar sin tokens sensibles
    const response = {
      id: account.id,
      name: account.nickname,
      ml_user_id: account.ml_user_id,
      token_expires_at: account.token_expires_at,
      has_refresh_token: !!account.refresh_token,
      token_valid: account.token_expires_at ? new Date(account.token_expires_at) > new Date() : false,
    }

    console.log(`[DEBUG-ML-ACCOUNT] Account found:`, response)

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[DEBUG-ML-ACCOUNT] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
