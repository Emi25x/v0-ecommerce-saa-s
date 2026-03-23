/**
 * @internal Diagnostic endpoint — ML account details (without sensitive tokens).
 * Used by: app/(dashboard)/ml/matcher/page.tsx, app/(dashboard)/ml/importer/page.tsx
 * Protected by requireUser() — only authenticated users can access.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: account, error } = await supabase
      .from("ml_accounts")
      .select("id, nickname, ml_user_id, token_expires_at, refresh_token")
      .eq("id", accountId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: account.id,
      name: account.nickname,
      ml_user_id: account.ml_user_id,
      token_expires_at: account.token_expires_at,
      has_refresh_token: !!account.refresh_token,
      token_valid: account.token_expires_at ? new Date(account.token_expires_at) > new Date() : false,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
