/**
 * Publication Strategy Engine — Eligibility Service.
 *
 * Pure function: no DB access, no side effects.
 * Takes product data + strategy config → returns eligibility decision.
 */

import type { EligibilityInput, EligibilityResult } from "./types"

/**
 * Resolve whether a product is eligible for publication on each channel.
 *
 * Rules applied in order:
 *  1. Stock must be >= min_stock_total (or long_tail_min_stock if long tail enabled)
 *  2. Margin must be >= min_margin_percent
 *  3. Publisher must not be in excluded_publishers
 *  4. Category must not be in excluded_categories
 *  5. Priority score boosted by dual-supplier, preferred publisher, high stock
 */
export function resolvePublicationEligibility(
  input: EligibilityInput,
): EligibilityResult {
  const { product, warehouseStock, priceResult, supplierSources, strategy } = input

  const stockTotal = Object.values(warehouseStock).reduce((sum, v) => sum + (v || 0), 0)

  // ── Rule 1: Stock check ─────────────────────────────────────────────────
  const minRequired = strategy.allow_long_tail
    ? strategy.long_tail_min_stock
    : strategy.min_stock_total

  if (stockTotal < minRequired) {
    return ineligible(`stock_below_minimum: ${stockTotal} < ${minRequired}`)
  }

  // ── Rule 2: Margin check ────────────────────────────────────────────────
  const price = priceResult.price
  const cost = priceResult.cost
  const fees = priceResult.fees || 0

  if (price == null || cost == null || cost <= 0) {
    return ineligible("missing_price_or_cost")
  }

  const margin = ((price - cost - fees) / price) * 100

  if (margin < strategy.min_margin_percent) {
    return ineligible(`margin_below_minimum: ${margin.toFixed(1)}% < ${strategy.min_margin_percent}%`)
  }

  // ── Rule 3: Excluded publisher ──────────────────────────────────────────
  if (
    product.publisher &&
    strategy.excluded_publishers?.length &&
    strategy.excluded_publishers.some(
      (ep) => ep.toLowerCase() === product.publisher!.toLowerCase(),
    )
  ) {
    return ineligible(`publisher_excluded: ${product.publisher}`)
  }

  // ── Rule 4: Excluded category ──────────────────────────────────────────
  if (
    product.category &&
    strategy.excluded_categories?.length &&
    strategy.excluded_categories.some(
      (ec) => ec.toLowerCase() === product.category!.toLowerCase(),
    )
  ) {
    return ineligible(`category_excluded: ${product.category}`)
  }

  // ── Priority score ─────────────────────────────────────────────────────
  let priority = 1.0

  // Dual-supplier boost
  if (strategy.prioritize_dual_supplier && supplierSources.length >= 2) {
    priority += 0.3
  }

  // Preferred publisher boost
  if (
    product.publisher &&
    strategy.preferred_publishers?.length &&
    strategy.preferred_publishers.some(
      (pp) => pp.toLowerCase() === product.publisher!.toLowerCase(),
    )
  ) {
    priority += 0.2
  }

  // High stock boost
  if (stockTotal >= 10) {
    priority += 0.2
  }

  // High margin boost
  if (margin >= 30) {
    priority += 0.1
  }

  // Supplier confidence boost (from Supplier Reliability module)
  if (input.supplierConfidence != null && input.supplierConfidence > 0.7) {
    priority += 0.15
  }

  return {
    eligible: true,
    priority_score: Math.round(priority * 100) / 100,
    channels: {
      ml: true,
      shopify: true,
    },
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ineligible(reason: string): EligibilityResult {
  return {
    eligible: false,
    reason,
    priority_score: 0,
    channels: { ml: false, shopify: false },
  }
}
