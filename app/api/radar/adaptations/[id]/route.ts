import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  try {
    const body = await req.json()
    const { data, error } = await supabase
      .from("editorial_radar_adaptations")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ ok: true, row: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  try {
    const { error } = await supabase
      .from("editorial_radar_adaptations")
      .delete()
      .eq("id", params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
