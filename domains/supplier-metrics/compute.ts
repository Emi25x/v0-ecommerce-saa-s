/**
 * Supplier Reliability — Compute Service.
 *
 * Pure function: takes product stock data → returns supplier metrics.
 * Arnoia + Azeta overlap is the primary reliability signal.
 */

import type { SupplierMetrics, ProductStockInput } from "./types"

/**
 * Compute supplier reliability metrics for a single product.
 *
 * Scoring rules:
 *  - base reliability = log(stock_total + 1)
 *  - arnoia + azeta both available: +0.3 boost
 *  - only 1 supplier: -0.1 penalty
 *  - stock_total >= 10: +0.2 boost
 *
 * Confidence: 0–1 normalized value based on source count and stock depth.
 * Volatility: measures stock spread across sources (coefficient of variation).
 */
export function computeSupplierMetrics(product: ProductStockInput): SupplierMetrics {
  const stockBySource = product.stock_by_source || {}
  const entries = Object.entries(stockBySource)
  const sourcesWithStock = entries.filter(([, qty]) => (qty || 0) > 0)

  const sourcesAvailable = sourcesWithStock.map(([key]) => key)
  const sourcesCount = sourcesAvailable.length
  const stockTotal = entries.reduce((sum, [, qty]) => sum + (qty || 0), 0)

  const hasArnoia = sourcesAvailable.includes("arnoia")
  const hasAzeta = sourcesAvailable.includes("azeta")
  const hasLibral = sourcesAvailable.includes("libral")

  // ── Reliability Score ─────────────────────────────────────────────────
  let reliability = Math.log(stockTotal + 1)

  // Dual-supplier boost (Arnoia + Azeta overlap)
  if (hasArnoia && hasAzeta) {
    reliability += 0.3
  }

  // Single-supplier penalty
  if (sourcesCount === 1) {
    reliability -= 0.1
  }

  // High stock boost
  if (stockTotal >= 10) {
    reliability += 0.2
  }

  // Floor at 0
  reliability = Math.max(0, Math.round(reliability * 100) / 100)

  // ── Confidence Score (0–1) ────────────────────────────────────────────
  // Based on: sources available (max 3), stock depth, dual-supplier
  let confidence = 0

  // Source diversity (0–0.4)
  confidence += Math.min(sourcesCount / 3, 1) * 0.4

  // Stock depth (0–0.3) — log scale, saturates around 50 units
  confidence += Math.min(Math.log(stockTotal + 1) / Math.log(51), 1) * 0.3

  // Dual-supplier bonus (0–0.3)
  if (hasArnoia && hasAzeta) {
    confidence += 0.3
  } else if (sourcesCount >= 2) {
    confidence += 0.15
  }

  confidence = Math.min(1, Math.round(confidence * 100) / 100)

  // ── Volatility Score ──────────────────────────────────────────────────
  // Coefficient of variation of stock across sources (higher = more volatile)
  let volatility = 0
  if (sourcesCount >= 2) {
    const stockValues = sourcesWithStock.map(([, qty]) => qty || 0)
    const mean = stockTotal / sourcesCount
    const variance = stockValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / sourcesCount
    const stdDev = Math.sqrt(variance)
    volatility = mean > 0 ? Math.round((stdDev / mean) * 100) / 100 : 0
  }

  return {
    product_id: product.id,
    ean: product.ean || "",
    sources_available: sourcesAvailable,
    sources_count: sourcesCount,
    stock_total: stockTotal,
    has_arnoia: hasArnoia,
    has_azeta: hasAzeta,
    has_libral: hasLibral,
    reliability_score: reliability,
    confidence_score: confidence,
    volatility_score: volatility,
  }
}
