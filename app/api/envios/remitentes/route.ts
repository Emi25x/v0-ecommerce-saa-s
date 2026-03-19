import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

// GET /api/envios/remitentes — listar todos
export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("remitentes")
    .select("*")
    .order("es_default", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/envios/remitentes — crear nuevo
export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const body = await req.json()

  const { nombre, direccion, localidad, provincia, cp, telefono, email, es_default } = body

  if (!nombre || !direccion || !localidad || !provincia || !cp) {
    return NextResponse.json({ error: "nombre, direccion, localidad, provincia y cp son requeridos" }, { status: 400 })
  }

  // Si es_default, quitar el default anterior
  if (es_default) {
    await supabase.from("remitentes").update({ es_default: false }).eq("es_default", true)
  }

  const { data, error } = await supabase
    .from("remitentes")
    .insert({
      nombre,
      direccion,
      localidad,
      provincia,
      cp,
      telefono: telefono || null,
      email: email || null,
      es_default: !!es_default,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
