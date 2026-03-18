import { NextResponse } from "next/server"
import { fetchRadarNews } from "@/domains/radar/fetch-news"

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const expected   = `Bearer ${process.env.CRON_SECRET}`
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const data = await fetchRadarNews()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
