import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    console.log("[v0] Consultando TODAS las importaciones...")
    const { data: allImports, error: allError } = await supabase
      .from("import_history")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10)

    console.log("[v0] Todas las importaciones:", JSON.stringify(allImports, null, 2))

    if (allError) {
      console.error("[v0] Error consultando importaciones:", allError)
      return NextResponse.json(
        {
          success: false,
          error: allError.message,
        },
        { status: 500 },
      )
    }

    const { data, error } = await supabase
      .from("import_history")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        error_message: "Importación cancelada automáticamente (limpieza de importaciones atascadas)",
      })
      .eq("status", "running")
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
