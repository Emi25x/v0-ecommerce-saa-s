import { type NextRequest, NextResponse } from "next/server"
import { runArnoiaStockImport } from "@/domains/suppliers/arnoia/stock-import"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Vercel Cron invoca con GET — delegar a POST
export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(_request: NextRequest) {
  const result = await runArnoiaStockImport()
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result)
}
