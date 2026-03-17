import { type NextRequest, NextResponse } from "next/server"
import { generateDailySalesReport, sendDailySalesEmail } from "@/lib/reports/daily-sales"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, send_email = false, email_recipients = [] } = body

    // Si se solicita envío por email
    if (send_email && email_recipients.length > 0) {
      const result = await sendDailySalesEmail({ date, email_recipients })

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: "Email enviado correctamente" })
    }

    // Devolver el archivo Excel para descarga
    const report = await generateDailySalesReport({ date })
    const targetDate = date || new Date().toISOString().split("T")[0]

    return new NextResponse(report.buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ventas-${targetDate}.xlsx"`
      }
    })

  } catch (error) {
    console.error("[v0] Error generando reporte:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error generando reporte" },
      { status: 500 }
    )
  }
}
