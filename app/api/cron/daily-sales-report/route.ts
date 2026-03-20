import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { sendDailySalesEmail } from "@/domains/radar/daily-sales"
import { requireCron } from "@/lib/auth/require-auth"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  const log = createStructuredLogger({ request_id: genRequestId() })

  try {
    log.info("Executing daily sales report", "daily_sales.start")

    const supabase = await createClient()

    const { data: settings } = await supabase
      .from("report_settings")
      .select("*")
      .eq("report_type", "daily_sales")
      .single()

    if (!settings || !settings.enabled) {
      return NextResponse.json({ message: "Reporte automático desactivado" })
    }

    if (!settings.email_recipients || settings.email_recipients.length === 0) {
      return NextResponse.json({ message: "No hay destinatarios" })
    }

    const result = await sendDailySalesEmail({
      date: new Date().toISOString().split("T")[0],
      email_recipients: settings.email_recipients,
    })

    if (!result.success) {
      throw new Error(result.error || "Error enviando reporte")
    }

    log.info("Report sent successfully", "daily_sales.sent", { recipients: settings.email_recipients })

    return NextResponse.json({
      success: true,
      message: "Reporte enviado",
      recipients: settings.email_recipients,
    })
  } catch (error) {
    log.error("Error in daily sales cron", error, "daily_sales.fatal")
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 })
  }
}
