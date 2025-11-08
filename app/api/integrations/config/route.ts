import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const integration = searchParams.get("integration")

    if (!integration) {
      return NextResponse.json({ error: "Integration name required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("integration_configs")
      .select("*")
      .eq("integration_name", integration)
      .single()

    if (error && error.code !== "PGRST116") {
      throw error
    }

    return NextResponse.json({ config: data || null })
  } catch (error) {
    console.error("[v0] Error fetching integration config:", error)
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { integration, credentials } = body

    if (!integration || !credentials) {
      return NextResponse.json({ error: "Integration name and credentials required" }, { status: 400 })
    }

    // Upsert configuration
    const { data, error } = await supabase
      .from("integration_configs")
      .upsert(
        {
          integration_name: integration,
          credentials,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "integration_name",
        },
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, config: data })
  } catch (error) {
    console.error("[v0] Error saving integration config:", error)
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 })
  }
}
