import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { sendDailySalesEmail } from "@/domains/radar/daily-sales"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  try {
    console.log("[v0] Cron: Ejecutando reporte diario de ventas")

    const supabase = await createClient()

    // Obtener configuración
    const { data: settings } = await supabase
      .from("report_settings")
      .select("*")
      .eq("report_type", "daily_sales")
      .single()

    if (!settings || !settings.enabled) {
      console.log("[v0] Reporte automático desactivado")
      return NextResponse.json({ message: "Reporte automático desactivado" })
    }

    if (!settings.email_recipients || settings.email_recipients.length === 0) {
      console.log("[v0] No hay destinatarios configurados")
      return NextResponse.json({ message: "No hay destinatarios" })
    }

    const result = await sendDailySalesEmail({
      date: new Date().toISOString().split("T")[0],
      email_recipients: settings.email_recipients,
    })

    if (!result.success) {
      throw new Error(result.error || "Error enviando reporte")
    }

    console.log("[v0] Reporte enviado exitosamente a:", settings.email_recipients)

    return NextResponse.json({
      success: true,
      message: "Reporte enviado",
      recipients: settings.email_recipients,
    })
  } catch (error) {
    console.error("[v0] Error en cron de reportes:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 })
  }
}
