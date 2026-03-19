import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { runArnoiaStockImport } from "@/domains/suppliers/arnoia/stock-import"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Vercel Cron invoca con GET — delegar a POST
export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  return POST(request)
}

export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  const result = await runArnoiaStockImport()
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
