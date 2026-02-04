import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST - Sincronizar órdenes de MercadoLibre
export async function POST(request: Request) {
  console.log("[v0] ========== SYNC-ORDERS POST ==========")
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { account_id } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    // Obtener cuenta ML
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id, nickname, access_token, ml_user_id")
      .eq("id", account_id)
      .single()

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    console.log("[v0] Syncing orders for account:", account.nickname)

    // Obtener órdenes de MercadoLibre
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/orders/search?sort=date_desc&limit=50`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    )

    if (!searchResponse.ok) {
      if (searchResponse.status === 429) {
        return NextResponse.json({
          success: false,
          rate_limited: true,
          message: "Rate limit alcanzado. Intenta más tarde."
        })
      }
      const errorText = await searchResponse.text()
      console.error("[v0] ML API error:", searchResponse.status, errorText)
      return NextResponse.json({ error: "Error fetching orders from ML" }, { status: 500 })
    }

    let searchData
    try {
      searchData = await searchResponse.json()
    } catch {
      return NextResponse.json({
        success: false,
        rate_limited: true,
        message: "Error parsing ML response"
      })
    }

    const orderIds = searchData.results || []
    console.log("[v0] Found", orderIds.length, "orders in ML")

    let synced = 0
    let updated = 0
    let errors = 0

    // Procesar cada orden
    for (const orderId of orderIds) {
      try {
        // Obtener detalles de la orden
        const orderResponse = await fetch(
          `https://api.mercadolibre.com/orders/${orderId}`,
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        )

        if (!orderResponse.ok) {
          errors++
          continue
        }

        const order = await orderResponse.json()

        // Guardar o actualizar orden en la DB
        const { error: upsertError } = await supabase.from("ml_orders").upsert(
          {
            account_id: account.id,
            ml_order_id: order.id,
            buyer_id: order.buyer.id,
            buyer_nickname: order.buyer.nickname,
            status: order.status,
            date_created: order.date_created,
            total_amount: order.total_amount,
            currency_id: order.currency_id,
            packing_status: order.pack_status,
            shipping_status: order.shipping.status,
            updated_at: new Date().toISOString()
          },
          { onConflict: "account_id,ml_order_id" }
        )

        if (upsertError) {
          console.error("[v0] Error upserting order:", upsertError)
          errors++
        } else {
          synced++
        }
      } catch (error) {
        console.error("[v0] Error processing order:", error)
        errors++
      }
    }

    // Actualizar última sincronización
    await supabase
      .from("ml_accounts")
      .update({ last_order_sync_at: new Date().toISOString() })
      .eq("id", account_id)

    console.log("[v0] Sync-orders RESULTADO:", { synced, errors })

    return NextResponse.json({
      success: true,
      synced,
      errors,
      total: orderIds.length
    })
  } catch (error) {
    console.error("[v0] Error syncing orders:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
