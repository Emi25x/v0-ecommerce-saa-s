import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchRadarNews } from "@/lib/radar/fetch-news"

export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const secret = req.headers.get("x-cron-secret") ?? body.secret
  if (secret !== process.env.CRON_SECRET && secret !== process.env.NEXT_PUBLIC_CRON_SECRET) {
    // Allow manual trigger from UI without secret
    if (!body.manual) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await fetchRadarNews({ manual: !!body.manual })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function GET() {
  const supabase = createAdminClient()
  // Return recent news for UI polling
  const { data, error } = await supabase
    .from("editorial_radar_news")
    .select("id, title, source, url, published_at, detected_book, detected_author, project_type, project_status, confidence_score, opportunity_id, created_at")
    .order("published_at", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const { count } = await supabase
    .from("editorial_radar_news")
    .select("*", { count: "exact", head: true })
    .gte("confidence_score", 50)

  return NextResponse.json({ ok: true, rows: data ?? [], adaptations_count: count ?? 0 })
}
