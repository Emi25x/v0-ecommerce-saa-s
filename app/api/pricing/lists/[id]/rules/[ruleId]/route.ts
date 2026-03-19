import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params
  const supabase = createAdminClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from("price_list_fee_rules")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("list_id", id)
    .select()
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, rule: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from("price_list_fee_rules").delete().eq("id", ruleId).eq("list_id", id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
