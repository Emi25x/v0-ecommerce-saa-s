import { NextResponse } from "next/server"

// Cron job: update_industry_news — runs every 12 hours via Vercel Cron
// Add to vercel.json: { "crons": [{ "path": "/api/cron/update-industry-news", "schedule": "0 */12 * * *" }] }

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const expected   = `Bearer ${process.env.CRON_SECRET}`
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const base = process.env.APP_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL ?? "http://localhost:3000"
  const url  = base.startsWith("http") ? base : `https://${base}`

  const res = await fetch(`${url}/api/radar/news/fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": process.env.CRON_SECRET ?? "",
    },
    body: JSON.stringify({}),
  })

  const data = await res.json().catch(() => ({ error: "parse error" }))
  return NextResponse.json({ ok: res.ok, ...data })
}
