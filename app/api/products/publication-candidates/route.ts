/**
 * GET /api/products/publication-candidates
 *
 * Read-only decision support endpoint. Returns products with publication
 * eligibility decisions from the Publication Strategy Engine.
 *
 * Query params:
 *   store_id  (required) — ML account or Shopify store ID
 *   channel   (optional) — "ml" | "shopify" (default: evaluates both)
 *   limit     (optional) — default 50, max 200
 *   offset    (optional) — default 0
 *   only_eligible (optional) — "true" to filter only eligible products
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"
import { resolvePublicationEligibility } from "@/domains/publication-strategy/service"
import { DEFAULT_STRATEGY } from "@/domains/publication-strategy/types"
import type { PublicationStrategy, EligibilityInput } from "@/domains/publication-strategy/types"
import { createStructuredLogger } from "@/lib/logger"

const PAGE_SIZE_MAX = 200
const PAGE_SIZE_DEFAULT = 50

export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  const log = createStructuredLogger({})
  const { searchParams } = request.nextUrl

  const storeId = searchParams.get("store_id")
  if (!storeId) {
    return NextResponse.json({ error: "store_id is required" }, { status: 400 })
  }

  const channel = (searchParams.get("channel") as "ml" | "shopify" | null) ?? undefined
  const limit = Math.min(parseInt(searchParams.get("limit") ?? String(PAGE_SIZE_DEFAULT), 10), PAGE_SIZE_MAX)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)
  const onlyEligible = searchParams.get("only_eligible") === "true"

  log.info("Publication candidates request", "publication.candidates.request", {
    store_id: storeId,
    channel: channel ?? "all",
    limit,
    offset,
    only_eligible: onlyEligible,
  })

  const supabase = createAdminClient()

  // ── 1. Load strategy for this store ───────────────────────────────────────
  const { data: strategyRow } = await supabase
    .from("publication_strategies")
    .select("*")
    .eq("store_id", storeId)
    .limit(1)
    .maybeSingle()

  const strategy: PublicationStrategy = strategyRow
    ? { ...strategyRow }
    : { ...DEFAULT_STRATEGY, store_id: storeId }

  // ── 2. Count total active products ────────────────────────────────────────
  const { count: totalCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .gt("stock", 0)

  // ── 3. Fetch products page (active = stock > 0) ──────────────────────────
  // Over-fetch when only_eligible to compensate for filtering
  const fetchLimit = onlyEligible ? limit * 4 : limit
  const fetchOffset = onlyEligible ? 0 : offset

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, ean, title, author, stock, stock_by_source, cost_price, pvp_editorial, price, custom_fields")
    .gt("stock", 0)
    .order("stock", { ascending: false })
    .range(fetchOffset, fetchOffset + fetchLimit - 1)

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 })
  }

  if (!products || products.length === 0) {
    return NextResponse.json({
      items: [],
      pagination: { total: 0, limit, offset },
    })
  }

  // ── 4. Batch-load pricing_results for these products ──────────────────────
  const productIds = products.map((p: any) => p.id)

  const priceMap = new Map<string, { calculated_price: number | null; total_cost: number | null; commission_amount: number; fixed_fee_amount: number; shipping_cost_amount: number }>()
  try {
    const { data: priceRows } = await supabase
      .from("pricing_results")
      .select("product_id, calculated_price, total_cost, commission_amount, fixed_fee_amount, shipping_cost_amount")
      .in("product_id", productIds)

    for (const row of (priceRows ?? []) as any[]) {
      priceMap.set(row.product_id, row)
    }
  } catch {
    // pricing_results table might not exist — graceful degradation
  }

  // ── 5. Batch-load supplier_metrics for these products ─────────────────────
  const confidenceMap = new Map<string, number>()
  try {
    const { data: metricRows } = await supabase
      .from("supplier_metrics")
      .select("product_id, confidence_score")
      .in("product_id", productIds)

    for (const row of (metricRows ?? []) as any[]) {
      confidenceMap.set(row.product_id, row.confidence_score)
    }
  } catch {
    // supplier_metrics table might not exist — graceful degradation
  }

  // ── 6. Evaluate eligibility for each product ─────────────────────────────
  interface CandidateItem {
    product_id: string
    ean: string | null
    title: string | null
    publisher: string | null
    warehouse_stock: number
    supplier_sources: Record<string, number>
    margin_percent: number | null
    eligibility: {
      eligible: boolean
      reason: string
      priority_score: number
    }
    supplier_confidence_score: number | null
    suggested_channels: {
      ml: boolean
      shopify: boolean
    }
  }

  const items: CandidateItem[] = []

  for (const product of products as any[]) {
    const stockBySource: Record<string, number> = product.stock_by_source || {}
    const supplierSources = Object.keys(stockBySource).filter((k) => (stockBySource[k] || 0) > 0)
    const stockTotal = Object.values(stockBySource).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)

    // Price data
    const priceRow = priceMap.get(product.id)
    const fees = (priceRow?.commission_amount || 0)
      + (priceRow?.fixed_fee_amount || 0)
      + (priceRow?.shipping_cost_amount || 0)

    const price = priceRow?.calculated_price ?? product.price ?? null
    const cost = priceRow?.total_cost ?? product.cost_price ?? null

    // Margin calculation
    let marginPercent: number | null = null
    if (price != null && cost != null && price > 0) {
      marginPercent = Math.round(((price - cost - fees) / price) * 1000) / 10
    }

    // Supplier confidence
    const supplierConfidence = confidenceMap.get(product.id) ?? null

    // Build eligibility input
    const input: EligibilityInput = {
      product: {
        id: product.id,
        ean: product.ean,
        title: product.title,
        publisher: product.author ?? null,
      },
      warehouseStock: stockBySource,
      priceResult: {
        price,
        cost,
        fees,
      },
      supplierSources,
      strategy,
      supplierConfidence,
    }

    const result = resolvePublicationEligibility(input)

    // Apply channel filter to suggested_channels
    const suggestedChannels = {
      ml: channel === "shopify" ? false : result.channels.ml,
      shopify: channel === "ml" ? false : result.channels.shopify,
    }

    // Filter if only_eligible
    if (onlyEligible && !result.eligible) continue

    items.push({
      product_id: product.id,
      ean: product.ean ?? null,
      title: product.title ?? null,
      publisher: product.author ?? null,
      warehouse_stock: stockTotal,
      supplier_sources: stockBySource,
      margin_percent: marginPercent,
      eligibility: {
        eligible: result.eligible,
        reason: result.reason ?? "eligible",
        priority_score: result.priority_score ?? 0,
      },
      supplier_confidence_score: supplierConfidence,
      suggested_channels: suggestedChannels,
    })
  }

  // ── 7. Sort by priority_score desc, then margin_percent desc ──────────────
  items.sort((a, b) => {
    const pDiff = b.eligibility.priority_score - a.eligibility.priority_score
    if (pDiff !== 0) return pDiff
    return (b.margin_percent ?? -Infinity) - (a.margin_percent ?? -Infinity)
  })

  // ── 8. Apply pagination for only_eligible mode (post-filter) ──────────────
  const paginatedItems = onlyEligible
    ? items.slice(offset, offset + limit)
    : items

  return NextResponse.json({
    items: paginatedItems,
    pagination: {
      total: onlyEligible ? items.length : (totalCount ?? 0),
      limit,
      offset,
    },
  })
}
