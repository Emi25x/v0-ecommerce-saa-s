import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Endpoint para calcular el precio de venta en ML considerando:
// - Costo del producto (en EUR de Arnoia)
// - Tipo de cambio EUR -> ARS
// - Margen de ganancia deseado
// - Comisiones de ML (según listing_type)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      cost_price_eur, 
      margin_percent = 20, 
      listing_type_id = "gold_special",
      exchange_rate // opcional, si no se envía se obtiene automáticamente
    } = body

    if (!cost_price_eur || cost_price_eur <= 0) {
      return NextResponse.json({ error: "cost_price_eur es requerido" }, { status: 400 })
    }

    // Obtener tipo de cambio EUR -> ARS (si no se envía)
    let rate = exchange_rate
    if (!rate) {
      try {
        // Usar API de tipo de cambio (Blue o oficial)
        const rateResponse = await fetch("https://api.bluelytics.com.ar/v2/latest")
        if (rateResponse.ok) {
          const rateData = await rateResponse.json()
          // Usar dólar blue como referencia y ajustar EUR (EUR suele ser ~5-10% más que USD)
          const usdBlue = rateData.blue?.value_sell || 1200
          rate = usdBlue * 1.05 // EUR aproximado
        } else {
          rate = 1200 // Fallback
        }
      } catch {
        rate = 1200 // Fallback
      }
    }

    // Obtener comisiones de ML
    const supabase = await createClient()
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("access_token, token_expires_at, refresh_token")
      .limit(1)
      .single()

    let mlFeePercent = 0.13 // Default 13% para gold_special
    let mlFixedFee = 200 // Default $200 ARS cargo fijo

    if (account?.access_token) {
      // Verificar y refrescar token si es necesario
      let accessToken = account.access_token
      const expiresAt = new Date(account.token_expires_at)
      if (expiresAt < new Date() && account.refresh_token) {
        const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: process.env.MERCADOLIBRE_CLIENT_ID!,
            client_secret: process.env.MERCADOLIBRE_CLIENT_SECRET!,
            refresh_token: account.refresh_token,
          }),
        })
        if (refreshResponse.ok) {
          const tokens = await refreshResponse.json()
          accessToken = tokens.access_token
        }
      }

      // Calcular un precio estimado para obtener las comisiones exactas
      const estimatedPrice = Math.round(cost_price_eur * rate * (1 + margin_percent / 100) / 0.87)
      
      // Obtener comisiones reales de ML
      const feesResponse = await fetch(
        `https://api.mercadolibre.com/sites/MLA/listing_prices?price=${estimatedPrice}&listing_type_id=${listing_type_id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      
      if (feesResponse.ok) {
        const feesData = await feesResponse.json()
        if (feesData.length > 0) {
          const feeInfo = feesData[0]
          mlFeePercent = (feeInfo.sale_fee_details?.percentage_fee || 13) / 100
          mlFixedFee = feeInfo.sale_fee_details?.fixed_fee || 200
        }
      }
    }

    // Calcular precio de venta en ARS
    // Fórmula: (Costo EUR * TipoCambio * (1 + Margen) + CargoFijo) / (1 - ComisiónML)
    const costInArs = cost_price_eur * rate
    const costWithMargin = costInArs * (1 + margin_percent / 100)
    const priceWithFees = (costWithMargin + mlFixedFee) / (1 - mlFeePercent)
    const finalPrice = Math.ceil(priceWithFees / 10) * 10 // Redondear a decena

    // Verificación inversa
    const mlCommission = finalPrice * mlFeePercent + mlFixedFee
    const netReceived = finalPrice - mlCommission
    const actualMargin = ((netReceived - costInArs) / costInArs) * 100

    return NextResponse.json({
      success: true,
      calculation: {
        cost_price_eur,
        exchange_rate: rate,
        cost_in_ars: Math.round(costInArs),
        margin_percent,
        listing_type_id,
        ml_fee_percent: Math.round(mlFeePercent * 100 * 10) / 10,
        ml_fixed_fee: mlFixedFee,
        final_price_ars: finalPrice,
        // Verificación
        verification: {
          ml_commission: Math.round(mlCommission),
          net_received: Math.round(netReceived),
          actual_margin_percent: Math.round(actualMargin * 10) / 10,
          profit_ars: Math.round(netReceived - costInArs)
        }
      }
    })

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

    // Llamar al POST con los datos
    const response = await fetch(request.url.replace(/\?.*$/, ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cost_price_eur: costPrice,
        margin_percent: margin,
        listing_type_id: listing_type
      })
    })

    const result = await response.json()
    
    return NextResponse.json({
      ...result,
      product: {
        ean: product.ean,
        title: product.title,
        cost_price_eur: costPrice
      }
    })

  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
