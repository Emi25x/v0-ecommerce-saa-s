import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("price_lists")
      .select(`*, rules:price_list_rules(*), fee_rules:price_list_fee_rules(*), warehouse:warehouses(id,name,base_currency,code)`)
      .eq("id", params.id)
      .single()
    if (error) throw error
    return NextResponse.json({ ok: true, list: data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const body     = await req.json()
    const { rules, fee_rules, ...listFields } = body

    // Update list header
    if (Object.keys(listFields).length > 0) {
      const { error } = await supabase
        .from("price_lists")
        .update({ ...listFields, updated_at: new Date().toISOString() })
        .eq("id", params.id)
      if (error) throw error
    }

    // Upsert rules
    if (rules) {
      const { error } = await supabase
        .from("price_list_rules")
        .upsert({ ...rules, price_list_id: params.id, updated_at: new Date().toISOString() },
          { onConflict: "price_list_id" })
      if (error) throw error
    }

    // Replace fee_rules
    if (fee_rules) {
      await supabase.from("price_list_fee_rules").delete().eq("price_list_id", params.id)
      if (fee_rules.length > 0) {
        const rows = fee_rules.map((r: any) => ({ ...r, price_list_id: params.id }))
        const { error } = await supabase.from("price_list_fee_rules").insert(rows)
        if (error) throw error
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from("price_lists").delete().eq("id", params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
