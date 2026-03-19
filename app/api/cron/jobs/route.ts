/**
 * Cron handler: runs every 12 hours via Vercel Cron.
 * Dispatches:
 *   1. calculate_ml_publish_priorities — recalculates all product scores
 *   2. update_industry_news            — fetches RSS feeds & detects adaptations
 */
import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { calculateMlPriorities } from "@/domains/mercadolibre/priorities"
import { fetchRadarNews } from "@/domains/radar/fetch-news"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const auth = await requireCron(req)
  if (auth.error) return auth.response

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
    ok: true,
    timestamp: new Date().toISOString(),
    results,
  })
}
