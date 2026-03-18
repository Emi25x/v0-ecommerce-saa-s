import { createAdminClient } from "@/lib/db/admin"

export interface CalculatePrioritiesResult {
  ok: boolean
  processed: number
  total: number
  error?: string
}

/**
 * Calculates ML publish priority scores for all products.
 * Extracted from /api/ml/priorities/calculate to allow direct invocation without self-fetch.
 */
export async function calculateMlPriorities(opts?: {
  ml_account_id?: string | null
}): Promise<CalculatePrioritiesResult> {
  const supabase = createAdminClient()
  const mlAccountId = opts?.ml_account_id ?? null

  // 1. Load all products with their identifiers and cost price
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, title, sku, isbn, ean, author, stock, cost_price, price")
    .order("created_at", { ascending: false })
    .limit(5000)

  if (prodErr) throw prodErr
  if (!products?.length) return { ok: true, processed: 0, total: 0 }

  // 2. Load all ML publications
  const { data: pubs } = await supabase
    .from("ml_publications")
    .select("id, product_id, account_id, status, price, current_stock, ml_item_id")

  const pubsByProduct = new Map<string, typeof pubs>()
  for (const p of pubs ?? []) {
    if (!pubsByProduct.has(p.product_id)) pubsByProduct.set(p.product_id, [])
    pubsByProduct.get(p.product_id)!.push(p)
  }

  // 3. Load radar opportunities for boost
  const { data: opportunities } = await supabase
    .from("editorial_radar_opportunities")
    .select("matched_product_id, score, opportunity_type, status")
    .not("matched_product_id", "is", null)
    .neq("status", "rejected")

  const radarByProduct = new Map<string, number>()
  for (const o of opportunities ?? []) {
    if (!o.matched_product_id) continue
    const prev = radarByProduct.get(o.matched_product_id) ?? 0
    radarByProduct.set(o.matched_product_id, Math.max(prev, Number(o.score ?? 50)))
  }

  // 4. Calculate score for each product
  const upsertRows: any[] = []

  for (const product of products) {
    const productPubs = pubsByProduct.get(product.id) ?? []
    const activePubs  = productPubs.filter(p => p.status === "active")
    const pausedPubs  = productPubs.filter(p => ["paused", "closed"].includes(p.status ?? ""))
    const mlFiltered  = mlAccountId
      ? activePubs.filter(p => p.account_id === mlAccountId)
      : activePubs

    // ── Demand score (0-30)
    const competitorListings = mlFiltered.length
    let scoreDemand = 0
    if (competitorListings === 0)  scoreDemand = 20
    else if (competitorListings <= 3) scoreDemand = 28
    else if (competitorListings <= 8) scoreDemand = 22
    else scoreDemand = 12

    // ── Competition score (0-20)
    let scoreCompetition = 0
    if (competitorListings === 0)      scoreCompetition = 20
    else if (competitorListings <= 2)  scoreCompetition = 16
    else if (competitorListings <= 5)  scoreCompetition = 10
    else if (competitorListings <= 10) scoreCompetition = 6
    else scoreCompetition = 2

    // ── Stock score (0-25)
    const stockTotal = product.stock ?? 0
    let scoreStock = 0
    if (stockTotal >= 10)     scoreStock = 25
    else if (stockTotal >= 5) scoreStock = 18
    else if (stockTotal >= 1) scoreStock = 10
    else scoreStock = 0

    // ── Profitability score (0-15)
    const cost  = Number(product.cost_price ?? 0)
    const price = Number(product.price ?? 0)
    let scoreProfitability = 0
    if (cost > 0 && price > 0) {
      const margin = (price - cost) / price
      if (margin >= 0.40)      scoreProfitability = 15
      else if (margin >= 0.25) scoreProfitability = 10
      else if (margin >= 0.10) scoreProfitability = 6
      else scoreProfitability = 2
    } else if (price > 0) {
      scoreProfitability = 7
    }

    // ── Radar boost (0-10)
    const radarScore   = radarByProduct.get(product.id) ?? 0
    const scoreRadar   = radarScore > 0 ? Math.min(10, Math.round(radarScore / 10)) : 0

    // ── Total
    const total = scoreDemand + scoreCompetition + scoreStock + scoreProfitability + scoreRadar

    // ── Priority level
    let priorityLevel: string
    if (total >= 80)      priorityLevel = "critical"
    else if (total >= 60) priorityLevel = "high"
    else if (total >= 35) priorityLevel = "medium"
    else priorityLevel = "low"

    // ── Recommended action
    let action: string
    const hasActive   = activePubs.length > 0
    const hasInactive = pausedPubs.length > 0

    if (stockTotal === 0) {
      action = "comprar_stock"
    } else if (hasActive) {
      action = total >= 60 ? "mejorar_publicacion" : "no_priorizar"
    } else if (hasInactive) {
      action = "reactivar_publicacion"
    } else if (total >= 35) {
      action = "crear_publicacion"
    } else {
      action = "no_priorizar"
    }

    // ── Reason summary
    const reasons: string[] = []
    if (radarScore > 0)           reasons.push(`radar editorial (${radarScore}pts)`)
    if (stockTotal === 0)          reasons.push("sin stock")
    else if (stockTotal < 5)       reasons.push("stock bajo")
    if (competitorListings === 0)  reasons.push("sin competencia")
    else if (competitorListings > 10) reasons.push("alta competencia")
    if (hasInactive)               reasons.push("publicación inactiva existente")
    if (scoreProfitability >= 12)  reasons.push("margen alto")

    upsertRows.push({
      product_id:             product.id,
      ml_account_id:          mlAccountId,
      publish_priority_score: total,
      priority_level:         priorityLevel,
      recommended_action:     action,
      reason_summary:         reasons.join(" · ") || null,
      score_demand:           scoreDemand,
      score_competition:      scoreCompetition,
      score_stock:            scoreStock,
      score_profitability:    scoreProfitability,
      score_radar_boost:      scoreRadar,
      has_inactive_listing:   hasInactive,
      active_listings_count:  activePubs.length,
      stock_total:            stockTotal,
      updated_at:             new Date().toISOString(),
    })
  }

  // 5. Upsert in batches of 200
  const BATCH = 200
  let upserted = 0
  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const batch = upsertRows.slice(i, i + BATCH)
    const { error } = await supabase
      .from("ml_publish_priorities")
      .upsert(batch, { onConflict: "product_id,ml_account_id" })
    if (error) throw error
    upserted += batch.length
  }

  return {
    ok:        true,
    processed: upserted,
    total:     products.length,
  }
}
