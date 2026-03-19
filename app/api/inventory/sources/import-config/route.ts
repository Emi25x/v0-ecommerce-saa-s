import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const sources = body?.sources
  if (!Array.isArray(sources) || sources.length === 0) {
    return NextResponse.json(
      { error: "El JSON debe contener un array 'sources' con al menos una fuente" },
      { status: 400 },
    )
  }

  // Validar que cada fuente tenga id y name
  for (const s of sources) {
    if (!s.id || !s.name) {
      return NextResponse.json({ error: `Fuente inválida: falta id o name` }, { status: 400 })
    }
  }

  const rows = sources.map((s: any) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    url_template: s.url_template,
    auth_type: s.auth_type ?? "none",
    credentials: s.credentials ?? {},
    feed_type: s.feed_type ?? null,
    column_mapping: s.column_mapping ?? {},
    is_active: s.is_active ?? true,
    delimiter: s.delimiter ?? null,
  }))

  const { error } = await supabase.from("import_sources").upsert(rows, { onConflict: "id" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    restored: rows.length,
    names: rows.map((r) => r.name),
  })
}
