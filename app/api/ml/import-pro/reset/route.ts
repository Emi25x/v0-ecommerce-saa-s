import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { account_id } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[IMPORT-PRO-RESET] Resetting progress for account: ${account_id}`)

    // Authentication check
    const supabaseAuth = await createClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use service role for reset operation
    const supabase = await createClient({ useServiceRole: true })

    // Verify account ownership
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("owner_id", user.id)
      .single()

    if (!account) {
      return NextResponse.json({ error: "Account not found or access denied" }, { status: 403 })
    }

    // Reset progress
    const { error: updateError } = await supabase
      .from("ml_import_progress")
      .update({
        publications_offset: 0,
        publications_total: null,
        status: "idle",
        paused_until: null,
        last_error: null,
        last_run_at: null,
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
