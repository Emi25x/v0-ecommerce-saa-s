import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("*")
      .order("updated_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ ok: true, rates: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await req.json()
    const { from_currency, to_currency, rate, source = "manual", is_manual = true } = body

    if (!from_currency || !to_currency || rate == null)
      return NextResponse.json({ ok: false, error: "from_currency, to_currency, rate required" }, { status: 400 })

    const { data, error } = await supabase
      .from("exchange_rates")
      .upsert({ from_currency, to_currency, rate: Number(rate), source, is_manual,
                updated_at: new Date().toISOString() },
        { onConflict: "from_currency,to_currency" })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, rate: data })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { id }   = await req.json()
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 })
    const { error } = await supabase.from("exchange_rates").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
