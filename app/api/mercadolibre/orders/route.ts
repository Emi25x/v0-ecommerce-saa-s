import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account") || searchParams.get("account_id") || ""
    const status = searchParams.get("status") || "all"
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    console.log("[v0] GET /api/mercadolibre/orders - account:", accountId, "status:", status)

    // Obtener cuenta(s)
    let account
    if (accountId === "all" || !accountId) {
      const { data: accounts } = await supabase
        .from("ml_accounts")
        .select("id, ml_user_id, access_token, nickname")
        .limit(1)

      if (!accounts || accounts.length === 0) {
        return NextResponse.json({ orders: [], paging: { total: 0, limit, offset } })
      }
      account = accounts[0]
    } else {
      const { data: acc } = await supabase
        .from("ml_accounts")
        .select("id, ml_user_id, access_token, nickname")
        .eq("id", accountId)
        .single()

      if (!acc) {
        return NextResponse.json({ orders: [], paging: { total: 0, limit, offset } })
      }
      account = acc
    }

    console.log("[v0] Fetching orders from ML for:", account.nickname)

    // Consultar ML directamente
    const mlUrl = `https://api.mercadolibre.com/orders/search?seller=${account.ml_user_id}&sort=date_desc&limit=${limit}&offset=${offset}`
    
    const mlResponse = await fetch(mlUrl, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    })

    if (!mlResponse.ok) {
      console.error("[v0] ML API error:", mlResponse.status)
      return NextResponse.json({ 
        orders: [], 
        paging: { total: 0, limit, offset },
        error: "Error al consultar MercadoLibre"
      })
    }

    const mlData = await mlResponse.json()
    console.log("[v0] Got", mlData.results?.length || 0, "orders from ML")
    
    // Debug: mostrar estructura completa de la primera orden
    if (mlData.results && mlData.results.length > 0) {
      const firstOrder = mlData.results[0]
      console.log("[v0] ESTRUCTURA DE ORDEN COMPLETA:", JSON.stringify({
        id: firstOrder.id,
        buyer: firstOrder.buyer,
        shipping: firstOrder.shipping,
        order_items: firstOrder.order_items?.map((item: any) => ({
          item: {
            id: item.item?.id,
            title: item.item?.title,
            seller_sku: item.item?.seller_sku,
            seller_custom_field: item.item?.seller_custom_field,
            variation_attributes: item.item?.variation_attributes
          },
          quantity: item.quantity,
          unit_price: item.unit_price
        }))
      }, null, 2))
    }

    return NextResponse.json({
      orders: mlData.results || [],
      paging: mlData.paging || { total: 0, limit, offset }
    })

  } catch (error) {
    console.error("[v0] Error in orders endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error", orders: [], paging: { total: 0, limit: 50, offset: 0 } },
      { status: 500 }
    )
  }
}
