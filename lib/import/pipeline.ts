/**
 * Generic Import Pipeline
 *
 * 5-phase architecture for large file imports (100K+ rows):
 *   1. Download & Parse (one-time, cached)
 *   2. Stage (bulk INSERT into import_staging)
 *   3. Validate (mark invalid rows)
 *   4. Merge (single SQL: staging → products)
 *   5. Post-process (zero missing, refresh warehouses, cleanup)
 *
 * Reusable for any source: Arnoia, Azeta, Libral, future sources.
 */

import { createAdminClient } from "@/lib/db/admin"
import { startRun } from "@/lib/process-runs"
import { normalizeEan } from "@/domains/inventory/ean-utils"
import { refreshWarehousesForSource } from "@/lib/warehouse/refresh"

export interface PipelineConfig {
  sourceId: string
  sourceName: string
  sourceKey: string
  mode: "stock_only" | "catalog"
  /** Function to download and parse the file. Returns raw rows. */
  fetchRows: () => Promise<RawRow[]>
  /** Map raw row fields to staging columns */
  mapRow: (row: RawRow, lineNumber: number) => StagingRow
  /** Minimum rows expected. If fewer, skip zero step (safety). */
  minRowsForZero?: number
}

export interface RawRow {
  [key: string]: string | undefined
}

export interface StagingRow {
  ean: string | null
  sku: string | null
  title: string | null
  stock: number | null
  price: number | null
  price_ars: number | null
}

export interface PipelineResult {
  success: boolean
  run_id: string
  phases: {
    download: { rows: number; duration_ms: number }
    stage: { inserted: number; duration_ms: number }
    validate: { valid: number; invalid: number; duration_ms: number }
    merge: { updated: number; created: number; skipped: number; duration_ms: number }
    post: { zeroed: number; duration_ms: number }
  }
  total_duration_ms: number
  error?: string
}

const STAGE_CHUNK = 2000 // rows per INSERT batch

export async function runImportPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const admin = createAdminClient()
  const runId = crypto.randomUUID()
  const start = Date.now()
  const run = await startRun(admin, "import_pipeline", `Pipeline: ${config.sourceName}`)

  const result: PipelineResult = {
    success: false,
    run_id: runId,
    phases: {
      download: { rows: 0, duration_ms: 0 },
      stage: { inserted: 0, duration_ms: 0 },
      validate: { valid: 0, invalid: 0, duration_ms: 0 },
      merge: { updated: 0, created: 0, skipped: 0, duration_ms: 0 },
      post: { zeroed: 0, duration_ms: 0 },
    },
    total_duration_ms: 0,
  }

  try {
    // ── Phase 1: Download & Parse ─────────────────────────────────────────
    const t1 = Date.now()
    const rawRows = await config.fetchRows()
    result.phases.download = { rows: rawRows.length, duration_ms: Date.now() - t1 }

    if (rawRows.length === 0) {
      result.error = "No rows downloaded"
      await run.fail("No rows downloaded")
      result.total_duration_ms = Date.now() - start
      return result
    }

    console.log(`[PIPELINE] ${config.sourceName}: Downloaded ${rawRows.length} rows in ${result.phases.download.duration_ms}ms`)

    // ── Phase 2: Stage ────────────────────────────────────────────────────
    const t2 = Date.now()
    let staged = 0

    for (let i = 0; i < rawRows.length; i += STAGE_CHUNK) {
      const chunk = rawRows.slice(i, i + STAGE_CHUNK)
      const rows = chunk.map((raw, idx) => {
        const mapped = config.mapRow(raw, i + idx + 1)
        const ean = normalizeEan(mapped.ean ?? "")
        return {
          run_id: runId,
          source_id: config.sourceId,
          line_number: i + idx + 1,
          ean: ean || null,
          sku: mapped.sku,
          title: mapped.title,
          stock: mapped.stock,
          price: mapped.price,
          price_ars: mapped.price_ars,
          is_valid: true,
          error_message: null,
        }
      })

      const { error } = await admin.from("import_staging").insert(rows)
      if (error) {
        console.error(`[PIPELINE] Stage chunk ${i} error:`, error.message)
      } else {
        staged += rows.length
      }
    }

    result.phases.stage = { inserted: staged, duration_ms: Date.now() - t2 }
    console.log(`[PIPELINE] ${config.sourceName}: Staged ${staged} rows in ${result.phases.stage.duration_ms}ms`)

    // ── Phase 3: Validate ─────────────────────────────────────────────────
    const t3 = Date.now()

    // Mark rows with missing/invalid EAN
    await admin
      .from("import_staging")
      .update({ is_valid: false, error_message: "EAN missing or invalid" })
      .eq("run_id", runId)
      .or("ean.is.null,ean.eq.")

    // Mark rows with EAN length != 13 (if not null)
    try {
      await admin.rpc("validate_staging_eans", { p_run_id: runId })
    } catch {
      // RPC might not exist
    }

    // Count valid/invalid
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

    // Copy rejects for debugging
    if ((invalidCount ?? 0) > 0) {
      try {
        await admin.rpc("copy_staging_rejects", { p_run_id: runId, p_source_id: config.sourceId, p_source_name: config.sourceName })
      } catch {
        // RPC might not exist
      }
    }

    result.phases.validate = {
      valid: validCount ?? 0,
      invalid: invalidCount ?? 0,
      duration_ms: Date.now() - t3,
    }
    console.log(`[PIPELINE] ${config.sourceName}: Validated — ${validCount} valid, ${invalidCount} invalid in ${result.phases.validate.duration_ms}ms`)

    // ── Phase 4: Merge ────────────────────────────────────────────────────
    const t4 = Date.now()

    const { data: mergeResult, error: mergeErr } = await admin.rpc("merge_staging_to_products", {
      p_run_id: runId,
      p_source_key: config.sourceKey,
      p_mode: config.mode,
    })

    if (mergeErr) {
      throw new Error(`Merge failed: ${mergeErr.message}`)
    }

    const merge = mergeResult as { updated: number; created: number; skipped: number } ?? { updated: 0, created: 0, skipped: 0 }
    result.phases.merge = {
      updated: merge.updated ?? 0,
      created: merge.created ?? 0,
      skipped: merge.skipped ?? 0,
      duration_ms: Date.now() - t4,
    }
    console.log(`[PIPELINE] ${config.sourceName}: Merged — ${merge.updated} updated, ${merge.created} created, ${merge.skipped} skipped in ${result.phases.merge.duration_ms}ms`)

    // ── Phase 5: Post-process ─────────────────────────────────────────────
    const t5 = Date.now()
    let zeroed = 0

    // Zero products not in staging (safety: skip if too few rows)
    const minRows = config.minRowsForZero ?? 10
    if ((validCount ?? 0) >= minRows) {
      let zeroData: any = 0
      try {
        const res = await admin.rpc("zero_stock_from_staging", {
          p_run_id: runId,
          p_source_key: config.sourceKey,
        })
        zeroData = res.data
      } catch { /* skip */ }
      const zeroResult = zeroData
      zeroed = typeof zeroData === "number" ? zeroData : 0
    } else {
      console.warn(`[PIPELINE] ${config.sourceName}: Skipping zero step — only ${validCount} valid rows (min: ${minRows})`)
    }

    // Cleanup staging
    try {
      await admin.rpc("cleanup_staging", { p_run_id: runId })
    } catch {
      await admin.from("import_staging").delete().eq("run_id", runId)
    }

    // Refresh warehouse snapshots
    try {
      await refreshWarehousesForSource(config.sourceKey)
    } catch { /* non-critical */ }

    result.phases.post = { zeroed, duration_ms: Date.now() - t5 }
    console.log(`[PIPELINE] ${config.sourceName}: Post-process — ${zeroed} zeroed in ${result.phases.post.duration_ms}ms`)

    // ── Done ──────────────────────────────────────────────────────────────
    result.success = true
    result.total_duration_ms = Date.now() - start

    await run.complete({
      rows_processed: staged,
      rows_updated: merge.updated + merge.created,
      rows_failed: invalidCount ?? 0,
      log_json: result.phases,
    })

    console.log(`[PIPELINE] ${config.sourceName}: COMPLETE in ${(result.total_duration_ms / 1000).toFixed(1)}s`)
    return result
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    result.total_duration_ms = Date.now() - start
    await run.fail(err)

    // Do NOT cleanup staging on error — allows resume or debugging
    // Staging rows will be cleaned up on the next successful run for this source

    console.error(`[PIPELINE] ${config.sourceName}: FAILED — ${result.error}`)
    return result
  }
}
