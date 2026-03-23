/**
 * Supplier Reliability — Domain Types.
 *
 * Per-product supply stability scoring derived from stock_by_source JSONB.
 */

// ── Metrics Output ──────────────────────────────────────────────────────────

export interface SupplierMetrics {
  product_id: string
  ean: string
  sources_available: string[]
  sources_count: number
  stock_total: number
  has_arnoia: boolean
  has_azeta: boolean
  has_libral: boolean
  reliability_score: number
  confidence_score: number
  volatility_score: number
}

// ── Compute Input ───────────────────────────────────────────────────────────

export interface ProductStockInput {
  id: string
  ean: string | null
  stock_by_source: Record<string, number> | null
}
