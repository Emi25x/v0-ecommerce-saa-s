import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { requireCron } from "@/lib/auth/require-auth"

export async function GET(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response

  try {
    const supabase = await createClient()

    console.log("[v0] Fetching import sources...")

    const { data: sources, error: sourcesError } = await supabase
      .from("import_sources")
      .select("*")
      .order("created_at", { ascending: false })

    if (sourcesError) {
      console.error("[v0] Error fetching sources:", sourcesError)
      return NextResponse.json(
        {
          error: "Error al obtener fuentes: " + sourcesError.message,
          hint: "Verifica que la tabla import_sources exista en la base de datos.",
        },
        { status: 500 },
      )
    }

    console.log("[v0] Found sources:", sources?.length || 0)

    const { data: history, error: historyError } = await supabase
      .from("import_history")
      .select("source_id, started_at, completed_at, status, products_imported, products_updated, products_failed")
      .order("started_at", { ascending: false })

    if (historyError) {
      console.error("[v0] Error fetching history:", historyError)
      console.log("[v0] Continuing without history")
    }

    console.log("[v0] Found history records:", history?.length || 0)

    const sourcesWithData = sources.map((source) => ({
      ...source,
      last_import: history?.find((h) => h.source_id === source.id),
    }))

    console.log("[v0] Returning sources with data:", sourcesWithData.length)

    return NextResponse.json({ sources: sourcesWithData })
  } catch (error: any) {
    console.error("[v0] Error in sources API:", error)
    return NextResponse.json(
      {
        error: error.message || "Error desconocido",
      },
      { status: 500 },
    )
  }
}
