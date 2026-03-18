import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: settings } = await supabase
      .from("report_settings")
      .select("*")
      .eq("report_type", "daily_sales")
      .single()

    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[v0] Error fetching settings:", error)
    return NextResponse.json({ error: "Error fetching settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from("report_settings")
      .update({
        enabled: body.enabled,
        email_recipients: body.email_recipients,
        send_time: body.send_time || "23:59:00",
        updated_at: new Date().toISOString()
      })
      .eq("report_type", "daily_sales")
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ settings: data })
  } catch (error) {
    console.error("[v0] Error saving settings:", error)
    return NextResponse.json({ error: "Error saving settings" }, { status: 500 })
  }
}
