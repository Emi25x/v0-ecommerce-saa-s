import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { getMetaAdsCampaigns, getMetaAccountInfo } from "@/domains/marketing/meta"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("start_date") ?? formatDate(30)
  const endDate = searchParams.get("end_date") ?? formatDate(0)

  const supabase = createAdminClient()
  const { data: conn } = await supabase
    .from("marketing_connections")
    .select("credentials")
    .eq("platform", "meta_ads")
    .eq("is_active", true)
    .single()

  if (!conn) return NextResponse.json({ error: "Meta Ads no conectado" }, { status: 404 })

  try {
    const [campaigns, account] = await Promise.all([
      getMetaAdsCampaigns(conn.credentials, { startDate, endDate }),
      getMetaAccountInfo(conn.credentials).catch(() => null),
    ])

    const totals = campaigns.reduce((acc: any, c: any) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      spend: acc.spend + c.spend,
      conversions: acc.conversions + c.conversions,
      conversion_value: acc.conversion_value + c.conversion_value,
      reach: acc.reach + c.reach,
    }), { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversion_value: 0, reach: 0 })

    totals.roas = totals.spend > 0 ? totals.conversion_value / totals.spend : 0
    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0

    return NextResponse.json({ campaigns, totals, account, startDate, endDate })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function formatDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}
