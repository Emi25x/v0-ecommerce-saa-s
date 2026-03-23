/**
 * Supplier Reliability — Batch Computation.
 *
 * Nightly job: compute metrics for all products and upsert into supplier_metrics.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createStructuredLogger } from "@/lib/logger"
import { startRun } from "@/lib/process-runs"
import { computeSupplierMetrics } from "./compute"
import type { ProductStockInput } from "./types"

const BATCH_SIZE = 500

/**
 * Compute supplier metrics for all products and persist to DB.
 * Designed to be called from a cron job.
 * Instrumented with process_runs for audit trail.
 */
export async function computeSupplierMetricsForAllProducts(
  supabase: SupabaseClient,
): Promise<{ processed: number; upserted: number; errors: number }> {
  const log = createStructuredLogger({})
  const run = await startRun(supabase, "supplier_metrics", "Supplier Metrics Batch")

  let processed = 0
  let upserted = 0
  let errors = 0
  let offset = 0

  try {
    log.info("Starting supplier metrics computation", "supplier.metrics.batch_start")

    while (true) {
      const { data: products, error } = await supabase
        .from("products")
        .select("id, ean, stock_by_source")
        .not("ean", "is", null)
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) {
        log.error("Failed to fetch products batch", error, "supplier.metrics.fetch_error", { offset })
        errors++
        break
      }

      if (!products || products.length === 0) break

      const rows = products.map((p: ProductStockInput) => {
        const metrics = computeSupplierMetrics(p)
        return {
          product_id: metrics.product_id,
          ean: metrics.ean,
          sources_available: metrics.sources_available,
          sources_count: metrics.sources_count,
          stock_total: metrics.stock_total,
          has_arnoia: metrics.has_arnoia,
          has_azeta: metrics.has_azeta,
          has_libral: metrics.has_libral,
          reliability_score: metrics.reliability_score,
          volatility_score: metrics.volatility_score,
          confidence_score: metrics.confidence_score,
          calculated_at: new Date().toISOString(),
        }
      })

      const { error: upsertError } = await supabase
        .from("supplier_metrics")
        .upsert(rows, { onConflict: "product_id" })

      if (upsertError) {
        log.error("Failed to upsert supplier metrics batch", upsertError, "supplier.metrics.upsert_error", {
          offset,
          batch_size: rows.length,
        })
        errors++
      } else {
        upserted += rows.length
      }

      processed += products.length
      offset += BATCH_SIZE

      if (products.length < BATCH_SIZE) break
    }

    log.info("Supplier metrics computation completed", "supplier.metrics.batch_complete", {
      processed,
      upserted,
      errors,
    })

    await run.complete({
      rows_processed: processed,
      rows_updated: upserted,
      rows_failed: errors,
      log_json: { processed, upserted, errors },
    })

    return { processed, upserted, errors }
  } catch (err) {
    await run.fail(err)
    throw err
  }
}
