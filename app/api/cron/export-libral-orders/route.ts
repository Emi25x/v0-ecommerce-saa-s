import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { runBatchExport } from "@/domains/integrations/libral-orders/service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/sales/export-libral
 *
 * Daily batch export of orders to Libral.
 * Window: yesterday 00:00 to 23:59:59 Argentina time.
 * Scheduled at 06:00 Argentina via Vercel cron.
 */
export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  // Calculate yesterday's window in Argentina timezone
  const nowArg = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }),
  )
  const yesterday = new Date(nowArg)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateFrom = new Date(yesterday)
  dateFrom.setHours(0, 0, 0, 0)

  const dateTo = new Date(yesterday)
  dateTo.setHours(23, 59, 59, 999)

  const result = await runBatchExport(dateFrom.toISOString(), dateTo.toISOString())

  return NextResponse.json(result)
}
