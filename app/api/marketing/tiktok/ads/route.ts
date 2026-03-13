import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { getTikTokCampaigns, getTikTokReport } from "@/lib/marketing/tiktok"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("start_date") ?? formatDate(30)
  const endDate = searchParams.get("end_date") ?? formatDate(0)

  const supabase = createAdminClient()
  const { data: conn } = await supabase
    .from("marketing_connections")
    .select("credentials")
    .eq("platform", "tiktok_ads")
    .eq("is_active", true)
    .single()

  if (!conn) return NextResponse.json({ error: "TikTok Ads no conectado" }, { status: 404 })

  try {
    const [campaigns, report] = await Promise.all([
      getTikTokCampaigns(conn.credentials, { startDate, endDate }),
      getTikTokReport(conn.credentials, { startDate, endDate }),
    ])
    return NextResponse.json({ campaigns, report, startDate, endDate })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function formatDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}
