import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("price_list_assignments")
      .select(`*, list:price_lists(id, name, channel, currency, pricing_base, is_active)`)
      .order("priority", { ascending: false })
    if (error) throw error
    return NextResponse.json({ ok: true, assignments: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await req.json()
    const { price_list_id, entity_type, entity_id, priority = 0, is_active = true } = body

    if (!price_list_id || !entity_type || !entity_id)
      return NextResponse.json({ ok: false, error: "price_list_id, entity_type, entity_id required" }, { status: 400 })

    const { data, error } = await supabase
      .from("price_list_assignments")
      .upsert({ price_list_id, entity_type, entity_id, priority, is_active,
                updated_at: new Date().toISOString() },
        { onConflict: "entity_type,entity_id" })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, assignment: data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { id }   = await req.json()
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 })
    const { error } = await supabase.from("price_list_assignments").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
