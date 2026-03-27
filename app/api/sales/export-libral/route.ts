/**
 * POST /api/sales/export-libral
 *
 * Batch export diario de ventas a Libral.
 * Ventana: día anterior en timezone America/Argentina/Buenos_Aires.
 * Llamado por cron a las 06:00 Argentina.
 *
 * También acepta ?from=ISO&to=ISO para ventanas custom (debug/manual).
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { runBatchExport } from "@/domains/integrations/libral-orders/service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  // Default: ventana del día anterior en timezone Argentina
  const { searchParams } = new URL(request.url)
  let dateFrom = searchParams.get("from")
  let dateTo = searchParams.get("to")

  if (!dateFrom || !dateTo) {
    // Calcular ventana del día anterior en America/Argentina/Buenos_Aires
    const nowArg = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }),
    )
    const yesterday = new Date(nowArg)
    yesterday.setDate(yesterday.getDate() - 1)

    // 00:00:00 del día anterior en Argentina (UTC-3 = +03:00)
    const y = yesterday.getFullYear()
    const m = String(yesterday.getMonth() + 1).padStart(2, "0")
    const d = String(yesterday.getDate()).padStart(2, "0")
    dateFrom = `${y}-${m}-${d}T03:00:00.000Z` // 00:00 Argentina = 03:00 UTC
    dateTo = `${y}-${m}-${String(yesterday.getDate() + 1).padStart(2, "0")}T03:00:00.000Z`

    // Handle month boundary
    const fromDate = new Date(`${y}-${m}-${d}T03:00:00.000Z`)
    const toDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000)
    dateFrom = fromDate.toISOString()
    dateTo = toDate.toISOString()
  }

  const result = await runBatchExport(dateFrom, dateTo)

  return NextResponse.json({
    ...result,
    window: { from: dateFrom, to: dateTo },
  })
}

// Vercel cron invoca con GET
export async function GET(request: NextRequest) {
  return POST(request)
}
