import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log("[v0] Mercado Libre notification received:", body)

    const { resource, topic, user_id } = body

    // Procesar según el tipo de notificación
    switch (topic) {
      case "items":
        console.log("[v0] Item updated:", resource)
        break

      case "orders":
        console.log("[v0] Order notification:", resource)
        await processOrderNotification(resource, user_id)
        break

      case "questions":
        console.log("[v0] Question received:", resource)
        break

      default:
        console.log("[v0] Unknown topic:", topic)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("[v0] Error processing notification:", error)
    return NextResponse.json({ success: false }, { status: 200 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    message: "Mercado Libre notifications endpoint",
  })
}

async function processOrderNotification(resource: string, userId: string) {
  try {
    const supabase = await createClient()

    // Extraer order ID del resource (ej: "/orders/123456789")
    const orderId = resource.split("/").pop()

    if (!orderId) {
      console.error("[v0] Invalid order resource:", resource)
      return
    }

    console.log(`[v0] Processing order ${orderId} from MercadoLibre user ${userId}`)

    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id, access_token")
      .eq("ml_user_id", userId)
      .single()

    if (!account) {
      console.error(`[v0] ML account not found for user ${userId}`)
      return
    }

    // Obtener detalles completos de la orden desde ML API
    const mlResponse = await fetch(`https://api.mercadolibre.com${resource}`, {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
      },
    })

    if (!mlResponse.ok) {
      console.error(`[v0] Failed to fetch order details: ${mlResponse.status}`)
      return
    }

    const mlOrder = await mlResponse.json()

    // Guardar en tabla orders
    const orderData = {
      platform: "mercadolibre",
      platform_order_id: mlOrder.id.toString(),
      account_id: account.id,
      order_number: mlOrder.id.toString(),
      customer_name: mlOrder.buyer?.nickname || "Unknown",
      customer_email: mlOrder.buyer?.email,
      customer_phone: mlOrder.buyer?.phone?.number,
      total: mlOrder.total_amount,
      currency: mlOrder.currency_id,
      status: mapMLStatus(mlOrder.status),
      payment_status: mlOrder.payments?.[0]?.status,
      order_data: mlOrder,
      order_date: mlOrder.date_created,
    }

    const { data: savedOrder, error } = await supabase
      .from("orders")
      .upsert(orderData, {
        onConflict: "platform,platform_order_id",
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error saving order:", error)
      return
    }

    // Guardar items
    for (const item of mlOrder.order_items || []) {
      await supabase.from("order_items").upsert(
        {
          order_id: savedOrder.id,
          sku: item.item?.id,
          title: item.item?.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
          item_data: item,
        },
        {
          onConflict: "order_id,sku",
        },
      )
    }

    await supabase.from("pending_orders").insert({
      platform: "mercadolibre",
      platform_order_id: orderId,
      order_data: mlOrder,
      status: "pending",
    })

    console.log(`[v0] Order ${orderId} saved successfully`)
  } catch (error) {
    console.error("[v0] Error processing order notification:", error)
  }
}

function mapMLStatus(mlStatus: string): string {
  const statusMap: Record<string, string> = {
    confirmed: "processing",
    payment_required: "pending",
    payment_in_process: "pending",
    paid: "processing",
    cancelled: "cancelled",
    invalid: "cancelled",
  }
  return statusMap[mlStatus] || "pending"
}
