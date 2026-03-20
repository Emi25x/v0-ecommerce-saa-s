import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"
import { handleQuestionNotification } from "@/domains/mercadolibre/question-handler"
import { MlWebhookPayloadSchema } from "@/lib/validation/schemas"
import { createAdminClient } from "@/lib/db/admin"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

// Webhook endpoint para recibir notificaciones de MercadoLibre
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const log = createStructuredLogger({ request_id: genRequestId() })

  try {
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    // ── Zod validation: enforce payload contract ─────────────────────────
    const parsed = MlWebhookPayloadSchema.safeParse(rawBody)
    if (!parsed.success) {
      log.warn("Invalid payload shape", "webhook.validate", { issue: parsed.error.issues[0]?.message })
      await logWebhook("unknown", "unknown", "unknown", 400, Date.now() - startTime, "Schema validation failed")
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }
    const body = parsed.data

    // ── Origin validation: verify user_id belongs to a known ML account ──
    // This prevents forged webhooks from external attackers. If the user_id
    // doesn't match any of our ML accounts, we reject early.
    const db = createAdminClient()
    const { data: knownAccount } = await db
      .from("ml_accounts")
      .select("id")
      .eq("ml_user_id", String(body.user_id))
      .maybeSingle()

    if (!knownAccount) {
      log.warn("Unknown user_id, rejecting", "webhook.auth", { user_id: body.user_id })
      await logWebhook(body.topic, body.resource, String(body.user_id), 403, Date.now() - startTime, "Unknown user_id")
      // Return 200 to ML so they don't retry (the user_id genuinely doesn't belong to us)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Procesar la notificación según el topic
    // Build a typed notification object from validated + raw fields
    const notification = {
      ...(rawBody as Record<string, unknown>),
      topic: body.topic,
      resource: body.resource,
      user_id: String(body.user_id),
      application_id: body.application_id ? String(body.application_id) : undefined,
      sent: body.sent,
      received: body.received,
    }

    switch (body.topic) {
      case "orders_v2":
        await handleOrderNotification(notification, log)
        break
      case "shipments":
        await handleShipmentNotification(notification, log)
        break
      case "items":
        await handleItemNotification(notification, log)
        break
      case "questions":
        await handleQuestionNotification(notification as any)
        break
      default:
        log.info("Unhandled topic", "webhook.unhandled", { topic: body.topic })
    }

    // Log exitoso
    await logWebhook(body.topic, body.resource, String(body.user_id), 200, Date.now() - startTime)

    // Responder rápidamente (< 500ms) para evitar que ML deshabilite el webhook
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    log.error("Processing error", error, "webhook.fatal")
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    // Log del error — best-effort
    await logWebhook("unknown", "unknown", "unknown", 500, Date.now() - startTime, errorMessage).catch(() => {})

    // Aún así devolver 200 para evitar reintentos innecesarios de ML
    return NextResponse.json({ success: true }, { status: 200 })
  }
}

async function handleOrderNotification(notification: any, log: ReturnType<typeof createStructuredLogger>) {
  try {
    const supabase = await createClient()
    const orderId = notification.resource.split("/").pop()

    log.info("Processing order notification", "webhook.order", { order_id: orderId })

    // Buscar la cuenta de ML por user_id
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("ml_user_id", notification.user_id.toString())
      .single()

    if (account) {
      // Refrescar token si es necesario
      const validAccount = await refreshTokenIfNeeded(account)

      // Obtener datos de la orden desde la API de ML
      const orderResponse = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${validAccount.access_token}` },
      })

      if (orderResponse.ok) {
        const orderData = await orderResponse.json()

        // Guardar/actualizar en cache
        await supabase.from("ml_orders_cache").upsert(
          {
            id: orderData.id.toString(),
            account_id: account.id,
            order_data: orderData,
            buyer_nickname: orderData.buyer?.nickname,
            status: orderData.status,
            total_amount: orderData.total_amount,
            cached_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )

        log.info("Order synced to cache", "webhook.order", { order_id: orderId, status: "ok" })
      }
    }

    // También guardar en queue para auditoría
    await supabase.from("ml_webhook_queue").insert({
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      application_id: notification.application_id,
      sent: notification.sent,
      received: notification.received,
      processed: true,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    log.error("Error handling order notification", error, "webhook.order")
  }
}

async function handleShipmentNotification(notification: any, log: ReturnType<typeof createStructuredLogger>) {
  try {
    const supabase = await createClient()
    const shipmentId = notification.resource.split("/").pop()

    log.info("Processing shipment notification", "webhook.shipment", { shipment_id: shipmentId })

    // Buscar la cuenta de ML
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("ml_user_id", notification.user_id.toString())
      .single()

    if (account) {
      const validAccount = await refreshTokenIfNeeded(account)

      // Obtener datos del envío
      const shipmentResponse = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
        headers: { Authorization: `Bearer ${validAccount.access_token}` },
      })

      if (shipmentResponse.ok) {
        const shipmentData = await shipmentResponse.json()

        await supabase.from("ml_shipments").upsert(
          {
            id: shipmentData.id.toString(),
            account_id: account.id,
            order_id: shipmentData.order_id?.toString(),
            status: shipmentData.status,
            substatus: shipmentData.substatus,
            tracking_number: shipmentData.tracking_number,
            shipment_data: shipmentData,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )

        log.info("Shipment synced to cache", "webhook.shipment", { shipment_id: shipmentId, status: "ok" })
      }
    }

    await supabase.from("ml_webhook_queue").insert({
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      processed: true,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    log.error("Error handling shipment notification", error, "webhook.shipment")
  }
}

async function handleItemNotification(notification: any, log: ReturnType<typeof createStructuredLogger>) {
  try {
    const supabase = await createClient()
    const itemId = notification.resource.split("/").pop()

    log.info("Processing item notification", "webhook.item", { item_id: itemId })

    // Buscar la cuenta de ML
    const { data: account } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("ml_user_id", notification.user_id.toString())
      .single()

    if (account) {
      const validAccount = await refreshTokenIfNeeded(account)

      // Obtener datos del item
      const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { Authorization: `Bearer ${validAccount.access_token}` },
      })

      if (itemResponse.ok) {
        const itemData = await itemResponse.json()

        await supabase.from("ml_products_cache").upsert(
          {
            id: itemData.id,
            account_id: account.id,
            title: itemData.title,
            price: itemData.price,
            currency_id: itemData.currency_id,
            available_quantity: itemData.available_quantity,
            sold_quantity: itemData.sold_quantity,
            status: itemData.status,
            thumbnail: itemData.thumbnail,
            permalink: itemData.permalink,
            category_id: itemData.category_id,
            item_data: itemData,
            cached_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )

        log.info("Item synced to cache", "webhook.item", { item_id: itemId, status: "ok" })
      }
    }

    await supabase.from("ml_webhook_queue").insert({
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      processed: true,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    log.error("Error handling item notification", error, "webhook.item")
  }
}

const webhookLog = createStructuredLogger({ request_id: "webhook-audit" })

async function logWebhook(
  topic: string,
  resource: string,
  userId: string,
  statusCode: number,
  responseTimeMs: number,
  errorMessage?: string,
) {
  try {
    const supabase = await createClient()
    await supabase.from("ml_webhook_logs").insert({
      topic,
      resource,
      user_id: userId,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      error_message: errorMessage,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    webhookLog.error("Error logging webhook", error, "webhook.audit")
  }
}

// Endpoint GET para verificar que el webhook está activo
export async function GET() {
  return NextResponse.json({
    status: "active",
    message: "MercadoLibre webhook endpoint is ready to receive notifications",
  })
}
