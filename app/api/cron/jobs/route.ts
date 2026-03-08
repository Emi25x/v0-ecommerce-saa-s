/**
 * Cron handler: runs every 12 hours via Vercel Cron.
 * Dispatches:
 *   1. calculate_ml_publish_priorities — recalculates all product scores
 *   2. update_industry_news            — fetches RSS feeds & detects adaptations
 */
import { NextResponse } from "next/server"

export const maxDuration = 120

export async function GET(req: Request) {
  const secret = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : "http://localhost:3000"

  const results: Record<string, unknown> = {}

  // 1. Calculate ML publish priorities
  try {
    const res  = await fetch(`${base}/api/ml/priorities/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    results.ml_priorities = await res.json()
  } catch (e: any) {
    results.ml_priorities = { error: e.message }
  }

  // 2. Fetch & process industry news RSS feeds
  try {
    const res  = await fetch(`${base}/api/radar/news/fetch`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "x-cron-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ manual: false }),
    })
    results.industry_news = await res.json()
  } catch (e: any) {
    results.industry_news = { error: e.message }
  }

  return NextResponse.json({
    ok:        true,
    timestamp: new Date().toISOString(),
    results,
  })
}
