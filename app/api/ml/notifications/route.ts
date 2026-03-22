import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

const log = createStructuredLogger({ request_id: genRequestId() })

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { resource, topic, user_id } = body

    switch (topic) {
      case "items":
        log.info("Item updated", "ml_notify.item", { resource })
        break

      case "orders":
        log.info("Order notification", "ml_notify.order", { resource })
        await processOrderNotification(resource, user_id)
        break

      case "questions":
        log.info("Question received", "ml_notify.question", { resource })
        break

      default:
        log.info("Unknown topic", "ml_notify.unknown", { topic })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    log.error("Error processing notification", error, "ml_notify.fatal")
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

    const orderId = resource.split("/").pop()

    if (!orderId) {
      log.error("Invalid order resource", new Error("missing order_id"), "ml_notify.order", { resource })
      return
    }

    log.info("Processing order", "ml_notify.order_process", { order_id: orderId, user_id: userId })

    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id, access_token")
      .eq("ml_user_id", userId)
      .single()

    if (!account) {
      log.error("ML account not found", new Error("account_not_found"), "ml_notify.order_process", {
        user_id: userId,
      })
      return
    }

    const mlResponse = await fetch(`https://api.mercadolibre.com${resource}`, {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
      },
    })

    if (!mlResponse.ok) {
      log.error("Failed to fetch order details", new Error(`HTTP ${mlResponse.status}`), "ml_notify.order_fetch", {
        order_id: orderId,
        status: mlResponse.status,
      })
      return
    }

    const mlOrder = await mlResponse.json()

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
      log.error("Error saving order", error, "ml_notify.order_save", { order_id: orderId })
      return
    }

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

    log.info("Order saved successfully", "ml_notify.order_save", { order_id: orderId, status: "ok" })
  } catch (error) {
    log.error("Error processing order notification", error, "ml_notify.order_process")
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
