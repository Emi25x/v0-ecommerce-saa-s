/**
 * Pricing Engine v2 — desacoplado de todas las integraciones.
 *
 * Nuevas capacidades respecto a v1:
 *  - FX por par warehouse → list currency (warehouse.base_currency + rate table)
 *  - extra_cost_amount / extra_cost_currency por regla de fee
 *  - Bloque ML: commission_pct, free_shipping_strategy, costo_envio_full
 *  - free_shipping_strategy: "always_free" | "include_in_price" | "buyer_pays"
 *  - Auditoría completa en el breakdown
 */

export type PricingBase = "cost" | "pvp" | "hybrid"
export type FreeShippingStrategy = "always_free" | "include_in_price" | "buyer_pays"
export type AbsorbShippingMode   = "none" | "partial" | "full"

// ── Config types ──────────────────────────────────────────────────────────

export interface MLRuleConfig {
  channel:                 string       // "mercadolibre"
  ml_fee_pct:              number       // comisión ML (e.g. 11.5)
  ml_fixed_fee:            number       // cargo fijo ML (e.g. 0 o 50)
  free_shipping_strategy:  FreeShippingStrategy
  shipping_cost_full:      number       // costo real si se absorbe envío Full
  shipping_cost_classic:   number       // costo si el vendedor paga envío clásico
}

export interface FeeRuleConfig {
  min_price:                    number | null
  max_price:                    number | null
  commission_pct:               number
  fixed_fee:                    number
  free_shipping_threshold:      number | null
  shipping_cost_above_threshold: number
  shipping_cost_below_threshold: number
  absorb_shipping_mode:         AbsorbShippingMode
  // v2 extras
  extra_cost_amount:            number | null
  extra_cost_currency:          string | null
  extra_cost_label:             string | null
}

export interface PriceListConfig {
  id:            string
  name:          string
  pricing_base:  PricingBase
  currency:      string
  warehouse_id:  string | null
  rules: {
    fx_rate:                       number
    fx_markup_pct:                 number
    margin_target_pct:             number
    margin_min_pct:                number
    rounding_rule:                 string
    includes_tax:                  boolean
    default_import_shipping_cost:  number
    use_best_supplier:             boolean
    pvp_discount_pct:              number
  } | null
  fee_rules:  FeeRuleConfig[]
  ml_rules:   MLRuleConfig | null     // null si no es canal ML
}

export interface ProductInput {
  product_id:            string
  supplier_cost:         number | null
  import_shipping_cost:  number
  pvp_editorial:         number | null
  // v2: cost currency (warehouse base currency)
  cost_currency:         string | null
}

// ── Calculation output ────────────────────────────────────────────────────

export interface PriceCalculation {
  product_id:        string
  price_list_id:     string
  pricing_base_used: PricingBase | null
  // Inputs
  supplier_cost:         number | null
  import_shipping_cost:  number
  total_cost:            number | null
  pvp_editorial:         number | null
  // FX
  fx_rate:         number
  fx_markup_pct:   number
  cost_converted:  number | null
  // Fee rule resolved
  commission_pct:       number
  commission_amount:    number | null
  fixed_fee:            number
  fixed_fee_amount:     number
  shipping_cost_amount: number
  extra_cost_amount:    number    // v2
  extra_cost_label:     string | null
  // ML fees (v2)
  ml_fee_pct:                 number
  ml_fee_amount:              number | null
  ml_fixed_fee:               number
  ml_shipping_cost:           number
  free_shipping_strategy:     FreeShippingStrategy | null
  // Results
  price_cost:       number | null
  price_pvp:        number | null
  calculated_price: number | null
  calculated_margin: number | null
  // Flags
  warnings:         string[]
  margin_below_min: boolean
  // Full audit breakdown (ordered steps for UI display)
  breakdown: BreakdownStep[]
}

export interface BreakdownStep {
  label: string
  value: number | null
  currency?: string
  note?:  string
  type:   "input" | "cost" | "fee" | "margin" | "result" | "warning"
}

// ── Helpers ───────────────────────────────────────────────────────────────

function applyRounding(price: number, rule: string): number {
  if (!rule || rule === "none") return price
  if (rule === "ceil_10")  return Math.ceil(price / 10)  * 10
  if (rule === "ceil_100") return Math.ceil(price / 100) * 100
  if (rule === "round_99") return Math.floor(price / 10) * 10 + 9
  return price
}

function resolveFeeRule(feeRules: FeeRuleConfig[], price: number): FeeRuleConfig {
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
    absorb_shipping_mode: "none",
    extra_cost_amount: null,
    extra_cost_currency: null,
    extra_cost_label: null,
  }
}

/**
 * Resuelve el costo de envío a absorber para una regla dada.
 * Con ml_rules presente, la estrategia dicta si se absorbe o no.
 */
function resolveShippingCost(
  fee:        FeeRuleConfig,
  price:      number,
  mlRules:    MLRuleConfig | null
): number {
  if (mlRules) {
    switch (mlRules.free_shipping_strategy) {
      case "always_free":      return mlRules.shipping_cost_full
      case "include_in_price": return mlRules.shipping_cost_full
      case "buyer_pays":       return 0
    }
  }
  if (fee.absorb_shipping_mode === "none") return 0
  return fee.free_shipping_threshold != null && price >= fee.free_shipping_threshold
    ? fee.shipping_cost_above_threshold
    : fee.shipping_cost_below_threshold
}

/**
 * Calcula el precio desde costo usando iteración para cubrir fees + margen.
 * precio = (costo + cargos_fijos) / (1 - pct_variables - margen)
 */
function calcFromCost(
  costConverted: number,
  feeRules:      FeeRuleConfig[],
  mlRules:       MLRuleConfig | null,
  marginTarget:  number,
  roundingRule:  string
): { price: number; fee: FeeRuleConfig } {
  let price = costConverted * (1 + marginTarget / 100) // estimación inicial
  for (let i = 0; i < 6; i++) {
    const fee        = resolveFeeRule(feeRules, price)
    const shipping   = resolveShippingCost(fee, price, mlRules)
    const extraCost  = fee.extra_cost_amount ?? 0
    const mlFee      = mlRules ? mlRules.ml_fee_pct / 100 : 0
    const mlFixed    = mlRules ? mlRules.ml_fixed_fee     : 0
    const divisor    = 1 - fee.commission_pct / 100 - mlFee - marginTarget / 100
    if (divisor <= 0.01) break
    price = (costConverted + fee.fixed_fee + mlFixed + shipping + extraCost) / divisor
    price = applyRounding(price, roundingRule)
  }
  return { price, fee: resolveFeeRule(feeRules, price) }
}

// ── Main calculatePrice ───────────────────────────────────────────────────

export function calculatePrice(
  list:    PriceListConfig,
  product: ProductInput
): PriceCalculation {
  const rules     = list.rules
  const feeRules  = list.fee_rules ?? []
  const mlRules   = list.ml_rules  ?? null
  const warnings: string[] = []
  const breakdown: BreakdownStep[] = []

  const fxRate       = rules?.fx_rate           ?? 1
  const fxMarkupPct  = rules?.fx_markup_pct     ?? 0
  const marginTarget = rules?.margin_target_pct ?? 30
  const marginMin    = rules?.margin_min_pct    ?? 10
  const roundingRule = rules?.rounding_rule     ?? "none"
  const pvpDiscount  = rules?.pvp_discount_pct  ?? 0

  // Warnings
  if (!product.supplier_cost) warnings.push("sin_costo_proveedor")
  if (!product.pvp_editorial) warnings.push("sin_pvp_editorial")
  if (feeRules.length === 0)  warnings.push("sin_fee_rules")

  // ── Inputs ───────────────────────────────────────────────────────────────
  breakdown.push({ label: "Costo proveedor",   value: product.supplier_cost,        type: "input", currency: product.cost_currency ?? "ARS" })
  breakdown.push({ label: "Flete importación", value: product.import_shipping_cost, type: "input", currency: product.cost_currency ?? "ARS" })

  const totalCost = product.supplier_cost != null
    ? product.supplier_cost + product.import_shipping_cost
    : null
  breakdown.push({ label: "Costo total origen", value: totalCost, type: "cost", currency: product.cost_currency ?? "ARS" })

  // ── FX ────────────────────────────────────────────────────────────────────
  const effectiveFxRate = fxRate * (1 + fxMarkupPct / 100)
  const costConverted   = totalCost != null ? totalCost * effectiveFxRate : null
  if (fxRate !== 1 || fxMarkupPct !== 0) {
    breakdown.push({ label: "Tipo de cambio",   value: fxRate,         type: "cost", note: `×${fxRate.toFixed(4)}` })
    breakdown.push({ label: "Markup FX",        value: fxMarkupPct,    type: "cost", note: `${fxMarkupPct}%` })
    breakdown.push({ label: "TC efectivo",       value: effectiveFxRate, type: "cost" })
  }
  breakdown.push({ label: "Costo convertido",   value: costConverted,   type: "cost", currency: list.currency })

  // ── PVP path ───────────────────────────────────────────────────────────────
  let pricePvp: number | null = null
  if (product.pvp_editorial != null) {
    pricePvp = applyRounding(
      product.pvp_editorial * (1 - pvpDiscount / 100) * fxRate,
      roundingRule
    )
    breakdown.push({ label: "PVP editorial",   value: product.pvp_editorial, type: "input" })
    breakdown.push({ label: "Descuento PVP",   value: pvpDiscount,           type: "cost", note: `${pvpDiscount}%` })
    breakdown.push({ label: "Precio vía PVP",  value: pricePvp,              type: "result", currency: list.currency })
  }

  // ── Cost path ──────────────────────────────────────────────────────────────
  let priceCost: number | null = null
  if (costConverted != null) {
    const { price } = calcFromCost(costConverted, feeRules, mlRules, marginTarget, roundingRule)
    priceCost = price
    breakdown.push({ label: "Margen objetivo", value: marginTarget, type: "margin", note: `${marginTarget}%` })
    breakdown.push({ label: "Precio vía costo", value: priceCost,   type: "result", currency: list.currency })
  }

  // ── Pricing base resolution ────────────────────────────────────────────────
  let pricingBaseUsed: PricingBase | null = list.pricing_base as PricingBase
  let finalPrice: number | null = null

  if (list.pricing_base === "cost") {
    finalPrice = priceCost
    if (finalPrice == null) { warnings.push("cost_path_unavailable"); pricingBaseUsed = null }
  } else if (list.pricing_base === "pvp") {
    finalPrice = pricePvp
    if (finalPrice == null) { warnings.push("pvp_path_unavailable"); pricingBaseUsed = null }
  } else if (list.pricing_base === "hybrid") {
    if (priceCost != null && pricePvp != null) {
      finalPrice      = Math.min(priceCost, pricePvp)
      pricingBaseUsed = finalPrice === priceCost ? "cost" : "pvp"
    } else if (priceCost != null) {
      finalPrice = priceCost; pricingBaseUsed = "cost"
      if (!product.pvp_editorial) warnings.push("hybrid_fell_to_cost")
    } else if (pricePvp != null) {
      finalPrice = pricePvp; pricingBaseUsed = "pvp"
      warnings.push("hybrid_fell_to_pvp")
    } else {
      warnings.push("hybrid_no_path_available"); pricingBaseUsed = null
    }
  }

  // ── Fees & margin on final price ──────────────────────────────────────────
  let commissionPct    = 0, fixedFee           = 0
  let commissionAmount: number | null = null
  let fixedFeeAmount   = 0, shippingCostAmount = 0
  let extraCostAmt     = 0, extraCostLabel: string | null = null
  let mlFeePct         = 0, mlFeeAmount: number | null = null
  let mlFixedFee       = 0, mlShippingCost     = 0
  let calculatedMargin: number | null = null

  if (finalPrice != null) {
    const fee       = resolveFeeRule(feeRules, finalPrice)
    commissionPct   = fee.commission_pct
    fixedFee        = fee.fixed_fee
    commissionAmount  = finalPrice * fee.commission_pct / 100
    fixedFeeAmount    = fee.fixed_fee
    shippingCostAmount = resolveShippingCost(fee, finalPrice, mlRules)
    extraCostAmt      = fee.extra_cost_amount ?? 0
    extraCostLabel    = fee.extra_cost_label  ?? null

    if (mlRules) {
      mlFeePct       = mlRules.ml_fee_pct
      mlFeeAmount    = finalPrice * mlRules.ml_fee_pct / 100
      mlFixedFee     = mlRules.ml_fixed_fee
      mlShippingCost = shippingCostAmount
    }

    // Breakdown fees
    breakdown.push({ label: "Comisión plataforma", value: commissionAmount,   type: "fee", note: `${commissionPct}%` })
    if (fixedFeeAmount  > 0) breakdown.push({ label: "Cargo fijo",    value: fixedFeeAmount,    type: "fee" })
    if (shippingCostAmount > 0 && !mlRules) breakdown.push({ label: "Costo envío", value: shippingCostAmount, type: "fee" })
    if (mlRules) {
      breakdown.push({ label: "Comisión ML",  value: mlFeeAmount,    type: "fee", note: `${mlFeePct}%` })
      breakdown.push({ label: "Costo envío Full", value: mlShippingCost, type: "fee",
        note: mlRules.free_shipping_strategy === "buyer_pays" ? "comprador paga" : "incluido en precio" })
    }
    if (extraCostAmt > 0) breakdown.push({ label: extraCostLabel ?? "Costo extra", value: extraCostAmt, type: "fee" })

    // Margin
    if (costConverted != null) {
      const netRevenue   = finalPrice - (commissionAmount ?? 0) - fixedFeeAmount
        - (mlFeeAmount ?? 0) - mlFixedFee - shippingCostAmount - extraCostAmt
      calculatedMargin   = ((netRevenue - costConverted) / finalPrice) * 100
      breakdown.push({ label: "Margen neto", value: calculatedMargin, type: "margin", note: `${calculatedMargin.toFixed(1)}%` })
    }
  }

  breakdown.push({ label: "Precio final calculado", value: finalPrice, type: "result", currency: list.currency })

  if (warnings.length > 0) {
    warnings.forEach(w => breakdown.push({ label: w, value: null, type: "warning" }))
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
    extra_cost_amount:   extraCostAmt,
    extra_cost_label:    extraCostLabel,
    ml_fee_pct:          mlFeePct,
    ml_fee_amount:       mlFeeAmount,
    ml_fixed_fee:        mlFixedFee,
    ml_shipping_cost:    mlShippingCost,
    free_shipping_strategy: mlRules?.free_shipping_strategy ?? null,
    price_cost:          priceCost,
    price_pvp:           pricePvp,
    calculated_price:    finalPrice,
    calculated_margin:   calculatedMargin,
    warnings,
    margin_below_min:    marginBelowMin,
    breakdown,
  }
}
