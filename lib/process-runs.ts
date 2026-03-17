/**
 * Unified process run tracker.
 *
 * Usage:
 *   const run = await startRun(supabase, "arnoia_stock", "Arnoia Stock Diario")
 *   try {
 *     // ... do work ...
 *     await run.complete({ rows_updated: 42, log_json: { zeroed: 5 } })
 *   } catch (err) {
 *     await run.fail(err)
 *     throw err
 *   }
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface RunHandle {
  id: string
  complete(counters?: Partial<RunCounters>): Promise<void>
  fail(err: unknown): Promise<void>
}

interface RunCounters {
  rows_processed: number
  rows_created: number
  rows_updated: number
  rows_failed: number
  log_json: Record<string, unknown>
}

/**
 * Insert a new process_runs row with status='running'.
 * Returns a handle with complete() / fail() helpers.
 */
export async function startRun(
  supabase: SupabaseClient,
  processType: string,
  processName?: string,
): Promise<RunHandle> {
  const startedAt = new Date()

  const { data, error } = await supabase
    .from("process_runs")
    .insert({
      process_type: processType,
      process_name: processName ?? processType,
      status: "running",
      started_at: startedAt.toISOString(),
    })
    .select("id")
    .single()

  if (error || !data) {
    // If the table doesn't exist yet, return a no-op handle so the process
    // still works even before the migration is applied.
    console.warn("[process-runs] Could not insert run:", error?.message)
    return noopHandle()
  }

  const runId: string = data.id

  const finish = async (
    status: "completed" | "failed",
    counters?: Partial<RunCounters>,
    errorMessage?: string,
  ) => {
    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    await supabase
      .from("process_runs")
      .update({
        status,
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        rows_processed: counters?.rows_processed ?? 0,
        rows_created: counters?.rows_created ?? 0,
        rows_updated: counters?.rows_updated ?? 0,
        rows_failed: counters?.rows_failed ?? 0,
        log_json: counters?.log_json ?? {},
        ...(errorMessage ? { error_message: errorMessage.slice(0, 2000) } : {}),
      })
      .eq("id", runId)
  }

  return {
    id: runId,
    complete: (counters) => finish("completed", counters),
    fail: (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      return finish("failed", undefined, msg)
    },
  }
}

/** No-op handle for graceful degradation when table doesn't exist yet */
function noopHandle(): RunHandle {
  return {
    id: "noop",
    complete: async () => {},
    fail: async () => {},
  }
}
