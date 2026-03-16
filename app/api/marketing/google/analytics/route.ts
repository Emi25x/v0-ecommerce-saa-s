import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { getGA4Report, getGA4Realtime } from "@/lib/marketing/google"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("start_date") ?? formatDate(30)
  const endDate = searchParams.get("end_date") ?? formatDate(0)
  const realtime = searchParams.get("realtime") === "true"

  const supabase = createAdminClient()
  const { data: conn } = await supabase
    .from("marketing_connections")
    .select("credentials")
    .eq("platform", "google_analytics")
    .eq("is_active", true)
    .single()

  if (!conn) return NextResponse.json({ error: "Google Analytics no conectado" }, { status: 404 })

  try {
    if (realtime) {
      const data = await getGA4Realtime(conn.credentials)
      return NextResponse.json({ realtime: data })
    }
    const report = await getGA4Report(conn.credentials, { startDate, endDate })
    return NextResponse.json({ report, startDate, endDate })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function formatDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}
