import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; ruleId: string } }
) {
  const supabase = await createClient({ useServiceRole: true })
  const body     = await req.json()
  const { data, error } = await supabase
    .from("price_list_fee_rules")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", params.ruleId)
    .eq("list_id", params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, rule: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; ruleId: string } }
) {
  const supabase = await createClient({ useServiceRole: true })
  const { error } = await supabase
    .from("price_list_fee_rules")
    .delete()
    .eq("id", params.ruleId)
    .eq("list_id", params.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
