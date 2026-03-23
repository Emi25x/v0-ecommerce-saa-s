/**
 * GET /api/products/publication-summary
 *
 * Lightweight aggregation endpoint. Computes publication strategy stats
 * without loading the full product list into the response.
 *
 * Query params:
 *   store_id (required)
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"
import { resolvePublicationEligibility } from "@/domains/publication-strategy/service"
import { DEFAULT_STRATEGY } from "@/domains/publication-strategy/types"
import type { PublicationStrategy, EligibilityInput } from "@/domains/publication-strategy/types"
import { createStructuredLogger } from "@/lib/logger"

const BATCH = 500

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  const log = createStructuredLogger({})
  const storeId = request.nextUrl.searchParams.get("store_id")

  if (!storeId) {
    return NextResponse.json({ error: "store_id is required" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Load strategy
  const { data: strategyRow } = await supabase
    .from("publication_strategies")
    .select("*")
    .eq("store_id", storeId)
    .limit(1)
    .maybeSingle()

  const strategy: PublicationStrategy = strategyRow
    ? { ...strategyRow }
    : { ...DEFAULT_STRATEGY, store_id: storeId }

  // Aggregate in batches to avoid loading everything at once
  let totalProducts = 0
  let eligibleProducts = 0
  let blockedLowMargin = 0
  let blockedLowStock = 0
  let dualSupplierProducts = 0
  let marginSum = 0
  let marginCount = 0
  let offset = 0

  while (true) {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, ean, title, author, stock_by_source, cost_price, price")
      .gt("stock", 0)
      .range(offset, offset + BATCH - 1)

    if (error || !products || products.length === 0) break

    // Batch-load pricing
    const ids = products.map((p: any) => p.id)
    const priceMap = new Map<string, any>()
    try {
      const { data: priceRows } = await supabase
        .from("pricing_results")
        .select("product_id, calculated_price, total_cost, commission_amount, fixed_fee_amount, shipping_cost_amount")
        .in("product_id", ids)
      for (const r of (priceRows ?? []) as any[]) priceMap.set(r.product_id, r)
    } catch { /* table may not exist */ }

    // Batch-load confidence
    const confMap = new Map<string, number>()
    try {
      const { data: metricRows } = await supabase
        .from("supplier_metrics")
        .select("product_id, confidence_score")
        .in("product_id", ids)
      for (const r of (metricRows ?? []) as any[]) confMap.set(r.product_id, r.confidence_score)
    } catch { /* table may not exist */ }

    for (const product of products as any[]) {
      totalProducts++

      const sbs: Record<string, number> = product.stock_by_source || {}
      const supplierSources = Object.keys(sbs).filter((k) => (sbs[k] || 0) > 0)

      if (supplierSources.length >= 2) dualSupplierProducts++

      const pr = priceMap.get(product.id)
      const fees = (pr?.commission_amount || 0) + (pr?.fixed_fee_amount || 0) + (pr?.shipping_cost_amount || 0)
      const price = pr?.calculated_price ?? product.price ?? null
      const cost = pr?.total_cost ?? product.cost_price ?? null

      const input: EligibilityInput = {
        product: { id: product.id, ean: product.ean, title: product.title, publisher: product.author },
        warehouseStock: sbs,
        priceResult: { price, cost, fees },
        supplierSources,
        strategy,
        supplierConfidence: confMap.get(product.id) ?? null,
      }

      const result = resolvePublicationEligibility(input)

      if (result.eligible) {
        eligibleProducts++
        if (price != null && cost != null && price > 0) {
          const margin = ((price - cost - fees) / price) * 100
          marginSum += margin
          marginCount++
        }
      } else {
        const reason = result.reason ?? ""
        if (reason.startsWith("margin_below_minimum")) blockedLowMargin++
        else if (reason.startsWith("stock_below_minimum")) blockedLowStock++
      }
    }

    offset += BATCH
    if (products.length < BATCH) break
  }

  log.info("Publication summary computed", "publication.summary", {
    store_id: storeId,
    total_products: totalProducts,
    eligible_products: eligibleProducts,
  })

  return NextResponse.json({
    total_products: totalProducts,
    eligible_products: eligibleProducts,
    blocked_low_margin: blockedLowMargin,
    blocked_low_stock: blockedLowStock,
    dual_supplier_products: dualSupplierProducts,
    avg_margin_eligible: marginCount > 0 ? Math.round((marginSum / marginCount) * 10) / 10 : null,
  })
}
