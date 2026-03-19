import { createClient } from "@/lib/db/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const accountId = request.nextUrl.searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("ml_import_progress")
      .select(
        "status, publications_scope, publications_offset, publications_total, discovered_count, fetched_count, upsert_new_count, failed_count, last_error, last_error_at, last_run_at, updated_at, ml_items_seen_count, db_rows_upserted_count, upsert_errors_count, last_sync_batch_at, finished_at",
      )
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ ok: true, progress: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
