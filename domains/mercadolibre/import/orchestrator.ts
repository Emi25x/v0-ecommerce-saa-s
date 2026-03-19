/**
 * ML Import Orchestrator
 *
 * Extracts the import tick logic duplicated across:
 *   - app/api/ml/import/run/route.ts
 *   - app/api/ml/import/tick/route.ts
 *   - app/api/cron/ml-import-tick/route.ts
 *   - app/api/cron/ml-import-worker/route.ts
 *
 * Instead of routes calling other routes via HTTP (self-fetch),
 * they now call these functions directly.
 */

import { executeIndexBatch } from "./index-logic"
import { executeWorkerBatch } from "./worker-logic"

export interface TickResult {
  ok: boolean
  reason?: string
  action?: "indexed" | "processed" | "none"
  job_id?: string
  offset_before?: number
  offset_after?: number
  status?: string
  error?: string
  worker_result?: any
  index_result?: any
}

/**
 * Executes a single import tick: runs index or worker depending on job status.
 * Replaces all internal fetch() calls to /api/ml/import/index and /worker.
 */
export async function executeSingleTick(supabase: any): Promise<TickResult> {
  // Find active job
  const { data: activeJob } = await supabase
    .from("ml_import_jobs")
    .select("*, ml_accounts(*)")
    .in("status", ["indexing", "processing"])
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!activeJob) {
    return { ok: false, reason: "no_active_job" }
  }

  const offsetBefore = activeJob.current_offset || 0

  if (activeJob.status === "indexing") {
    const result = await executeIndexBatch(supabase, {
      job_id: activeJob.id,
      account_id: activeJob.account_id,
      offset: offsetBefore,
    })

    // Re-read job for updated offset
    const { data: updatedJob } = await supabase
      .from("ml_import_jobs")
      .select("current_offset, status")
      .eq("id", activeJob.id)
      .single()

    return {
      ok: true,
      action: "indexed",
      job_id: activeJob.id,
      offset_before: offsetBefore,
      offset_after: updatedJob?.current_offset || offsetBefore,
      status: updatedJob?.status || activeJob.status,
      index_result: result,
    }
  }

  if (activeJob.status === "processing") {
    const result = await executeWorkerBatch(supabase, {
      job_id: activeJob.id,
      batch_size: 20,
    })

    // Re-read job for updated status
    const { data: updatedJob } = await supabase
      .from("ml_import_jobs")
      .select("current_offset, status")
      .eq("id", activeJob.id)
      .single()

    return {
      ok: true,
      action: "processed",
      job_id: activeJob.id,
      offset_before: offsetBefore,
      offset_after: updatedJob?.current_offset || offsetBefore,
      status: updatedJob?.status || activeJob.status,
      worker_result: result,
    }
  }

  return { ok: false, reason: "unknown_status", status: activeJob.status }
}

/**
 * Runs multiple ticks in a loop until timeout or max ticks.
 * Replaces the loop in /api/ml/import/run.
 */
export async function executeImportRun(
  supabase: any,
  opts: { maxTicks?: number; maxDurationMs?: number } = {},
): Promise<{ ticksRun: number; elapsed: number; results: TickResult[]; lastResult: TickResult | null }> {
  const { maxTicks = 10, maxDurationMs = 20_000 } = opts
  const startTime = Date.now()
  let ticksRun = 0
  let lastResult: TickResult | null = null
  const results: TickResult[] = []

  while (ticksRun < maxTicks && Date.now() - startTime < maxDurationMs) {
    const result = await executeSingleTick(supabase)

    if (!result.ok) {
      lastResult = result
      break
    }

    ticksRun++
    lastResult = result
    results.push(result)

    if (result.status === "completed") break

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return { ticksRun, elapsed: Date.now() - startTime, results, lastResult }
}
