/**
 * Multi-step Import Pipeline Worker
 *
 * Designed for Vercel's 300s function limit. Each invocation does ONE step:
 *
 *   Step 1: "start"   → Download + Stage + Validate (~35s for 220K rows)
 *   Step 2+: "merge"  → Merge N rows from staging → products (~10-30s per step)
 *   Last:    "finish"  → Zero-out + Refresh warehouse + Cleanup
 *
 * Progress tracked in import_pipeline_state. Resumable: if it crashes,
 * the next invocation picks up from merge_offset.
 *
 * Called by: POST /api/import/pipeline with { action: "tick" } or cron.
 */

import { createAdminClient } from "@/lib/db/admin"
import { normalizeEan } from "@/domains/inventory/ean-utils"
import { fetchAndParseCsv } from "@/lib/import/csv-fetch"
import { refreshWarehousesForSource } from "@/lib/warehouse/refresh"
import { startRun } from "@/lib/process-runs"

const STAGE_CHUNK = 2000
const MERGE_BATCH = 3000 // rows per merge step (~10-20s with index)
const TIME_BUDGET_MS = 250_000 // leave 50s margin before 300s limit

export interface WorkerResult {
  action: "started" | "merging" | "finished" | "error" | "idle"
  run_id?: string
  phase?: string
  progress?: { merged: number; total: number; percent: number }
  duration_ms?: number
  error?: string
}

// ── Start a new import ──────────────────────────────────────────────────────

export async function startPipeline(config: {
  sourceId: string
  sourceName: string
  sourceKey: string
  mode: "stock_only" | "catalog"
  fetchRows: () => Promise<Record<string, string>[]>
  mapRow: (row: Record<string, string>, lineNumber: number) => {
    ean: string | null; sku: string | null; title: string | null
    stock: number | null; price: number | null; price_ars: number | null
  }
}): Promise<WorkerResult> {
  const admin = createAdminClient()
  const runId = crypto.randomUUID()
  const start = Date.now()

  try {
    // Download & parse
    const rawRows = await config.fetchRows()
    if (rawRows.length === 0) {
      return { action: "error", error: "No rows downloaded" }
    }

    // Stage in chunks
    let staged = 0
    for (let i = 0; i < rawRows.length; i += STAGE_CHUNK) {
      const chunk = rawRows.slice(i, i + STAGE_CHUNK)
      const rows = chunk.map((raw, idx) => {
        const mapped = config.mapRow(raw, i + idx + 1)
        return {
          run_id: runId,
          source_id: config.sourceId,
          line_number: i + idx + 1,
          ean: normalizeEan(mapped.ean ?? "") || null,
          sku: mapped.sku,
          title: mapped.title,
          stock: mapped.stock,
          price: mapped.price,
          price_ars: mapped.price_ars,
          is_valid: true,
          error_message: null,
        }
      })
      await admin.from("import_staging").insert(rows)
      staged += rows.length
    }

    // Validate
    await admin
      .from("import_staging")
      .update({ is_valid: false, error_message: "EAN missing" })
      .eq("run_id", runId)
      .or("ean.is.null,ean.eq.")

    try {
      await admin.rpc("validate_staging_eans", { p_run_id: runId })
    } catch { /* skip if RPC not installed */ }

    const { count: validCount } = await admin
      .from("import_staging")
      .select("*", { count: "exact", head: true })
      .eq("run_id", runId)
      .eq("is_valid", true)

    const { count: invalidCount } = await admin
      .from("import_staging")
      .select("*", { count: "exact", head: true })
      .eq("run_id", runId)
      .eq("is_valid", false)

    // Save rejects
    try {
      await admin.rpc("copy_staging_rejects", {
        p_run_id: runId,
        p_source_id: config.sourceId,
        p_source_name: config.sourceName,
      })
    } catch { /* skip */ }

    // Create pipeline state
    await admin.from("import_pipeline_state").insert({
      run_id: runId,
      source_id: config.sourceId,
      source_key: config.sourceKey,
      mode: config.mode,
      phase: "staged",
      total_rows: staged,
      valid_rows: validCount ?? 0,
      invalid_rows: invalidCount ?? 0,
      merge_offset: 0,
      merge_batch_size: MERGE_BATCH,
    })

    return {
      action: "started",
      run_id: runId,
      phase: "staged",
      progress: { merged: 0, total: validCount ?? 0, percent: 0 },
      duration_ms: Date.now() - start,
    }
  } catch (err) {
    return { action: "error", error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Continue merging ────────────────────────────────────────────────────────

export async function tickPipeline(targetRunId?: string): Promise<WorkerResult> {
  const admin = createAdminClient()
  const start = Date.now()

  // Find active pipeline — prefer specific run_id if provided
  let stateQuery = admin
    .from("import_pipeline_state")
    .select("*")
    .in("phase", ["staged", "merging"])
    .order("started_at", { ascending: false })
    .limit(1)

  if (targetRunId) {
    stateQuery = admin
      .from("import_pipeline_state")
      .select("*")
      .eq("run_id", targetRunId)
      .in("phase", ["staged", "merging"])
      .limit(1)
  }

  const { data: state } = await stateQuery.maybeSingle()

  if (!state) {
    return { action: "idle" }
  }

  const runId = state.run_id
  const sourceKey = state.source_key

  try {
    // Transition from staged → merging
    if (state.phase === "staged") {
      await admin
        .from("import_pipeline_state")
        .update({ phase: "merging", updated_at: new Date().toISOString() })
        .eq("id", state.id)
    }

    // Merge in batches until time budget exhausted
    let offset = state.merge_offset
    let totalMerged = state.merged_count
    const batchSize = state.merge_batch_size

    while (Date.now() - start < TIME_BUDGET_MS) {
      // Fetch batch of EANs from staging
      const { data: batch } = await admin
        .from("import_staging")
        .select("ean, stock, price, price_ars")
        .eq("run_id", runId)
        .eq("is_valid", true)
        .not("ean", "is", null)
        .order("ean")
        .range(offset, offset + batchSize - 1)

      if (!batch || batch.length === 0) {
        // All merged — move to finish
        await finishPipeline(admin, state)
        return {
          action: "finished",
          run_id: runId,
          phase: "done",
          progress: { merged: totalMerged, total: state.valid_rows, percent: 100 },
          duration_ms: Date.now() - start,
        }
      }

      // Deduplicate
      const eanMap = new Map<string, any>()
      for (const row of batch) if (row.ean) eanMap.set(row.ean, row)

      const eans = Array.from(eanMap.keys())
      const stocks = eans.map((e) => eanMap.get(e)?.stock ?? 0)
      const prices = eans.map((e) => {
        const p = eanMap.get(e)?.price
        return p && p > 0 ? p : null
      })

      // Call bulk_update_stock_price RPC
      const { data: rpcResult, error: rpcErr } = await admin.rpc("bulk_update_stock_price", {
        p_eans: eans,
        p_stocks: stocks,
        p_prices: prices,
        p_source_key: sourceKey,
      })

      if (rpcErr) {
        console.error(`[PIPELINE-WORKER] Merge batch at ${offset} error:`, rpcErr.message)
      }

      const batchUpdated = typeof rpcResult === "number" ? rpcResult : 0
      totalMerged += batchUpdated
      offset += batch.length

      // Save checkpoint
      await admin
        .from("import_pipeline_state")
        .update({
          merge_offset: offset,
          merged_count: totalMerged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.id)

      console.log(`[PIPELINE-WORKER] Batch ${offset}: ${batchUpdated} updated (total: ${totalMerged})`)
    }

    // Time budget exhausted — save progress and return
    const percent = state.valid_rows > 0 ? Math.round((offset / state.valid_rows) * 100) : 0
    return {
      action: "merging",
      run_id: runId,
      phase: "merging",
      progress: { merged: totalMerged, total: state.valid_rows, percent },
      duration_ms: Date.now() - start,
    }
  } catch (err) {
    await admin
      .from("import_pipeline_state")
      .update({
        phase: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      })
      .eq("id", state.id)

    return { action: "error", run_id: runId, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Finish: zero-out + refresh + cleanup ────────────────────────────────────

async function finishPipeline(admin: any, state: any): Promise<void> {
  const runId = state.run_id

  // Zero-out
  let zeroed = 0
  if (state.valid_rows >= 10) {
    try {
      const { data } = await admin.rpc("zero_stock_from_staging", {
        p_run_id: runId,
        p_source_key: state.source_key,
      })
      zeroed = typeof data === "number" ? data : 0
    } catch { /* skip */ }
  }

  // Cleanup staging (this run + any older runs)
  await admin.from("import_staging").delete().eq("run_id", runId)

  // Refresh warehouse snapshots
  try {
    await refreshWarehousesForSource(state.source_key)
  } catch { /* non-critical */ }

  // Record in process_runs
  try {
    const run = await startRun(admin, "import_pipeline", `Pipeline: ${state.source_key}`)
    await run.complete({
      rows_processed: state.total_rows,
      rows_updated: state.merged_count,
      rows_failed: state.invalid_rows,
      log_json: {
        valid: state.valid_rows,
        merged: state.merged_count,
        zeroed,
        source_key: state.source_key,
      },
    })
  } catch { /* skip */ }

  // Mark done
  await admin
    .from("import_pipeline_state")
    .update({
      phase: "done",
      zeroed_count: zeroed,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id)
}

// ── Get current status ──────────────────────────────────────────────────────

export async function getPipelineStatus(): Promise<any> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("import_pipeline_state")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5)

  return data ?? []
}
