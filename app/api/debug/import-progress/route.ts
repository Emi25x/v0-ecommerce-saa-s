/**
 * @internal Diagnostic endpoint — ML import progress for an account.
 * Used by: app/(dashboard)/ml/importer/page.tsx
 * Protected by requireUser() — only authenticated users can access.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const result = await supabase.from("ml_import_progress").select("*").eq("account_id", accountId).single()
    let progress = result.data
    const error = result.error

    if (error && error.code === "PGRST116") {
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
        return NextResponse.json({ error: "Failed to create progress" }, { status: 500 })
      }

      progress = newProgress
    } else if (error) {
      return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 })
    }

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
