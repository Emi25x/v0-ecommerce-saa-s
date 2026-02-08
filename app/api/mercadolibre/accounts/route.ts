import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

// GET - List all ML accounts
export async function GET(request: NextRequest) {
  try {
    console.log("[v0] GET /api/mercadolibre/accounts - Starting")
    const supabase = await createClient()
    console.log("[v0] Supabase client created")

    const { data: accounts, error } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, nickname, token_expires_at, access_token, refresh_token, created_at, updated_at")
      .order("created_at", { ascending: false })

    console.log("[v0] Query result - accounts:", accounts, "error:", error)

    if (error) {
      console.error("[v0] Error fetching ML accounts:", error)
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 })
    }

    console.log("[v0] Found", accounts?.length || 0, "ML accounts")

    // Auto-refresh tokens if needed and check token expiration for each account
    const accountsWithStatus = await Promise.all(
      accounts.map(async (account) => {
        try {
          // Try to refresh token if expired/expiring soon (within 5 minutes)
          const refreshedAccount = await refreshTokenIfNeeded({
            id: account.id,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            token_expires_at: account.token_expires_at,
          })

          const expiresAt = new Date(refreshedAccount.token_expires_at)
          const now = new Date()
          const isExpired = expiresAt <= now

          console.log("[v0] Account", account.nickname, "- expires:", expiresAt, "expired:", isExpired)

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
        } catch (refreshError) {
          // If refresh fails, return account as expired
          console.error("[v0] Failed to refresh token for account", account.nickname, ":", refreshError)
          
          const expiresAt = new Date(account.token_expires_at)
          const now = new Date()
          const isExpired = expiresAt <= now

          return {
            id: account.id,
            ml_user_id: account.ml_user_id,
            nickname: account.nickname,
            token_expires_at: account.token_expires_at,
            created_at: account.created_at,
            updated_at: account.updated_at,
            tokenExpired: true, // Mark as expired if refresh failed
            connected: false,
          }
        }
      })
    )

    console.log("[v0] Returning", accountsWithStatus.length, "accounts with status")
    return NextResponse.json({ accounts: accountsWithStatus })
  } catch (error) {
    console.error("[v0] Error in GET /api/mercadolibre/accounts:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove an ML account
export async function DELETE(request: NextRequest) {
  try {
    const { accountId } = await request.json()

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.from("ml_accounts").delete().eq("id", accountId)

    if (error) {
      console.error("[v0] Error deleting ML account:", error)
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in DELETE /api/mercadolibre/accounts:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
