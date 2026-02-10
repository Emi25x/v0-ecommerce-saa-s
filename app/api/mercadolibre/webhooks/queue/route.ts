import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { count, error } = await supabase
      .from("ml_webhook_queue")
      .select("*", { count: "exact", head: true })
      .eq("processed", false)

    // If table doesn't exist, error code will be 42P01 (undefined_table)
    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        console.log("[v0] Webhook queue table does not exist yet")
        return NextResponse.json({ count: 0, message: "Webhook queue not configured" })
      }
      console.error("[v0] Error fetching queue count:", error)
      return NextResponse.json({ count: 0, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch (error) {
    console.error("[v0] Error in queue endpoint:", error)
    return NextResponse.json({ count: 0, error: "Internal server error" }, { status: 500 })
  }
}
