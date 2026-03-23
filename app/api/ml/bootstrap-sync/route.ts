import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { executeBootstrapSync } from "@/domains/mercadolibre/sync/bootstrap-sync"

export const maxDuration = 300

/**
 * POST /api/ml/bootstrap-sync
 *
 * Imports all existing publications from a connected ML account,
 * extracts identifiers, and matches them to the product catalog.
 *
 * Body: { account_id, limit?, skip_matching? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { account_id, limit = 0, skip_matching = false } = body

    if (!account_id) {
      return NextResponse.json(
        { success: false, error: "account_id es requerido" },
        { status: 400 },
      )
    }

    const supabase = await createAdminClient()

    const result = await executeBootstrapSync(supabase, {
      accountId: account_id,
      limit,
      skipMatching: skip_matching,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message ?? "Internal error" },
      { status: 500 },
    )
  }
}

/**
 * GET /api/ml/bootstrap-sync?account_id=...
 *
 * Returns the current state of bootstrap sync for an account:
 * total publications, matched, unmatched, by status.
 */
export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "account_id es requerido" },
        { status: 400 },
      )
    }

    const supabase = await createAdminClient()

    // Get account info
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id, nickname, ml_user_id, total_ml_publications, last_stock_sync_at")
      .eq("id", accountId)
      .single()

    if (!account) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 })
    }

    // Get publication stats
    const { data: pubs, count: totalPubs } = await supabase
      .from("ml_publications")
      .select("id, product_id, status, matched_by", { count: "exact" })
      .eq("account_id", accountId)

    const linked = (pubs ?? []).filter((p: any) => p.product_id !== null).length
    const unlinked = (totalPubs ?? 0) - linked

    // Count by status
    const byStatus: Record<string, number> = {}
    for (const p of pubs ?? []) {
      byStatus[p.status ?? "unknown"] = (byStatus[p.status ?? "unknown"] ?? 0) + 1
    }

    // Count by match type
    const byMatchType: Record<string, number> = {}
    for (const p of pubs ?? []) {
      if (p.matched_by) {
        byMatchType[p.matched_by] = (byMatchType[p.matched_by] ?? 0) + 1
      }
    }

    // Get matcher progress
    const { data: matcherProgress } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    // Get latest run
    const { data: latestRun } = await supabase
      .from("process_runs")
      .select("id, status, started_at, finished_at, duration_ms, rows_processed, rows_created, rows_updated, rows_failed, log_json")
      .eq("process_type", "ml_bootstrap_sync")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        nickname: account.nickname,
        total_ml_publications: account.total_ml_publications,
        last_sync: account.last_stock_sync_at,
      },
      publications: {
        total: totalPubs ?? 0,
        linked,
        unlinked,
        by_status: byStatus,
        by_match_type: byMatchType,
      },
      matcher_progress: matcherProgress,
      latest_run: latestRun,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message ?? "Internal error" },
      { status: 500 },
    )
  }
}
