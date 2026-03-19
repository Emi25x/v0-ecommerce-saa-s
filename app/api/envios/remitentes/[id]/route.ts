import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

// PATCH /api/envios/remitentes/[id] — actualizar
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const body = await req.json()

  const update: Record<string, any> = {}
  if (body.nombre !== undefined) update.nombre = body.nombre
  if (body.direccion !== undefined) update.direccion = body.direccion
  if (body.localidad !== undefined) update.localidad = body.localidad
  if (body.provincia !== undefined) update.provincia = body.provincia
  if (body.cp !== undefined) update.cp = body.cp
  if (body.telefono !== undefined) update.telefono = body.telefono || null
  if (body.email !== undefined) update.email = body.email || null
  if (body.es_default !== undefined) {
    // Si se marca como default, quitar el anterior
    if (body.es_default) {
      await supabase.from("remitentes").update({ es_default: false }).eq("es_default", true).neq("id", id)
    }
    update.es_default = body.es_default
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data, error } = await supabase.from("remitentes").update(update).eq("id", id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/envios/remitentes/[id] — eliminar
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from("remitentes").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
