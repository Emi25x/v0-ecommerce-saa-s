/**
 * GET  /api/competition/reprice-config?ml_item_id=MLA...   → config de 1 ítem
 * GET  /api/competition/reprice-config?account_id=UUID     → todos los ítems de la cuenta
 * POST /api/competition/reprice-config                      → crear / actualizar config
 *
 * ── Migrado a ml_price_strategies (fuente de verdad única) ──
 * Mantiene la misma interfaz que el legacy repricing_config para
 * compatibilidad con la UI, pero lee/escribe ml_price_strategies.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

const VALID_STRATEGIES = [
  "win_buybox",
  "follow_competitor",
  "maximize_margin_if_alone",
  "cost_plus",
  "hybrid",
] as const

/** Map ml_price_strategies row → legacy-compatible shape for UI */
function toConfigShape(row: any) {
  return {
    id: row.id,
    ml_item_id: row.ml_item_id,
    account_id: row.account_id,
    enabled: row.enabled,
    min_price: row.min_price,
    max_price: row.max_price,
    target_price: row.max_price, // legacy UI expects target_price
    strategy: row.strategy,
    // Modern fields exposed to UI
    delta_amount: row.delta_amount,
    delta_pct: row.delta_pct,
    raise_step_amount: row.raise_step_amount,
    raise_step_pct: row.raise_step_pct,
    delay_seconds: row.delay_seconds,
    // State fields
    last_run_at: row.last_reprice_at,
    last_status: row.last_status,
    last_our_price: row.last_our_price,
    last_price_to_win: row.last_price_to_win,
    last_competitor_price: row.last_competitor_price,
    last_error: row.last_error,
    updated_at: row.updated_at,
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(req.url)
    const ml_item_id = searchParams.get("ml_item_id")
    const account_id = searchParams.get("account_id")

    const select = `
      id, ml_item_id, account_id, enabled,
      strategy, min_price, max_price,
      delta_amount, delta_pct,
      raise_step_amount, raise_step_pct,
      delay_seconds,
      last_reprice_at, last_status, last_our_price,
      last_price_to_win, last_competitor_price, last_error,
      updated_at
    `

    if (ml_item_id) {
      const { data, error } = await supabase
        .from("ml_price_strategies")
        .select(select)
        .eq("ml_item_id", ml_item_id)
        .maybeSingle()

      if (error) throw error
      return NextResponse.json({ ok: true, config: data ? toConfigShape(data) : null })
    }

    if (account_id) {
      const { data, error } = await supabase
        .from("ml_price_strategies")
        .select(select)
        .eq("account_id", account_id)
        .order("updated_at", { ascending: false })

      if (error) throw error
      return NextResponse.json({ ok: true, configs: (data ?? []).map(toConfigShape) })
    }

    // Sin filtro: devolver todos los habilitados
    const { data, error } = await supabase
      .from("ml_price_strategies")
      .select(select)
      .eq("enabled", true)
      .order("updated_at", { ascending: false })

    if (error) throw error
    return NextResponse.json({ ok: true, configs: (data ?? []).map(toConfigShape) })
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
      enabled = false,
      min_price,
      max_price = null,
      target_price = null,
      strategy = "win_buybox",
      // Modern fields (optional)
      delta_amount = null,
      delta_pct = null,
      raise_step_amount = null,
      raise_step_pct = null,
      delay_seconds = 3600,
    } = body

    if (!ml_item_id || min_price === undefined || min_price === null || min_price === "") {
      return NextResponse.json({ ok: false, error: "ml_item_id y min_price son requeridos" }, { status: 400 })
    }

    const minPriceNum = Number(min_price)
    // Use max_price if provided, otherwise fall back to target_price (legacy compat)
    const effectiveMax = max_price ?? target_price
    const maxPriceNum = effectiveMax !== null && effectiveMax !== "" ? Number(effectiveMax) : null
    const deltaAmountNum = delta_amount !== null ? Number(delta_amount) : null
    const deltaPctNum = delta_pct !== null ? Number(delta_pct) : null

    if (isNaN(minPriceNum) || minPriceNum <= 0) {
      return NextResponse.json({ ok: false, error: "min_price debe ser mayor a 0" }, { status: 400 })
    }
    if (maxPriceNum !== null && maxPriceNum <= minPriceNum) {
      return NextResponse.json({ ok: false, error: "max_price debe ser mayor que min_price" }, { status: 400 })
    }

    const supabase = await createClient()

    const strategyVal = VALID_STRATEGIES.includes(strategy as any) ? strategy : "win_buybox"

    const { data, error } = await supabase
      .from("ml_price_strategies")
      .upsert(
        {
          ml_item_id,
          account_id: account_id ?? null,
          enabled,
          min_price: minPriceNum,
          max_price: maxPriceNum,
          strategy: strategyVal,
          delta_amount: deltaAmountNum,
          delta_pct: deltaPctNum,
          raise_step_amount: raise_step_amount !== null ? Number(raise_step_amount) : null,
          raise_step_pct: raise_step_pct !== null ? Number(raise_step_pct) : null,
          delay_seconds: Number(delay_seconds) || 3600,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ml_item_id" },
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, config: toConfigShape(data) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
