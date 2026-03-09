import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  const body = await req.json()
  const { error } = await supabase
    .from("editorial_radar_sources")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("editorial_radar_sources")
    .delete()
    .eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
