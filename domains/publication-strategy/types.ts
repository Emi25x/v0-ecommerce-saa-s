/**
 * Publication Strategy Engine — Domain Types.
 *
 * Defines the business rules and decision output for controlling
 * which products are eligible for marketplace publishing.
 */

// ── Strategy Configuration ──────────────────────────────────────────────────

export interface PublicationStrategy {
  id?: string
  store_id: string
  min_margin_percent: number
  min_stock_total: number
  allow_long_tail: boolean
  long_tail_min_stock: number
  prioritize_dual_supplier: boolean
  max_price_deviation_percent: number
  excluded_publishers?: string[]
  preferred_publishers?: string[]
  excluded_categories?: string[]
}

/** Default strategy used when no store-specific strategy exists. */
export const DEFAULT_STRATEGY: Omit<PublicationStrategy, "store_id"> = {
  min_margin_percent: 15,
  min_stock_total: 1,
  allow_long_tail: true,
  long_tail_min_stock: 1,
  prioritize_dual_supplier: true,
  max_price_deviation_percent: 30,
}

// ── Eligibility Input ───────────────────────────────────────────────────────

export interface EligibilityInput {
  product: {
    id: string
    ean?: string | null
    title?: string | null
    publisher?: string | null
    category?: string | null
  }
  warehouseStock: Record<string, number>
  priceResult: {
    price: number | null
    cost: number | null
    fees: number
  }
  supplierSources: string[]
  strategy: PublicationStrategy
  /** Optional pre-computed supplier confidence score (0–1). */
  supplierConfidence?: number | null
}

// ── Eligibility Output ──────────────────────────────────────────────────────

export interface EligibilityResult {
  eligible: boolean
  reason?: string
  priority_score?: number
  channels: {
    ml: boolean
    shopify: boolean
  }
}
