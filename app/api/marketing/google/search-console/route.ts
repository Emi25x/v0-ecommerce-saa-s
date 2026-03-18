import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { getSearchConsoleData } from "@/domains/marketing/google"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("start_date") ?? formatDate(30)
  const endDate = searchParams.get("end_date") ?? formatDate(3) // Search Console has ~3 day lag
  const dimension = searchParams.get("dimension") ?? "query"

  const supabase = createAdminClient()
  const { data: conn } = await supabase
    .from("marketing_connections")
    .select("credentials")
    .eq("platform", "google_search_console")
    .eq("is_active", true)
    .single()

  if (!conn) return NextResponse.json({ error: "Search Console no conectado" }, { status: 404 })

  try {
    const rows = await getSearchConsoleData(conn.credentials, {
      startDate, endDate,
      dimensions: [dimension],
    })
    return NextResponse.json({ rows, dimension, startDate, endDate })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function formatDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}
