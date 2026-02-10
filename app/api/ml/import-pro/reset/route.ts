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

    const supabase = await createClient()

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
