import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const trackingId = searchParams.get("tracking_id")

    if (!trackingId) {
      return NextResponse.json({ success: false, error: "tracking_id requerido" }, { status: 400 })
    }

    // Obtener los últimos snapshots (últimas 24 horas)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: snapshots, error } = await supabase
      .from("competition_snapshots")
      .select("*")
      .eq("tracking_id", trackingId)
      .gte("created_at", twentyFourHoursAgo)
      .order("position_in_search", { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, snapshots })
  } catch (error: any) {
    console.error("Error fetching snapshots:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
