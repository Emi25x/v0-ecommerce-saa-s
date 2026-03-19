import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    console.log(`[DEBUG-PROGRESS] Checking progress for account: ${accountId}`)

    // Service role para bypassear RLS
    const supabaseUrl = process.env.SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar progress
    const result = await supabase.from("ml_import_progress").select("*").eq("account_id", accountId).single()
    let progress = result.data
    const error = result.error

    if (error && error.code === "PGRST116") {
      // No existe, crear con defaults
      console.log(`[DEBUG-PROGRESS] Progress not found, creating with defaults`)

      const { data: newProgress, error: insertError } = await supabase
        .from("ml_import_progress")
        .insert({
          account_id: accountId,
          status: "idle",
          publications_scope: "all",
          activity_days: 30,
          publications_offset: 0,
          publications_total: null,
        })
        .select()
        .single()

      if (insertError) {
        console.error(`[DEBUG-PROGRESS] Error creating progress:`, insertError)
        return NextResponse.json({ error: "Failed to create progress" }, { status: 500 })
      }

      progress = newProgress
    } else if (error) {
      console.error(`[DEBUG-PROGRESS] Error fetching progress:`, error)
      return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 })
    }

    console.log(`[DEBUG-PROGRESS] Progress found:`, progress)

    return NextResponse.json({
      account_id: progress.account_id,
      status: progress.status,
      publications_scope: progress.publications_scope,
      activity_days: progress.activity_days,
      publications_offset: progress.publications_offset,
      publications_total: progress.publications_total,
      paused_until: progress.paused_until,
      last_error: progress.last_error,
      last_run_at: progress.last_run_at,
      created_at: progress.created_at,
      updated_at: progress.updated_at,
    })
  } catch (error: any) {
    console.error(`[DEBUG-PROGRESS] Unexpected error:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
