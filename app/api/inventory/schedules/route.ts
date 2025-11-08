import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Obtener schedules activos con información de la fuente
    const { data: schedules, error: schedulesError } = await supabase
      .from("import_schedules")
      .select(`
        *,
        import_sources (
          id,
          name,
          description,
          feed_type,
          last_import_at
        )
      `)
      .order("next_run_at", { ascending: true })

    if (schedulesError) {
      console.error("[v0] Error obteniendo schedules:", schedulesError)
      return NextResponse.json({ error: schedulesError.message }, { status: 500 })
    }

    // Obtener historial de importaciones (últimas 50)
    const { data: history, error: historyError } = await supabase
      .from("import_history")
      .select(`
        *,
        import_sources (
          id,
          name
        )
      `)
      .order("started_at", { ascending: false })
      .limit(50)

    if (historyError) {
      console.error("[v0] Error obteniendo historial:", historyError)
      return NextResponse.json({ error: historyError.message }, { status: 500 })
    }

    return NextResponse.json({
      schedules: schedules || [],
      history: history || [],
    })
  } catch (error: any) {
    console.error("[v0] Error en endpoint schedules:", error)
    return NextResponse.json(
      {
        error: error.message || "Error desconocido",
      },
      { status: 500 },
    )
  }
}
