import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { account_id } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[IMPORT-PRO-RESET] Resetting progress for account: ${account_id}`)

    // TODO: Authentication - Implement when Supabase Auth is configured
    // For now, skip auth validation to allow development/testing
    // const supabaseAuth = await createClient()
    // const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    // if (authError || !user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    const supabase = createAdminClient()

    // Verify account exists (ownership check disabled until auth is implemented)
    const { data: account } = await supabase.from("ml_accounts").select("id").eq("id", account_id).single()

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Reset progress (including scroll_id for fresh scroll pagination)
    // Also reset audit counters so they don't carry over stale data
    const { error: updateError } = await supabase
      .from("ml_import_progress")
      .update({
        publications_offset: 0,
        publications_total: null,
        scroll_id: null,
        status: "idle",
        paused_until: null,
        last_error: null,
        last_error_at: null,
        last_run_at: null,
        // audit counters
        ml_items_seen_count: 0,
        db_rows_upserted_count: 0,
        upsert_errors_count: 0,
        // metric counters
        discovered_count: 0,
        fetched_count: 0,
        upsert_new_count: 0,
        request_count: 0,
        finished_at: null,
      })
      .eq("account_id", account_id)

    if (updateError) {
      console.error(`[IMPORT-PRO-RESET] Error resetting:`, updateError)
      return NextResponse.json({ error: "Failed to reset" }, { status: 500 })
    }

    console.log(`[IMPORT-PRO-RESET] Reset complete`)

    return NextResponse.json({
      ok: true,
      message: "Import progress reset successfully",
    })
  } catch (error: any) {
    console.error("[IMPORT-PRO-RESET] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
