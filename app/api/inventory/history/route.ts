import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = (page - 1) * limit

    console.log("[v0] Obteniendo historial de importaciones - página:", page, "límite:", limit)

    // Obtener el historial con JOIN a import_sources para obtener el nombre
    const { data: history, error: historyError } = await supabase
      .from("import_history")
      .select(
        `
        *,
        import_sources (
          id,
          name,
          description,
          feed_type
        )
      `,
      )
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (historyError) {
      console.error("[v0] Error al obtener historial:", historyError)
      return NextResponse.json({ error: historyError.message }, { status: 500 })
    }

    // Obtener el total de registros
    const { count, error: countError } = await supabase
      .from("import_history")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar historial:", countError)
    }

    console.log("[v0] Historial obtenido:", history?.length || 0, "registros")

    return NextResponse.json({
      history: history || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (error: any) {
    console.error("[v0] Error en endpoint de historial:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
