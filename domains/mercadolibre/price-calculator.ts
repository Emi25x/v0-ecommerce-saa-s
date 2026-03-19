/**
 * Calculadora de precios ML compartida.
 * Usada por: calculate-price/route.ts y publish/route.ts
 *
 * Maneja: tipo de cambio EUR→ARS, comisiones ML, cargo fijo por tramo,
 * shipping cost, iteración de precio para estabilizar rangos.
 */

// Cache de tipo de cambio EUR (TTL: 30 minutos)
let eurRateCache: { rate: number; cachedAt: number } | null = null
const EUR_RATE_CACHE_TTL = 30 * 60 * 1000
const FALLBACK_EUR_RATE = 1765

/**
 * Obtiene el tipo de cambio EUR billetes BNA (con cache de 30 min).
 */
export async function getEurExchangeRate(): Promise<number> {
  const now = Date.now()
  if (eurRateCache && now - eurRateCache.cachedAt < EUR_RATE_CACHE_TTL) {
    return eurRateCache.rate
  }

  try {
    const rateResponse = await fetch("https://dolarapi.com/v1/cotizaciones/eur")
    if (rateResponse.ok) {
      const rateData = await rateResponse.json()
      const rate = Math.round((rateData.venta || 1718) * 1.027) // EUR billetes
      eurRateCache = { rate, cachedAt: now }
      return rate
    }
  } catch {
    // Usar fallback
  }

  return FALLBACK_EUR_RATE
}

/**
 * Determina costos ML (cargo fijo + shipping) según tramo de precio.
 */
export function getMlCostsByPrice(price: number, estimatedShippingCost = 5500): { fixedFee: number; shipping: number } {
  if (price < 15000) return { fixedFee: 1115, shipping: 0 }
  if (price < 25000) return { fixedFee: 2300, shipping: 0 }
  if (price < 33000) return { fixedFee: 2810, shipping: 0 }
  return { fixedFee: 0, shipping: estimatedShippingCost }
}

export interface CalculatePriceParams {
  costPriceEur: number
  marginPercent: number
  exchangeRate?: number
  mlFeePercent?: number
  shippingCost?: number
}

export interface CalculatePriceResult {
  price: number
  exchangeRate: number
  costInArs: number
  fixedFee: number
  shippingCost: number
}

/**
 * Calcula el precio final de venta en ML considerando:
 * - Costo EUR * tipo cambio → ARS
 * - Margen deseado
 * - Comisiones ML (% + cargo fijo según tramo)
 * - Envío gratis (>$33k)
 *
 * Itera hasta que el precio se estabilice en un tramo.
 */
export async function calculateMlPrice(params: CalculatePriceParams): Promise<CalculatePriceResult> {
  const { costPriceEur, marginPercent, mlFeePercent = 0.13, shippingCost: estimatedShipping = 5500 } = params

  const exchangeRate = params.exchangeRate ?? (await getEurExchangeRate())

  const costInArs = costPriceEur * exchangeRate
  const costWithMargin = costInArs * (1 + marginPercent / 100)

  let iterations = 0
  const maxIterations = 5
  let prevPrice = 0
  let currentPrice = costWithMargin / (1 - mlFeePercent)

  while (Math.abs(currentPrice - prevPrice) > 100 && iterations < maxIterations) {
    iterations++
    prevPrice = currentPrice
    const costs = getMlCostsByPrice(currentPrice, estimatedShipping)
    currentPrice = (costWithMargin + costs.fixedFee + costs.shipping) / (1 - mlFeePercent)
  }

  const finalCosts = getMlCostsByPrice(currentPrice, estimatedShipping)
  const finalPrice = Math.ceil(currentPrice / 10) * 10

  return {
    price: finalPrice,
    exchangeRate,
    costInArs: Math.round(costInArs),
    fixedFee: finalCosts.fixedFee,
    shippingCost: finalCosts.shipping,
  }
}
