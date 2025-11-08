import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Webhook endpoint para recibir notificaciones de MercadoLibre
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()

    console.log("[v0] MercadoLibre webhook received:", JSON.stringify(body, null, 2))

    // Validar que la notificación viene de MercadoLibre
    if (!body.topic || !body.resource) {
      console.log("[v0] Invalid webhook payload - missing topic or resource")
      await logWebhook(body.topic, body.resource, body.user_id, 400, Date.now() - startTime, "Invalid payload")
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    // Procesar la notificación según el topic
    switch (body.topic) {
      case "orders_v2":
        await handleOrderNotification(body)
        break
      case "shipments":
        await handleShipmentNotification(body)
        break
      case "items":
        await handleItemNotification(body)
        break
      default:
        console.log(`[v0] Unhandled topic: ${body.topic}`)
    }

    // Log exitoso
    await logWebhook(body.topic, body.resource, body.user_id, 200, Date.now() - startTime)

    // Responder rápidamente (< 500ms) para evitar que ML deshabilite el webhook
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("[v0] Webhook processing error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    // Log del error
    await logWebhook("unknown", "unknown", "unknown", 500, Date.now() - startTime, errorMessage)

    // Aún así devolver 200 para evitar reintentos innecesarios
    return NextResponse.json({ success: true }, { status: 200 })
  }
}

async function handleOrderNotification(notification: any) {
  try {
    const supabase = await createClient()

    // Extraer el order ID del resource
    const orderId = notification.resource.split("/").pop()

    console.log(`[v0] Processing order notification for order ${orderId}`)

    // Guardar la notificación en la base de datos para procesamiento asíncrono
    const { error } = await supabase.from("ml_webhook_queue").insert({
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      application_id: notification.application_id,
      sent: notification.sent,
      received: notification.received,
      processed: false,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error("[v0] Error saving webhook to queue:", error)
    } else {
      console.log(`[v0] Order notification queued for processing: ${orderId}`)
    }
  } catch (error) {
    console.error("[v0] Error handling order notification:", error)
  }
}

async function handleShipmentNotification(notification: any) {
  try {
    const supabase = await createClient()

    // Extraer el shipment ID del resource
    const shipmentId = notification.resource.split("/").pop()

    console.log(`[v0] Processing shipment notification for shipment ${shipmentId}`)

    // Guardar la notificación en la base de datos para procesamiento asíncrono
    const { error } = await supabase.from("ml_webhook_queue").insert({
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      application_id: notification.application_id,
      sent: notification.sent,
      received: notification.received,
      processed: false,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error("[v0] Error saving webhook to queue:", error)
    } else {
      console.log(`[v0] Shipment notification queued for processing: ${shipmentId}`)
    }
  } catch (error) {
    console.error("[v0] Error handling shipment notification:", error)
  }
}

async function handleItemNotification(notification: any) {
  try {
    const supabase = await createClient()

    // Extraer el item ID del resource
    const itemId = notification.resource.split("/").pop()

    console.log(`[v0] Processing item notification for item ${itemId}`)

    // Guardar la notificación en la base de datos para procesamiento asíncrono
    const { error } = await supabase.from("ml_webhook_queue").insert({
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      application_id: notification.application_id,
      sent: notification.sent,
      received: notification.received,
      processed: false,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error("[v0] Error saving webhook to queue:", error)
    } else {
      console.log(`[v0] Item notification queued for processing: ${itemId}`)
    }
  } catch (error) {
    console.error("[v0] Error handling item notification:", error)
  }
}

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
    console.error("[v0] Error logging webhook:", error)
  }
}

// Endpoint GET para verificar que el webhook está activo
export async function GET() {
  return NextResponse.json({
    status: "active",
    message: "MercadoLibre webhook endpoint is ready to receive notifications",
  })
}
