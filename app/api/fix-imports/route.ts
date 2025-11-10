import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data, error } = await supabase
      .from("import_history")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      })
      .eq("status", "in_progress")
      .select()

    if (error) {
      console.error("[v0] Error limpiando importaciones:", error)
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 },
      )
    }

    console.log(`[v0] ${data.length} importaciones canceladas:`, data)

    return NextResponse.json({
      success: true,
      fixed: data.length,
      imports: data,
    })
  } catch (error: any) {
    console.error("[v0] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
