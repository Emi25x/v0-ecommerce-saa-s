/**
 * Publication Strategy Engine — Integration Helper.
 *
 * High-level function that loads strategy + product data from DB
 * and returns an eligibility decision. This is the main entry point
 * for callers that want a one-call decision.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createStructuredLogger } from "@/lib/logger"
import { resolvePublicationEligibility } from "./service"
import type { PublicationStrategy, EligibilityResult, EligibilityInput } from "./types"
import { DEFAULT_STRATEGY } from "./types"

const log = createStructuredLogger({})

/**
 * Determine if a product should be published on a given channel.
 *
 * 1. Loads strategy for the store
 * 2. Loads product + stock_by_source
 * 3. Loads price (cost + final price) from pricing results
 * 4. Optionally loads supplier confidence from supplier_metrics
 * 5. Returns eligibility decision
 */
export async function shouldPublishProduct(
  supabase: SupabaseClient,
  productId: string,
  storeId: string,
  channel: "ml" | "shopify",
): Promise<EligibilityResult> {
  // ── 1. Load strategy ──────────────────────────────────────────────────
  const { data: strategyRow } = await supabase
    .from("publication_strategies")
    .select("*")
    .eq("store_id", storeId)
    .limit(1)
    .maybeSingle()

  const strategy: PublicationStrategy = strategyRow
    ? { ...strategyRow }
    : { ...DEFAULT_STRATEGY, store_id: storeId }

  // ── 2. Load product ───────────────────────────────────────────────────
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, ean, title, stock_by_source, cost_price, pvp_editorial")
    .eq("id", productId)
    .single()

  if (productError || !product) {
    log.warn("Product not found for eligibility check", "publication.decision", {
      product_id: productId,
      store_id: storeId,
    })
    return { eligible: false, reason: "product_not_found", channels: { ml: false, shopify: false } }
  }

  const stockBySource: Record<string, number> = product.stock_by_source || {}
  const supplierSources = Object.keys(stockBySource).filter((k) => (stockBySource[k] || 0) > 0)
  const stockTotal = Object.values(stockBySource).reduce((sum, v) => sum + (v || 0), 0)

  // ── 3. Load price result ──────────────────────────────────────────────
  const { data: priceRow } = await supabase
    .from("pricing_results")
    .select("calculated_price, total_cost, commission_amount, fixed_fee_amount, shipping_cost_amount")
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle()

  const fees = (priceRow?.commission_amount || 0)
    + (priceRow?.fixed_fee_amount || 0)
    + (priceRow?.shipping_cost_amount || 0)

  const priceResult = {
    price: priceRow?.calculated_price ?? null,
    cost: priceRow?.total_cost ?? product.cost_price ?? null,
    fees,
  }

  // ── 4. Load supplier confidence (optional) ────────────────────────────
  let supplierConfidence: number | null = null
  if (strategy.prioritize_dual_supplier) {
    const { data: metrics } = await supabase
      .from("supplier_metrics")
      .select("confidence_score")
      .eq("product_id", productId)
      .maybeSingle()

    supplierConfidence = metrics?.confidence_score ?? null
  }

  // ── 5. Resolve eligibility ────────────────────────────────────────────
  const input: EligibilityInput = {
    product: {
      id: product.id,
      ean: product.ean,
      title: product.title,
    },
    warehouseStock: stockBySource,
    priceResult,
    supplierSources,
    strategy,
    supplierConfidence,
  }

  const result = resolvePublicationEligibility(input)

  // ── 6. Structured logging ─────────────────────────────────────────────
  log.info("Publication eligibility resolved", "publication.decision", {
    product_id: productId,
    store_id: storeId,
    ean: product.ean,
    channel,
    margin: priceResult.price && priceResult.cost
      ? (((priceResult.price - priceResult.cost - fees) / priceResult.price) * 100).toFixed(1)
      : null,
    stock_total: stockTotal,
    supplier_count: supplierSources.length,
    eligible: result.eligible,
    reason: result.reason,
    priority_score: result.priority_score,
  })

  return result
}
