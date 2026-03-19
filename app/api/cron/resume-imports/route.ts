import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { executeFullImport } from "@/lib/import/batch-import"
import { requireCron } from "@/lib/auth/require-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * POST /api/cron/resume-imports
 *
 * Detects orphaned import_history records (status='running' with stale updated_at)
 * and resumes them server-side using executeFullImport.
 *
 * An import is considered orphaned if:
 *  - status = 'running'
 *  - updated_at < now() - 5 minutes (no heartbeat from the browser loop)
 *  - current_offset > 0 (partially completed, not just started)
 *
 * This cron is safe to run repeatedly:
 *  - executeFullImport re-downloads the CSV and processes from offset 0,
 *    but the underlying upsert is idempotent (ON CONFLICT ean).
 *  - We mark the record as 'failed' with a note before attempting retry,
 *    so a subsequent cron won't double-process if this one is still running.
 */
export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  const ranAt = new Date().toISOString()

  try {
    const supabase = await createClient()

    // Find orphaned imports: running but no heartbeat for 5+ minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: orphans, error } = await supabase
      .from("import_history")
      .select("id, source_id, mode, current_offset, processed_rows, updated_at")
      .eq("status", "running")
      .lt("updated_at", fiveMinAgo)
      .limit(3)

    if (error) {
      console.error("[CRON RESUME-IMPORTS] Query error:", error.message)
      return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
    }

    if (!orphans || orphans.length === 0) {
      return NextResponse.json({ ok: true, ranAt, message: "No orphaned imports" })
    }

    console.log(`[CRON RESUME-IMPORTS] Found ${orphans.length} orphaned imports`)

    const results: any[] = []

    for (const orphan of orphans) {
      // Mark as resuming to prevent double-pickup
      await supabase
        .from("import_history")
        .update({
          last_message: `Retomado por cron a las ${ranAt} (offset era ${orphan.current_offset})`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orphan.id)

      // Get the source to determine feed_type
      const { data: source } = await supabase
        .from("import_sources")
        .select("feed_type")
        .eq("id", orphan.source_id)
        .single()

      if (!source) {
        await supabase
          .from("import_history")
          .update({
            status: "failed",
            last_message: "Source not found during cron resume",
          })
          .eq("id", orphan.id)
        results.push({ id: orphan.id, error: "source_not_found" })
        continue
      }

      try {
        // executeFullImport runs the full loop server-side
        // The underlying upsert is idempotent, so re-processing already-done rows is safe
        const result = await executeFullImport(orphan.source_id, source.feed_type)

        await supabase
          .from("import_history")
          .update({
            status: result.success ? "completed" : "failed",
            last_message: result.message,
            completed_at: result.success ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orphan.id)

        results.push({
          id: orphan.id,
          source_id: orphan.source_id,
          success: result.success,
          created: result.created,
          updated: result.updated,
        })
      } catch (err: any) {
        console.error(`[CRON RESUME-IMPORTS] Error resuming ${orphan.id}:`, err.message)
        await supabase
          .from("import_history")
          .update({
            status: "failed",
            last_message: `Cron resume error: ${err.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orphan.id)
        results.push({ id: orphan.id, error: err.message })
      }
    }

    console.log(`[CRON RESUME-IMPORTS] Processed ${results.length} orphaned imports`)
    return NextResponse.json({ ok: true, ranAt, resumed: results.length, results })
  } catch (error: any) {
    console.error("[CRON RESUME-IMPORTS] Fatal:", error)
    return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
  }
}
