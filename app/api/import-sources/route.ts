import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    console.log("[v0] GET /api/import-sources - Iniciando...")
    const supabase = await createClient()

    const { data, error } = await supabase.from("import_sources").select("*").order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error en query import_sources:", error)
      throw error
    }

    console.log("[v0] Fuentes de importación encontradas:", data?.length || 0)
    console.log("[v0] Datos:", data)

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error fetching import sources:", error)
    return NextResponse.json({ error: "Error fetching import sources" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("import_sources")
      .insert({
        name: body.name,
        description: body.description,
        url_template: body.url_template,
        auth_type: body.auth_type || "query_params",
        credentials: body.credentials,
        feed_type: body.feed_type,
        column_mapping: body.column_mapping,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error creating import source:", error)
    return NextResponse.json({ error: "Error creating import source" }, { status: 500 })
  }
}
