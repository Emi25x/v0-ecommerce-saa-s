import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { executeAutoSyncAccount } from "@/domains/mercadolibre/sync/auto-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET/POST /api/cron/auto-sync-all-accounts
 * Syncs all ML accounts. No longer self-fetches — calls lib directly.
 */
async function syncAllAccounts() {
  const supabase = createAdminClient()
  console.log("[CRON] Starting auto-sync for all accounts...")

  const { data: accounts, error } = await supabase
    .from("ml_accounts").select("id, nickname")

  if (error || !accounts) {
    throw new Error("Error fetching ML accounts")
  }

  console.log(`[CRON] ${accounts.length} account(s) found`)

  const results = []
  for (const account of accounts) {
    console.log(`[CRON] Syncing: ${account.nickname}`)
    try {
      const result = await executeAutoSyncAccount(supabase, { accountId: account.id })
      results.push({ account: account.nickname, status: result.success ? "completed" : "error", ...result })
    } catch (err) {
      console.error(`[CRON] Error syncing ${account.nickname}:`, err)
      results.push({ account: account.nickname, status: "error", error: err instanceof Error ? err.message : "Unknown" })
    }
  }

  return {
    success: true,
    message: "Auto-sync completed",
    summary: `${accounts.length} account(s) processed`,
    accounts: accounts.length,
    results,
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await syncAllAccounts()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const result = await syncAllAccounts()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
