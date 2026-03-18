import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("price_list_fee_rules")
    .select("*")
    .eq("list_id", params.id)
    .order("sort_order")
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, rules: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  const body     = await req.json()
  const { data, error } = await supabase
    .from("price_list_fee_rules")
    .insert({ ...body, list_id: params.id })
    .select()
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, rule: data })
}
