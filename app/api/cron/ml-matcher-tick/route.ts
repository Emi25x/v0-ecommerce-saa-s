import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { runMatcherBatch } from "@/lib/ml/matcher-logic"

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
export async function POST() {
  const ranAt = new Date().toISOString()

  try {
    const supabase = createAdminClient()

    // Find accounts with active matcher work:
    // - status 'idle' with a cursor means the UI started but stopped polling
    // - status 'running' with stale heartbeat means the previous request crashed
    const { data: rows, error } = await supabase
      .from("ml_matcher_progress")
      .select("account_id, status, last_heartbeat_at, cursor")
      .in("status", ["idle", "running"])
      .not("cursor", "is", null)
      .limit(5)

    if (error) {
      console.error("[CRON ML-MATCHER] Error querying progress:", error.message)
      return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, ranAt, message: "No active matcher work" })
    }

    const results: any[] = []

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
      } catch (err: any) {
        console.error(`[CRON ML-MATCHER] Error for ${row.account_id}:`, err.message)
        results.push({ account_id: row.account_id, error: err.message })
      }
    }

    console.log(`[CRON ML-MATCHER] Processed ${results.length} accounts`)
    return NextResponse.json({ ok: true, ranAt, processed: results.length, results })
  } catch (error: any) {
    console.error("[CRON ML-MATCHER] Fatal:", error)
    return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
  }
}
