import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextResponse } from "next/server"

// Lógica de cálculo compartida entre GET y POST
async function calculatePrice(params: {
  cost_price_eur: number
  margin_percent?: number
  listing_type_id?: string
  exchange_rate?: number
}) {
  const { cost_price_eur, margin_percent = 20, listing_type_id = "gold_special", exchange_rate } = params

  // Obtener tipo de cambio EUR -> ARS (Euro BILLETES vendedor BNA)
  let rate = exchange_rate
  if (!rate) {
    try {
      const rateResponse = await fetch("https://dolarapi.com/v1/cotizaciones/eur")
      if (rateResponse.ok) {
        const rateData = await rateResponse.json()
        const euroDivisas = rateData.venta || 1718
        rate = Math.round(euroDivisas * 1.027)
      } else {
        rate = 1765
      }
    } catch {
      rate = 1765
    }
  }

  // Obtener comisiones de ML
  const supabase = await createClient()
  const { data: account } = await supabase.from("ml_accounts").select("id, ml_user_id").limit(1).single()

  let mlFeePercent = 0.13
  let mlFixedFee = 0
  let accessToken = ""

  if (account) {
    try {
      accessToken = await getValidAccessToken(account.id)

      const estimatedPrice = Math.round((cost_price_eur * rate * (1 + margin_percent / 100)) / 0.87)

      const feesResponse = await fetch(
        `https://api.mercadolibre.com/sites/MLA/listing_prices?price=${estimatedPrice}&listing_type_id=${listing_type_id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )

      if (feesResponse.ok) {
        const feesData = await feesResponse.json()
        if (feesData.length > 0) {
          const feeInfo = feesData[0]
          mlFeePercent = (feeInfo.sale_fee_details?.percentage_fee || 13) / 100
          mlFixedFee = feeInfo.sale_fee_details?.fixed_fee || 200
        }
      }
    } catch {
      // Usar defaults si falla token o fees
    }
  }

  const costInArs = cost_price_eur * rate
  const costWithMargin = costInArs * (1 + margin_percent / 100)

  let shippingCost = 5500
  let iterations = 0
  const maxIterations = 5

  const getCosts = (price: number) => {
    if (price < 15000) return { fixedFee: 1115, shipping: 0 }
    if (price < 25000) return { fixedFee: 2300, shipping: 0 }
    if (price < 33000) return { fixedFee: 2810, shipping: 0 }
    return { fixedFee: 0, shipping: shippingCost }
  }

  let prevPrice = 0
  let currentPrice = costWithMargin / (1 - mlFeePercent)

  while (Math.abs(currentPrice - prevPrice) > 100 && iterations < maxIterations) {
    iterations++
    prevPrice = currentPrice
    const costs = getCosts(currentPrice)
    mlFixedFee = costs.fixedFee
    currentPrice = (costWithMargin + mlFixedFee + costs.shipping) / (1 - mlFeePercent)
  }

  const finalCosts = getCosts(currentPrice)
  mlFixedFee = finalCosts.fixedFee
  shippingCost = finalCosts.shipping

  if (currentPrice >= 33000 && accessToken) {
    try {
      const shippingResponse = await fetch(
        `https://api.mercadolibre.com/users/${account?.ml_user_id || "me"}/shipping_options/free?price=${Math.round(currentPrice)}&listing_type_id=${listing_type_id}&category_id=MLA3025`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      if (shippingResponse.ok) {
        const shippingData = await shippingResponse.json()
        if (shippingData?.coverage?.list_cost) {
          shippingCost = shippingData.coverage.list_cost
        } else if (shippingData?.options?.[0]?.list_cost) {
          shippingCost = shippingData.options[0].list_cost
        }
      }
    } catch {
      // Mantener fallback
    }
  }

  const priceWithFees = (costWithMargin + mlFixedFee + shippingCost) / (1 - mlFeePercent)
  const finalPrice = Math.ceil(priceWithFees / 10) * 10

  const mlCommission = finalPrice * mlFeePercent
  const netReceived = finalPrice - mlCommission - mlFixedFee - shippingCost
  const actualMargin = ((netReceived - costInArs) / costInArs) * 100

  return {
    success: true,
    calculation: {
      cost_price_eur,
      exchange_rate: rate,
      cost_in_ars: Math.round(costInArs),
      margin_percent,
      listing_type_id,
      ml_fee_percent: Math.round(mlFeePercent * 100 * 10) / 10,
      ml_fixed_fee: mlFixedFee,
      shipping_cost: shippingCost,
      final_price_ars: finalPrice,
      verification: {
        ml_commission: Math.round(mlCommission),
        ml_fixed_fee: mlFixedFee,
        shipping_cost: shippingCost,
        total_costs: Math.round(mlCommission + mlFixedFee + shippingCost),
        net_received: Math.round(netReceived),
        actual_margin_percent: Math.round(actualMargin * 10) / 10,
        profit_ars: Math.round(netReceived - costInArs),
      },
    },
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { cost_price_eur, margin_percent, listing_type_id, exchange_rate } = body

    if (!cost_price_eur || cost_price_eur <= 0) {
      return NextResponse.json({ error: "cost_price_eur es requerido" }, { status: 400 })
    }

    const result = await calculatePrice({ cost_price_eur, margin_percent, listing_type_id, exchange_rate })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error calculando precio:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// GET para calcular precio de un producto específico por EAN
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ean = searchParams.get("ean")
    const margin = parseFloat(searchParams.get("margin") || "20")
    const listing_type = searchParams.get("listing_type") || "gold_special"

    if (!ean) {
      return NextResponse.json({ error: "ean es requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Buscar producto por EAN
    const { data: product } = await supabase
      .from("products")
      .select("ean, title, cost_price, price")
      .eq("ean", ean)
      .single()

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    // Usar cost_price si existe, sino usar price
    const costPrice = product.cost_price || product.price || 0

    if (costPrice <= 0) {
      return NextResponse.json({ error: "El producto no tiene precio de costo" }, { status: 400 })
    }

    // Llamar directo a la lógica de cálculo (sin self-fetch)
    const result = await calculatePrice({
      cost_price_eur: costPrice,
      margin_percent: margin,
      listing_type_id: listing_type,
    })

    return NextResponse.json({
      ...result,
      product: {
        ean: product.ean,
        title: product.title,
        cost_price_eur: costPrice,
      },
    })
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
