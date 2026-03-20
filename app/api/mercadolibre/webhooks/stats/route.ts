import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verificar si las tablas existen
    const { data: queueData, error: queueError } = await supabase
      .from("ml_webhook_queue")
      .select("*", { count: "exact", head: true })

    if (queueError) {
      if (queueError.message?.includes("relation") || queueError.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            error: "Las tablas de webhooks no existen",
            needsMigration: true,
          },
          { status: 500 },
        )
      }
      throw queueError
    }

    // Obtener estadísticas
    const { data: allNotifications, error: allError } = await supabase
      .from("ml_webhook_queue")
      .select("topic, processed, error_message")

    if (allError) throw allError

    const notifications = allNotifications || []

    const stats = {
      total: notifications.length,
      pending: notifications.filter((n) => !n.processed).length,
      processed: notifications.filter((n) => n.processed && !n.error_message).length,
      failed: notifications.filter((n) => n.error_message).length,
      orders: notifications.filter((n) => n.topic === "orders_v2").length,
      shipments: notifications.filter((n) => n.topic === "shipments").length,
      items: notifications.filter((n) => n.topic === "items").length,
    }

    // Obtener notificaciones recientes
    const { data: recent, error: recentError } = await supabase
      .from("ml_webhook_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    if (recentError) throw recentError

    return NextResponse.json({
      stats,
      recent: recent || [],
    })
  } catch (error) {
    console.error("[webhooks/stats] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch stats"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
