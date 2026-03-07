/**
 * Pricing Engine — desacoplado de todas las integraciones.
 * Recibe los datos del producto y la configuración de la lista
 * y devuelve un cálculo completo auditabl en calculation_json.
 */

export type PricingBase = "cost" | "pvp" | "hybrid"

export interface PriceListConfig {
  id: string
  name: string
  pricing_base: PricingBase
  /** Moneda destino del precio final (ej: "ARS", "USD") */
  currency: string
  /**
   * Moneda origen del cálculo — viene de warehouse.base_currency.
   * Si es igual a `currency` no se aplica conversión.
   * Si difiere, el engine usará `resolved_fx_rate` (precalculado por el caller).
   */
  from_currency?: string | null
  /**
   * Tasa FX ya resuelta por el caller (desde exchange_rates o manual).
   * Tiene prioridad sobre rules.fx_rate cuando from_currency != currency.
   */
  resolved_fx_rate?: number | null
  rules: {
    fx_rate: number
    fx_markup_pct: number
    margin_target_pct: number
    margin_min_pct: number
    rounding_rule: string
    includes_tax: boolean
    default_import_shipping_cost: number
    use_best_supplier: boolean
    pvp_discount_pct: number
  } | null
  fee_rules: {
    min_price: number | null
    max_price: number | null
    commission_pct: number
    fixed_fee: number
    free_shipping_threshold: number | null
    shipping_cost_above_threshold: number
    shipping_cost_below_threshold: number
    absorb_shipping_mode: "none" | "partial" | "full"
  }[]
}

export interface ProductInput {
  product_id: string
  supplier_cost: number | null
  import_shipping_cost: number
  pvp_editorial: number | null
}

export interface PriceCalculation {
  product_id: string
  price_list_id: string
  pricing_base_used: PricingBase | null
  // Inputs
  supplier_cost: number | null
  import_shipping_cost: number
  total_cost: number | null
  pvp_editorial: number | null
  // FX
  fx_rate: number
  fx_markup_pct: number
  cost_converted: number | null
  // Fees (resolved for the calculated price)
  commission_pct: number
  commission_amount: number | null
  fixed_fee: number
  fixed_fee_amount: number
  shipping_cost_amount: number
  // Results
  price_cost: number | null      // result from cost path
  price_pvp: number | null       // result from pvp path
  calculated_price: number | null
  calculated_margin: number | null
  // Flags
  warnings: string[]
  margin_below_min: boolean
}

// ── Rounding ──────────────────────────────────────────────────────────────

function applyRounding(price: number, rule: string): number {
  if (!rule || rule === "none") return price
  if (rule === "ceil_10")  return Math.ceil(price / 10)  * 10
  if (rule === "ceil_100") return Math.ceil(price / 100) * 100
  if (rule === "round_99") return Math.floor(price / 10) * 10 + 9
  return price
}

// ── Fee rule lookup for a given price ────────────────────────────────────

function resolveFeeRule(feeRules: PriceListConfig["fee_rules"], price: number) {
  const match = feeRules.find(r => {
    const aboveMin = r.min_price == null || price >= r.min_price
    const belowMax = r.max_price == null || price <= r.max_price
    return aboveMin && belowMax
  })
  return match ?? {
    commission_pct: 0, fixed_fee: 0,
    free_shipping_threshold: null,
    shipping_cost_above_threshold: 0,
    shipping_cost_below_threshold: 0,
    absorb_shipping_mode: "none" as const,
  }
}

// ── Calculate price from cost ─────────────────────────────────────────────

function calcFromCost(
  costConverted: number,
  feeRules: PriceListConfig["fee_rules"],
  marginTargetPct: number,
  roundingRule: string,
  absorbMode: string = "none"
): { price: number; fee: ReturnType<typeof resolveFeeRule> } {
  // Iterate to find price that covers cost + fees + margin
  // price = (cost + fixed_fee + shipping) / (1 - commission_pct/100 - margin_target_pct/100)
  let price = costConverted * (1 + marginTargetPct / 100) // initial estimate
  for (let i = 0; i < 5; i++) {
    const fee      = resolveFeeRule(feeRules, price)
    const shipping = absorbMode === "none"
      ? 0
      : fee.free_shipping_threshold != null && price >= fee.free_shipping_threshold
        ? fee.shipping_cost_above_threshold
        : fee.shipping_cost_below_threshold
    const divisor  = 1 - fee.commission_pct / 100 - marginTargetPct / 100
    if (divisor <= 0) break
    price = (costConverted + fee.fixed_fee + (absorbMode !== "none" ? shipping : 0)) / divisor
    price = applyRounding(price, roundingRule)
  }
  return { price, fee: resolveFeeRule(feeRules, price) }
}

// ── Main calculate ────────────────────────────────────────────────────────

export function calculatePrice(
  list: PriceListConfig,
  product: ProductInput
): PriceCalculation {
  const rules     = list.rules
  const feeRules  = list.fee_rules ?? []
  const warnings: string[] = []

  // FX resolution priority:
  // 1. list.resolved_fx_rate — auto-resolved from exchange_rates by the caller
  //    using warehouse.base_currency → price_lists.currency pair
  // 2. rules.fx_rate — manual override stored in price_list_rules
  // 3. 1 (no conversion — same currency)
  const sameCurrency = !list.from_currency || list.from_currency === list.currency
  const fxRate       = sameCurrency
    ? 1
    : (list.resolved_fx_rate ?? rules?.fx_rate ?? 1)
  const fxMarkupPct  = rules?.fx_markup_pct ?? 0
  const marginTarget = rules?.margin_target_pct ?? 30
  const marginMin    = rules?.margin_min_pct    ?? 10
  const roundingRule = rules?.rounding_rule     ?? "none"
  const pvpDiscount  = rules?.pvp_discount_pct  ?? 0

  // Warnings
  if (!product.supplier_cost) warnings.push("sin_costo_proveedor")
  if (!product.pvp_editorial) warnings.push("sin_pvp_editorial")
  if (feeRules.length === 0)  warnings.push("sin_fee_rules")

  const totalCost    = product.supplier_cost != null
    ? product.supplier_cost + product.import_shipping_cost
    : null

  const costConverted = totalCost != null
    ? totalCost * fxRate * (1 + fxMarkupPct / 100)
    : null

  // ── Cost path ───────────────────────────────────────────────────────────
  let priceCost: number | null = null
  if (costConverted != null) {
    const { price } = calcFromCost(costConverted, feeRules, marginTarget, roundingRule)
    priceCost = price
  }

  // ── PVP path ────────────────────────────────────────────────────────────
  let pricePvp: number | null = null
  if (product.pvp_editorial != null) {
    pricePvp = applyRounding(
      product.pvp_editorial * (1 - pvpDiscount / 100) * fxRate,
      roundingRule
    )
  }

  // ── Resolve pricing base ────────────────────────────────────────────────
  let pricingBaseUsed: PricingBase | null = list.pricing_base as PricingBase

  let finalPrice: number | null = null
  if (list.pricing_base === "cost") {
    finalPrice = priceCost
    if (finalPrice == null) {
      warnings.push("cost_path_unavailable")
      pricingBaseUsed = null
    }
  } else if (list.pricing_base === "pvp") {
    finalPrice = pricePvp
    if (finalPrice == null) {
      warnings.push("pvp_path_unavailable")
      pricingBaseUsed = null
    }
  } else if (list.pricing_base === "hybrid") {
    if (priceCost != null && pricePvp != null) {
      finalPrice      = Math.min(priceCost, pricePvp)
      pricingBaseUsed = finalPrice === priceCost ? "cost" : "pvp"
    } else if (priceCost != null) {
      finalPrice      = priceCost
      pricingBaseUsed = "cost"
      if (!product.pvp_editorial) warnings.push("hybrid_fell_to_cost")
    } else if (pricePvp != null) {
      finalPrice      = pricePvp
      pricingBaseUsed = "pvp"
      warnings.push("hybrid_fell_to_pvp")
    } else {
      warnings.push("hybrid_no_path_available")
      pricingBaseUsed = null
    }
  }

  // ── Margin ──────────────────────────────────────────────────────────────
  let calculatedMargin: number | null = null
  let commissionAmount: number | null = null
  let fixedFeeAmount                  = 0
  let shippingCostAmount              = 0
  let commissionPct                   = 0
  let fixedFee                        = 0

  if (finalPrice != null && costConverted != null) {
    const fee      = resolveFeeRule(feeRules, finalPrice)
    commissionPct  = fee.commission_pct
    fixedFee       = fee.fixed_fee
    commissionAmount = finalPrice * fee.commission_pct / 100
    fixedFeeAmount   = fee.fixed_fee
    shippingCostAmount = fee.absorb_shipping_mode !== "none"
      ? (fee.free_shipping_threshold != null && finalPrice >= fee.free_shipping_threshold
          ? fee.shipping_cost_above_threshold
          : fee.shipping_cost_below_threshold)
      : 0
    const netRevenue   = finalPrice - (commissionAmount ?? 0) - fixedFeeAmount - shippingCostAmount
    calculatedMargin   = ((netRevenue - costConverted) / finalPrice) * 100
  }

  const marginBelowMin = calculatedMargin != null && calculatedMargin < marginMin

  return {
    product_id:          product.product_id,
    price_list_id:       list.id,
    pricing_base_used:   pricingBaseUsed,
    supplier_cost:       product.supplier_cost,
    import_shipping_cost: product.import_shipping_cost,
    total_cost:          totalCost,
    pvp_editorial:       product.pvp_editorial,
    fx_rate:             fxRate,
    fx_markup_pct:       fxMarkupPct,
    cost_converted:      costConverted,
    commission_pct:      commissionPct,
    commission_amount:   commissionAmount,
    fixed_fee:           fixedFee,
    fixed_fee_amount:    fixedFeeAmount,
    shipping_cost_amount: shippingCostAmount,
    price_cost:          priceCost,
    price_pvp:           pricePvp,
    calculated_price:    finalPrice,
    calculated_margin:   calculatedMargin,
    warnings,
    margin_below_min:    marginBelowMin,
  }
}
