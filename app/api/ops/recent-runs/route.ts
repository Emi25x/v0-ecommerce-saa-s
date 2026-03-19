import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from("process_runs")
      .select("process_type, process_name, status, started_at, duration_ms, rows_processed, rows_updated, rows_failed, error_message")
      .order("started_at", { ascending: false })
      .limit(10)

    if (error) {
      // Table may not exist — graceful degradation
      return NextResponse.json({ runs: [] })
    }

    return NextResponse.json({ runs: data ?? [] })
  } catch {
    return NextResponse.json({ runs: [] })
  }
}
