/**
 * GET  /api/competition/reprice-config?ml_item_id=MLA...   → config de 1 ítem
 * GET  /api/competition/reprice-config?account_id=UUID     → todos los ítems de la cuenta
 * POST /api/competition/reprice-config                      → crear / actualizar config
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const supabase  = await createClient()
    const { searchParams } = new URL(req.url)
    const ml_item_id = searchParams.get("ml_item_id")
    const account_id = searchParams.get("account_id")

    if (ml_item_id) {
      const { data, error } = await supabase
        .from("repricing_config")
        .select("*")
        .eq("ml_item_id", ml_item_id)
        .maybeSingle()

      if (error) throw error
      return NextResponse.json({ ok: true, config: data ?? null })
    }

    if (account_id) {
      const { data, error } = await supabase
        .from("repricing_config")
        .select("*")
        .eq("account_id", account_id)
        .order("updated_at", { ascending: false })

      if (error) throw error
      return NextResponse.json({ ok: true, configs: data ?? [] })
    }

    // Sin filtro: devolver todos los habilitados
    const { data, error } = await supabase
      .from("repricing_config")
      .select("*")
      .eq("enabled", true)
      .order("updated_at", { ascending: false })

    if (error) throw error
    return NextResponse.json({ ok: true, configs: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      ml_item_id,
      account_id,
      enabled      = false,
      min_price,
      max_price    = null,
      target_price = null,
      strategy     = "win_buybox",
    } = body

    if (!ml_item_id || min_price === undefined || min_price === null || min_price === "") {
      return NextResponse.json({ ok: false, error: "ml_item_id y min_price son requeridos" }, { status: 400 })
    }

    const minPriceNum    = Number(min_price)
    const maxPriceNum    = max_price    !== null ? Number(max_price)    : null
    const targetPriceNum = target_price !== null ? Number(target_price) : null

    if (isNaN(minPriceNum) || minPriceNum <= 0) {
      return NextResponse.json({ ok: false, error: "min_price debe ser mayor a 0" }, { status: 400 })
    }
    if (maxPriceNum !== null && maxPriceNum <= minPriceNum) {
      return NextResponse.json({ ok: false, error: "max_price debe ser mayor que min_price" }, { status: 400 })
    }

    const supabase = await createClient()

    const validStrategies = ["win_buybox", "follow_competitor", "maximize_margin_if_alone"]
    const strategyVal = validStrategies.includes(strategy) ? strategy : "win_buybox"

    const { data, error } = await supabase
      .from("repricing_config")
      .upsert(
        {
          ml_item_id,
          account_id:   account_id ?? null,
          enabled,
          min_price:    minPriceNum,
          max_price:    maxPriceNum,
          target_price: targetPriceNum,
          strategy:     strategyVal,
          updated_at:   new Date().toISOString(),
        },
        { onConflict: "ml_item_id" },
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, config: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
