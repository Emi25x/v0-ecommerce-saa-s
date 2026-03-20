import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const log = createStructuredLogger({ request_id: genRequestId() })
    log.info("Processing pending orders", "process_orders.start")

    const supabase = await createClient()

    const { data: pendingOrders, error } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("status", "pending")
      .lt("retry_count", 3)
      .order("created_at", { ascending: true })
      .limit(50)

    if (error) {
      log.error("Error fetching pending orders", error, "process_orders.query_error")
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      return NextResponse.json({ message: "No hay órdenes pendientes", processed: 0 })
    }

    log.info(`Processing ${pendingOrders.length} pending orders`, "process_orders.batch", {
      count: pendingOrders.length,
    })

    let processed = 0
    let failed = 0

    for (const order of pendingOrders) {
      try {
        await supabase.from("pending_orders").update({ status: "processing" }).eq("id", order.id)

        // TODO: Obtener detalles completos de la orden desde la plataforma
        // TODO: Transformar al formato de Libral
        // TODO: Enviar a Libral usando sendLibralOrder()

        log.info(`Order ${order.platform_order_id} pending API implementation`, "process_orders.pending_api", {
          platform: order.platform,
        })

        await supabase
          .from("pending_orders")
          .update({
            status: "pending",
            error_message: "Esperando documentación de API de Libral para envío de pedidos",
            retry_count: order.retry_count + 1,
          })
          .eq("id", order.id)

        processed++
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error"
        log.error(`Error processing order ${order.id}`, error, "process_orders.order_error", { order_id: order.id })

        await supabase
          .from("pending_orders")
          .update({
            status: order.retry_count >= 2 ? "error" : "pending",
            error_message: msg,
            retry_count: order.retry_count + 1,
          })
          .eq("id", order.id)

        failed++
      }
    }

    log.info("Order processing complete", "process_orders.done", { processed, failed })

    return NextResponse.json({
      success: true,
      summary: { processed, failed },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    console.error("[process-orders] Fatal:", msg)
    return NextResponse.json({ ok: false, error: { code: "internal_error", detail: msg } }, { status: 500 })
  }
}
