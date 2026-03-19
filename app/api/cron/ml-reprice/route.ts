/**
 * GET /api/cron/ml-reprice
 *
 * Motor de repricing — 5 estrategias.
 * Lee ml_price_strategies, aplica calcReprice, actualiza ML + DB.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { requireCron } from "@/lib/auth/require-auth"
import {
  calcReprice,
  persistRepriceState,
  createRepriceJob,
  type Strategy,
} from "@/domains/mercadolibre/repricing-engine"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const ML_API = "https://api.mercadolibre.com"

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(req: NextRequest) {
  const auth = await requireCron(req)
  if (auth.error) return auth.response

  const supabase = sb()
  const startedAt = Date.now()
  const now = new Date()

  // 1. Load enabled strategies
  const { data: strategies, error: strErr } = await supabase
    .from("ml_price_strategies")
    .select(
      `
      id, account_id, ml_item_id, product_id,
      strategy, min_price, max_price,
      delta_amount, delta_pct,
      target_margin_pct, raise_step_amount, raise_step_pct,
      use_price_to_win, delay_seconds,
      last_reprice_at, last_our_price
    `,
    )
    .eq("enabled", true)
    .order("last_reprice_at", { ascending: true, nullsFirst: true })

  if (strErr) {
    console.error("[ml-reprice] Error leyendo estrategias:", strErr.message)
    return NextResponse.json({ ok: false, error: strErr.message }, { status: 500 })
  }

  if (!strategies?.length) {
    return NextResponse.json({ ok: true, message: "Sin ítems con repricing activo", processed: 0 })
  }

  // 2. Load product costs (bulk)
  const productIds = strategies.filter((s) => s.product_id).map((s) => s.product_id as string)
  const costMap = new Map<string, number>()

  if (productIds.length > 0) {
    const { data: costs } = await supabase
      .from("product_costs")
      .select("product_id, total_cost")
      .in("product_id", productIds)

    for (const c of costs ?? []) {
      if (c.total_cost != null) costMap.set(c.product_id, Number(c.total_cost))
    }
  }

  const results: any[] = []

  // 3. Process each item
  for (const s of strategies) {
    const { id: strategyId, ml_item_id, account_id } = s

    // 3a. Cooldown check
    if (s.last_reprice_at) {
      const nextAllowed = new Date(s.last_reprice_at).getTime() + s.delay_seconds * 1000
      if (now.getTime() < nextAllowed) {
        await createRepriceJob(supabase, { strategyId, account_id, ml_item_id, reason: "cooldown", status: "skipped" })
        results.push({ ml_item_id, status: "cooldown", changed: false })
        continue
      }
    }

    try {
      if (!account_id) {
        results.push({ ml_item_id, status: "error", error: "sin account_id" })
        continue
      }
      const token = await getValidAccessToken(account_id)

      // Current price
      const { data: pub } = await supabase
        .from("ml_publications")
        .select("price")
        .eq("ml_item_id", ml_item_id)
        .eq("account_id", account_id)
        .maybeSingle()

      const currentPrice = pub?.price ? Number(pub.price) : Number(s.last_our_price ?? 0)
      if (!currentPrice) {
        results.push({ ml_item_id, status: "error", error: "precio actual desconocido" })
        continue
      }

      // Fetch price_to_win
      const ptwRes = await fetch(`${ML_API}/items/${ml_item_id}/price_to_win?siteId=MLA&version=v2`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      })

      if (!ptwRes.ok) {
        const errTxt = await ptwRes.text()
        await persistRepriceState(supabase, {
          strategyId,
          ml_item_id,
          account_id,
          currentPrice,
          new_price: null,
          status: "error",
          ptwPrice: null,
          competitorPrice: null,
          rawResponse: errTxt,
          changed: false,
        })
        results.push({ ml_item_id, status: "error", error: `HTTP ${ptwRes.status}` })
        await delay(300)
        continue
      }

      const ptwData = await ptwRes.json()
      const ptwPrice = ptwData.price_to_win ? Number(ptwData.price_to_win) : null
      const ptwStatus = ptwData.status ?? null
      const winnerStock = ptwData.winner?.available_quantity != null ? Number(ptwData.winner.available_quantity) : null
      const compPrice = ptwData.winner?.price ? Number(ptwData.winner.price) : null

      // Cost floor
      const rawCost = s.product_id ? (costMap.get(s.product_id) ?? null) : null
      const costFloor =
        rawCost !== null && s.target_margin_pct !== null ? rawCost * (1 + Number(s.target_margin_pct) / 100) : rawCost

      // Calculate new price
      const { new_price, reason } = calcReprice(
        {
          strategy: s.strategy as Strategy,
          min_price: Number(s.min_price),
          max_price: s.max_price ? Number(s.max_price) : null,
          delta_amount: s.delta_amount ? Number(s.delta_amount) : null,
          delta_pct: s.delta_pct ? Number(s.delta_pct) : null,
          target_margin_pct: s.target_margin_pct ? Number(s.target_margin_pct) : null,
          raise_step_amount: s.raise_step_amount ? Number(s.raise_step_amount) : null,
          raise_step_pct: s.raise_step_pct ? Number(s.raise_step_pct) : null,
          cost_floor: costFloor,
        },
        { status: ptwStatus, price_to_win: ptwPrice, winner_stock: winnerStock, competitor_price: compPrice },
        currentPrice,
      )

      // Change threshold: 1%
      const pctDiff = Math.abs(new_price - currentPrice) / currentPrice
      const changed = pctDiff >= 0.01

      if (changed) {
        const updateRes = await fetch(`${ML_API}/items/${ml_item_id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ price: new_price }),
          signal: AbortSignal.timeout(10_000),
        })

        if (updateRes.ok) {
          await supabase
            .from("ml_publications")
            .update({ price: new_price, updated_at: new Date().toISOString() })
            .eq("ml_item_id", ml_item_id)
            .eq("account_id", account_id)
        } else {
          const errBody = await updateRes.json().catch(() => ({}))
          await persistRepriceState(supabase, {
            strategyId,
            ml_item_id,
            account_id,
            currentPrice,
            new_price,
            status: "error",
            ptwPrice,
            competitorPrice: compPrice,
            rawResponse: errBody,
            changed: false,
          })
          results.push({ ml_item_id, status: "error", error: errBody.message })
          await delay(300)
          continue
        }
      }

      const finalStatus = changed ? reason : "no_change"
      await persistRepriceState(supabase, {
        strategyId,
        ml_item_id,
        account_id,
        currentPrice,
        new_price: changed ? new_price : null,
        status: finalStatus,
        ptwPrice,
        competitorPrice: compPrice,
        rawResponse: { price_to_win: ptwPrice, status: ptwStatus, winner_stock: winnerStock },
        changed,
      })

      results.push({
        ml_item_id,
        changed,
        status: finalStatus,
        old_price: currentPrice,
        new_price: changed ? new_price : null,
      })
    } catch (e: any) {
      console.error(`[ml-reprice] ${ml_item_id}:`, e.message)
      await persistRepriceState(supabase, {
        strategyId,
        ml_item_id,
        account_id,
        currentPrice: null,
        new_price: null,
        status: "error",
        ptwPrice: null,
        competitorPrice: null,
        rawResponse: { error: e.message },
        changed: false,
      })
      results.push({ ml_item_id, status: "error", error: e.message, changed: false })
    }

    await delay(300)
  }

  const changed = results.filter((r) => r.changed).length
  const errors = results.filter((r) => r.status === "error").length
  const skipped = results.filter((r) => r.status === "cooldown").length

  return NextResponse.json({
    ok: true,
    processed: results.length,
    changed,
    errors,
    skipped,
    duration_ms: Date.now() - startedAt,
    results,
  })
}
