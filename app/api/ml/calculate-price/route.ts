import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Endpoint para calcular el precio de venta en ML considerando:
// - Costo del producto (en EUR de Arnoia)
// - Tipo de cambio EUR -> ARS
// - Margen de ganancia deseado
// - Comisiones de ML (según listing_type)

export async function POST(request: Request) {
  try {
    console.log("[v0] ========================================")
    console.log("[v0] POST /api/ml/calculate-price - STARTING")
    console.log("[v0] ========================================")
    
    const body = await request.json()
    const { 
      cost_price_eur, 
      margin_percent = 20, 
      listing_type_id = "gold_special",
      exchange_rate // opcional, si no se envia se obtiene automaticamente
    } = body

    console.log("[v0] Input:", { cost_price_eur, margin_percent, listing_type_id, exchange_rate })

    if (!cost_price_eur || cost_price_eur <= 0) {
      return NextResponse.json({ error: "cost_price_eur es requerido" }, { status: 400 })
    }

    // Obtener tipo de cambio EUR -> ARS (Euro BILLETES vendedor BNA)
    let rate = exchange_rate
    if (!rate) {
      try {
        // Usar API dolarapi.com para obtener Euro oficial BNA (divisas)
        const rateResponse = await fetch("https://dolarapi.com/v1/cotizaciones/eur")
        if (rateResponse.ok) {
          const rateData = await rateResponse.json()
          // Euro divisas vendedor BNA
          const euroDivisas = rateData.venta || 1718
          // Euro BILLETES es aprox 2.7% mas que divisas
          rate = Math.round(euroDivisas * 1.027)
          console.log("[v0] Euro BNA divisas:", euroDivisas, "-> billetes:", rate)
        } else {
          rate = 1765 // Fallback Euro BILLETES BNA
        }
      } catch {
        rate = 1765 // Fallback Euro BILLETES BNA
      }
    }

    // Obtener comisiones de ML
    const supabase = await createClient()
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("access_token, token_expires_at, refresh_token, ml_user_id")
      .limit(1)
      .single()

    let mlFeePercent = 0.13 // Default 13% para gold_special (libros)
    // Costo fijo adicional según precio (2025):
    // - Hasta $15,000: $1,115
    // - $15,000 a $25,000: $2,300  
    // - $25,000 a $33,000: $2,810
    // - Más de $33,000: $0
    let mlFixedFee = 0 // Se calcula dinámicamente según el precio
    let accessToken = ""; // Declare accessToken variable

    if (account?.access_token) {
      // Verificar y refrescar token si es necesario
      accessToken = account.access_token
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
    // Formula: (Costo EUR * TipoCambio * (1 + Margen) + CargoFijo) / (1 - ComisionML)
    const costInArs = cost_price_eur * rate
    const costWithMargin = costInArs * (1 + margin_percent / 100)
    
    console.log("[v0] Tipo de cambio EUR->ARS:", rate)
    console.log("[v0] Costo en ARS:", costInArs)
    console.log("[v0] Costo con margen:", costWithMargin)
    
    // Primera estimacion sin cargo fijo para determinar rango de precio
    let estimatedFinalPrice = costWithMargin / (1 - mlFeePercent)
    console.log("[v0] Precio estimado inicial:", estimatedFinalPrice)
    
    // Determinar cargo fijo segun rango de precio (2025)
    if (estimatedFinalPrice < 15000) {
      mlFixedFee = 1115
    } else if (estimatedFinalPrice < 25000) {
      mlFixedFee = 2300
    } else if (estimatedFinalPrice < 33000) {
      mlFixedFee = 2810
    } else {
      mlFixedFee = 0
    }
    
    // Costo de envio gratis (obligatorio para productos > $33,000)
    // Consultar API de ML para obtener costo real
    let shippingCost = 0
    if (estimatedFinalPrice >= 33000 && accessToken) {
      try {
        // Consultar costo de envio gratis usando API de ML
        // Usamos un item_id de ejemplo o consultamos shipping_options
        const shippingResponse = await fetch(
          `https://api.mercadolibre.com/users/${account?.ml_user_id || 'me'}/shipping_options/free?price=${Math.round(estimatedFinalPrice)}&listing_type_id=${listing_type_id}&category_id=MLA3025`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        
        if (shippingResponse.ok) {
          const shippingData = await shippingResponse.json()
          // El costo de envio para el vendedor esta en coverage.list_cost
          if (shippingData?.coverage?.list_cost) {
            shippingCost = shippingData.coverage.list_cost
          } else if (shippingData?.options?.[0]?.list_cost) {
            shippingCost = shippingData.options[0].list_cost
          } else {
            // Fallback: usar estimacion basada en peso promedio libro (500g)
            shippingCost = 5500 // Costo actualizado 2026
          }
        } else {
          shippingCost = 5500 // Fallback
        }
      } catch {
        shippingCost = 5500 // Fallback si falla la API
      }
    } else if (estimatedFinalPrice >= 33000) {
      // Sin token, usar estimacion
      shippingCost = 5500 // Costo estimado envio gratis 2026 (~500g)
    }
    
    console.log("[v0] Cargo fijo ML:", mlFixedFee)
    console.log("[v0] Costo envio:", shippingCost)
    
    // Recalcular precio final con cargo fijo y envio
    const priceWithFees = (costWithMargin + mlFixedFee + shippingCost) / (1 - mlFeePercent)
    const finalPrice = Math.ceil(priceWithFees / 10) * 10 // Redondear a decena
    
    console.log("[v0] Precio final ARS:", finalPrice)

    // Verificacion inversa
    const mlCommission = finalPrice * mlFeePercent + mlFixedFee
    const netReceived = finalPrice - mlCommission - shippingCost
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
        shipping_cost: shippingCost,
        final_price_ars: finalPrice,
        // Verificación
        verification: {
          ml_commission: Math.round(mlCommission),
          shipping_cost: shippingCost,
          total_costs: Math.round(mlCommission + shippingCost),
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
