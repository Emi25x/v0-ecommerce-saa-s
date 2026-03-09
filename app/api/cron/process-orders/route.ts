import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Se ejecuta cada 15 minutos

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    console.log("[v0] ===== PROCESANDO ÓRDENES PENDIENTES =====")

    const supabase = await createClient()

    // Obtener órdenes pendientes
    const { data: pendingOrders, error } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("status", "pending")
      .lt("retry_count", 3) // Máximo 3 reintentos
      .order("created_at", { ascending: true })
      .limit(50)

    if (error) {
      console.error("[v0] Error obteniendo órdenes pendientes:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      console.log("[v0] No hay órdenes pendientes para procesar")
      return NextResponse.json({ message: "No hay órdenes pendientes", processed: 0 })
    }

    console.log(`[v0] Procesando ${pendingOrders.length} órdenes pendientes`)

    let processed = 0
    let failed = 0

    for (const order of pendingOrders) {
      try {
        // Marcar como procesando
        await supabase.from("pending_orders").update({ status: "processing" }).eq("id", order.id)

        // TODO: Obtener detalles completos de la orden desde la plataforma
        // TODO: Transformar al formato de Libral
        // TODO: Enviar a Libral usando sendLibralOrder()

        console.log(`[v0] Orden ${order.platform_order_id} de ${order.platform} - Esperando implementación de API`)

        // Por ahora, marcar como pendiente hasta tener la documentación de la API
        await supabase
          .from("pending_orders")
          .update({
            status: "pending",
            error_message: "Esperando documentación de API de Libral para envío de pedidos",
            retry_count: order.retry_count + 1,
          })
          .eq("id", order.id)

        processed++
      } catch (error: any) {
        console.error(`[v0] Error procesando orden ${order.id}:`, error)

        await supabase
          .from("pending_orders")
          .update({
            status: order.retry_count >= 2 ? "error" : "pending",
            error_message: error.message,
            retry_count: order.retry_count + 1,
          })
          .eq("id", order.id)

        failed++
      }
    }

    console.log("[v0] ===== RESUMEN PROCESAMIENTO ÓRDENES =====")
    console.log(`[v0] Órdenes procesadas: ${processed}`)
    console.log(`[v0] Órdenes con error: ${failed}`)
    console.log("[v0] ===== FIN PROCESAMIENTO =====")

    return NextResponse.json({
      success: true,
      summary: {
        processed,
        failed,
      },
    })
  } catch (error: any) {
    console.error("[v0] Error en procesamiento de órdenes:", error)
    return NextResponse.json(
      {
        error: error.message || "Error desconocido",
        details: error.toString(),
      },
      { status: 500 },
    )
  }
}
