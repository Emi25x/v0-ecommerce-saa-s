import { type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { NextResponse } from "next/server"
import { runMatcherBatch } from "@/domains/mercadolibre/matcher"
import { requireCron } from "@/lib/auth/require-auth"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/cron/ml-matcher-tick
 *
 * Vercel Cron: advances ML matcher for all accounts that have pending work.
 * Picks up where the UI left off — no browser needed.
 *
 * Logic:
 *  1. Find accounts with status != 'completed' and cursor != null (i.e. work in progress)
 *  2. Also pick up accounts stuck in 'running' with stale heartbeat (>90s)
 *  3. Run one batch per account (max 3 accounts per tick to stay under 60s)
 */
export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  const log = createStructuredLogger({ request_id: genRequestId() })
  const ranAt = new Date().toISOString()

  try {
    const supabase = createAdminClient()

    const { data: rows, error } = await supabase
      .from("ml_matcher_progress")
      .select("account_id, status, last_heartbeat_at, cursor")
      .in("status", ["idle", "running"])
      .not("cursor", "is", null)
      .limit(5)

    if (error) {
      log.error("Error querying matcher progress", error, "ml_matcher_tick.query_error")
      return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, ranAt, message: "No active matcher work" })
    }

    const results: Record<string, unknown>[] = []

    for (const row of rows) {
      // Skip if another process is actively working (heartbeat < 90s)
      if (row.status === "running") {
        const since = (Date.now() - new Date(row.last_heartbeat_at ?? 0).getTime()) / 1000
        if (since < 90) continue // still active, skip
      }

      try {
        const result = await runMatcherBatch(supabase, createAdminClient(), {
          account_id: row.account_id,
          max_seconds: 15,
          batch_size: 200,
        })
        results.push({ account_id: row.account_id, ...result })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        log.error(`Error for account ${row.account_id}`, err, "ml_matcher_tick.account_error", {
          account_id: row.account_id,
        })
        results.push({ account_id: row.account_id, error: msg })
      }
    }

    log.info(`Processed ${results.length} accounts`, "ml_matcher_tick.done", { count: results.length })
    return NextResponse.json({ ok: true, ranAt, processed: results.length, results })
  } catch (error: unknown) {
    log.error("Fatal error in matcher tick", error, "ml_matcher_tick.fatal")
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ ok: false, ranAt, error: { code: "internal_error", detail: message } }, { status: 500 })
  }
}
