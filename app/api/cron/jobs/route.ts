/**
 * Cron handler: runs every 12 hours via Vercel Cron.
 * Dispatches:
 *   1. calculate_ml_publish_priorities — recalculates all product scores
 *   2. update_industry_news            — fetches RSS feeds & detects adaptations
 */
import { NextResponse } from "next/server"
import { calculateMlPriorities } from "@/domains/mercadolibre/priorities"
import { fetchRadarNews } from "@/lib/radar/fetch-news"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const secret = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  // 1. Calculate ML publish priorities
  try {
    results.ml_priorities = await calculateMlPriorities()
  } catch (e: any) {
    results.ml_priorities = { error: e.message }
  }

  // 2. Fetch & process industry news RSS feeds
  try {
    results.industry_news = await fetchRadarNews({ manual: false })
  } catch (e: any) {
    results.industry_news = { error: e.message }
  }

  return NextResponse.json({
    ok:        true,
    timestamp: new Date().toISOString(),
    results,
  })
}
