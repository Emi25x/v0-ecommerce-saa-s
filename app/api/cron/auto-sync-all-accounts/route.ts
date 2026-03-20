import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { executeAutoSyncAccount } from "@/domains/mercadolibre/sync/auto-sync"
import { requireCron } from "@/lib/auth/require-auth"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET/POST /api/cron/auto-sync-all-accounts
 * Syncs all ML accounts. No longer self-fetches — calls lib directly.
 */
async function syncAllAccounts() {
  const log = createStructuredLogger({ request_id: genRequestId() })
  const supabase = createAdminClient()
  log.info("Starting auto-sync for all accounts", "auto_sync.start")

  const { data: accounts, error } = await supabase.from("ml_accounts").select("id, nickname")

  if (error || !accounts) {
    throw new Error("Error fetching ML accounts")
  }

  log.info(`${accounts.length} account(s) found`, "auto_sync.accounts", { count: accounts.length })

  const results = []
  for (const account of accounts) {
    log.info(`Syncing: ${account.nickname}`, "auto_sync.account", { account: account.nickname })
    try {
      const result = await executeAutoSyncAccount(supabase, { accountId: account.id })
      results.push({ account: account.nickname, status: result.success ? "completed" : "error", ...result })
    } catch (err) {
      log.error(`Error syncing ${account.nickname}`, err, "auto_sync.account_error", { account: account.nickname })
      results.push({
        account: account.nickname,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown",
      })
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

export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  try {
    const result = await syncAllAccounts()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  try {
    const result = await syncAllAccounts()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
