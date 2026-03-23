import { type NextRequest, NextResponse } from "next/server"

/**
 * POST /api/ml/bulk-publish  (SKELETON — not yet implemented)
 *
 * Server-side bulk publish endpoint that will replace the current client-side
 * loop in ml-publish/page.tsx.  This skeleton documents the contract.
 *
 * ── Request body ──────────────────────────────────────────────────────────
 * {
 *   account_id:    string     — ML account UUID
 *   warehouse_id:  string     — warehouse UUID (mandatory, no legacy fallback)
 *   template_id:   string     — ML template UUID
 *   publish_mode:  "linked" | "catalog" | "traditional"
 *   product_ids?:  string[]   — explicit product selection (optional)
 *   filters?:      {          — alternative: use server-side filters
 *     min_stock?:   number
 *     min_price?:   number
 *     max_price?:   number
 *     language?:    string
 *     brand?:       string
 *     exclude_ibd?: boolean
 *   }
 *   limit?:        number     — max products to process (0 = all)
 * }
 *
 * ── Behaviour (when implemented) ──────────────────────────────────────────
 * 1. Validates account_id, warehouse_id, template_id exist.
 * 2. Resolves product list:
 *    - If product_ids provided → use those.
 *    - Else → query products matching filters + warehouse stock > 0.
 * 3. For each product (server-side, batched with rate-limit handling):
 *    a. resolveProductStockForWarehouse() → warehouse_stock
 *    b. calculatePublishableStock(warehouse_stock, safety_stock) → publishable_stock
 *    c. Skip if publishable_stock <= 0.
 *    d. Build ML item via buildTraditionalItem / buildCatalogItem (no cap).
 *    e. POST to ML API, handle rate limits with exponential backoff.
 *    f. Record in ml_publications + process_runs audit trail.
 * 4. Returns summary: { processed, created, skipped, errors, run_id }.
 *
 * ── Stock formula ─────────────────────────────────────────────────────────
 *   warehouse_stock  = SUM(stock_by_source[key] for key in warehouse.source_keys)
 *   safety_stock     = warehouses.safety_stock
 *   publishable_stock = max(0, warehouse_stock - safety_stock)
 *   available_quantity = publishable_stock   // NO cap
 *
 * ── Key design decisions ──────────────────────────────────────────────────
 * - warehouse_id is MANDATORY. No fallback to products.stock.
 * - No artificial stock caps (the old Math.min(stock, 50) is removed).
 * - Each run is tracked in process_runs for audit.
 * - Rate limiting: 3 concurrent, 1s between batches, exponential backoff on 429.
 * - Distinguishes account + warehouse explicitly — supports multi-store publishing.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      error: "bulk-publish is not yet implemented. Use /api/ml/publish per-product for now.",
      hint: "See this file's JSDoc for the planned contract.",
    },
    { status: 501 },
  )
}
