/**
 * GET /api/ml/accounts — List ML accounts with auto-refresh and connection status.
 * DELETE /api/ml/accounts — Remove an ML account.
 *
 * Canonical endpoint. /api/mercadolibre/accounts re-exports from here.
 */
import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-auth"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

export async function GET() {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {
    const { data: accounts, error } = await auth.supabase
      .from("ml_accounts")
      .select("id, ml_user_id, nickname, token_expires_at, access_token, refresh_token, created_at, updated_at")
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 })
    }

    const accountsWithStatus = await Promise.all(
      (accounts ?? []).map(async (account) => {
        try {
          const refreshedAccount = await refreshTokenIfNeeded({
            id: account.id,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            token_expires_at: account.token_expires_at,
          })

          const expiresAt = new Date(refreshedAccount.token_expires_at)
          const isExpired = expiresAt <= new Date()

          return {
            id: account.id,
            ml_user_id: account.ml_user_id,
            nickname: account.nickname,
            token_expires_at: refreshedAccount.token_expires_at,
            created_at: account.created_at,
            updated_at: account.updated_at,
            tokenExpired: isExpired,
            connected: !isExpired,
          }
        } catch {
          return {
            id: account.id,
            ml_user_id: account.ml_user_id,
            nickname: account.nickname,
            token_expires_at: account.token_expires_at,
            created_at: account.created_at,
            updated_at: account.updated_at,
            tokenExpired: true,
            connected: false,
          }
        }
      }),
    )

    return NextResponse.json({ accounts: accountsWithStatus })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {
    const { accountId } = await request.json()

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 })
    }

    const { error } = await auth.supabase.from("ml_accounts").delete().eq("id", accountId)

    if (error) {
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
