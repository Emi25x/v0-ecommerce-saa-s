import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { executeFullImport } from "@/lib/import/batch-import"
import { requireCron } from "@/lib/auth/require-auth"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * POST /api/cron/resume-imports
 *
 * Detects orphaned import_history records (status='running' with stale updated_at)
 * and resumes them server-side using executeFullImport.
 */
export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  const log = createStructuredLogger({ request_id: genRequestId() })
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
      log.error("Query error", error, "resume_imports.query_error")
      return NextResponse.json({ ok: false, ranAt, error: error.message }, { status: 500 })
    }

    if (!orphans || orphans.length === 0) {
      return NextResponse.json({ ok: true, ranAt, message: "No orphaned imports" })
    }

    log.info(`Found ${orphans.length} orphaned imports`, "resume_imports.found", { count: orphans.length })

    const results: Record<string, unknown>[] = []

    for (const orphan of orphans) {
      // Mark as resuming to prevent double-pickup
      await supabase
        .from("import_history")
        .update({
          last_message: `Retomado por cron a las ${ranAt} (offset era ${orphan.current_offset})`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orphan.id)

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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        log.error(`Error resuming import ${orphan.id}`, err, "resume_imports.resume_error", { import_id: orphan.id })
        await supabase
          .from("import_history")
          .update({
            status: "failed",
            last_message: `Cron resume error: ${msg}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orphan.id)
        results.push({ id: orphan.id, error: msg })
      }
    }

    log.info(`Processed ${results.length} orphaned imports`, "resume_imports.done", { count: results.length })
    return NextResponse.json({ ok: true, ranAt, resumed: results.length, results })
  } catch (error: unknown) {
    log.error("Fatal error in resume-imports", error, "resume_imports.fatal")
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ ok: false, ranAt, error: { code: "internal_error", detail: message } }, { status: 500 })
  }
}
