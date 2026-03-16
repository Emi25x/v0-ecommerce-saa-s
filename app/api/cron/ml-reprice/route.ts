/**
 * GET /api/cron/ml-reprice
 *
 * Motor de repricing profesional — 5 estrategias.
 * Lee ml_price_strategies, no toca repricing_config (sistema legacy).
 *
 * Lógica:
 *   1. Filtrar ítems habilitados respetando cooldown (delay_seconds)
 *   2. Para cada ítem: obtener precio actual + competencia (price_to_win API)
 *   3. Calcular precio objetivo según estrategia
 *   4. Aplicar reglas: min_price, max_price, delta, raise_step, umbral 1%
 *   5. Actualizar ML + ml_publications + ml_repricing_jobs
 *
 * Agregar a vercel.json:
 *   { "path": "/api/cron/ml-reprice", "schedule": "0 * * * *" }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getValidAccessToken } from "@/lib/mercadolibre"

export const dynamic     = "force-dynamic"
export const maxDuration = 300

const ML_API = "https://api.mercadolibre.com"

type Strategy = "win_buybox" | "follow_competitor" | "maximize_margin_if_alone" | "cost_plus" | "hybrid"

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Lógica de precios ─────────────────────────────────────────────────────────

interface StrategyCfg {
  strategy:          Strategy
  min_price:         number
  max_price:         number | null
  delta_amount:      number | null
  delta_pct:         number | null
  target_margin_pct: number | null
  raise_step_amount: number | null
  raise_step_pct:    number | null
  cost_floor:        number | null   // total_cost × (1 + target_margin_pct/100)
}

interface Competition {
  status:           string | null
  price_to_win:     number | null
  winner_stock:     number | null
  competitor_price: number | null
}

/** Calcula el precio objetivo cuando estamos solos (subida gradual o salto a max) */
function raisePrice(current: number, cfg: StrategyCfg): number {
  let next: number
  if (cfg.raise_step_amount !== null)      next = current + cfg.raise_step_amount
  else if (cfg.raise_step_pct !== null)    next = current * (1 + cfg.raise_step_pct / 100)
  else                                     next = cfg.max_price ?? current  // sin step → saltar al techo

  const floor = effectiveMin(cfg)
  const ceil  = cfg.max_price ?? next
  return Math.min(Math.max(next, floor), ceil)
}

/** min_price efectivo: el mayor entre min_price config y cost_floor (si aplica) */
function effectiveMin(cfg: StrategyCfg): number {
  return cfg.cost_floor !== null ? Math.max(cfg.min_price, cfg.cost_floor) : cfg.min_price
}

/** Aplica delta (ajuste vs precio objetivo) */
function applyDelta(price: number, cfg: StrategyCfg): number {
  if (cfg.delta_amount !== null) return price + cfg.delta_amount
  if (cfg.delta_pct    !== null) return price * (1 + cfg.delta_pct / 100)
  return price
}

function calcReprice(
  cfg:         StrategyCfg,
  competition: Competition,
  current:     number,
): { new_price: number; reason: string } {

  const eMin   = effectiveMin(cfg)
  const isAlone = competition.status === "alone"
  const noStock = competition.winner_stock !== null && competition.winner_stock === 0

  // ── Sin competidor con stock: subir gradualmente ──────────────────────────
  if (isAlone || noStock) {
    const raised  = raisePrice(current, cfg)
    return { new_price: raised, reason: isAlone ? "alone" : "competitor_no_stock" }
  }

  // ── Hay competidor con stock: calcular target ─────────────────────────────
  let target: number | null = null

  switch (cfg.strategy) {
    case "follow_competitor":
      target = competition.competitor_price
      break
    case "win_buybox":
    case "maximize_margin_if_alone":
      target = competition.price_to_win
      break
    case "cost_plus":
      // Usar price_to_win como referencia de mercado, pero respetar piso de costo
      target = competition.price_to_win
      break
    case "hybrid":
      // Seguir al competidor exacto, pero no bajar del piso de costo
      target = competition.competitor_price ?? competition.price_to_win
      break
  }

  if (target === null) {
    // Sin datos de competencia → mantener precio actual
    return { new_price: current, reason: "no_competition_data" }
  }

  // Aplicar delta (ej: -1 ARS para subcotizar)
  target = applyDelta(target, cfg)

  // Proteger piso
  if (target < eMin) return { new_price: eMin, reason: "below_min" }

  // Aplicar techo
  const capped = cfg.max_price !== null ? Math.min(target, cfg.max_price) : target
  const reason = capped < target
    ? "at_ceiling"
    : cfg.cost_floor !== null && target <= cfg.cost_floor
      ? "cost_floor"
      : "adjusted"

  return { new_price: capped, reason }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase  = sb()
  const startedAt = Date.now()
  const now       = new Date()

  // ── 1. Cargar estrategias habilitadas ────────────────────────────────────
  const { data: strategies, error: strErr } = await supabase
    .from("ml_price_strategies")
    .select(`
      id, account_id, ml_item_id, product_id,
      strategy, min_price, max_price,
      delta_amount, delta_pct,
      target_margin_pct, raise_step_amount, raise_step_pct,
      use_price_to_win, delay_seconds,
      last_reprice_at, last_our_price
    `)
    .eq("enabled", true)
    .order("last_reprice_at", { ascending: true, nullsFirst: true })

  if (strErr) {
    console.error("[ml-reprice] Error leyendo estrategias:", strErr.message)
    return NextResponse.json({ ok: false, error: strErr.message }, { status: 500 })
  }

  if (!strategies?.length) {
    return NextResponse.json({ ok: true, message: "Sin ítems con repricing activo", processed: 0 })
  }

  // ── 2. Cargar costos de productos (bulk) para cost_plus / hybrid ──────────
  const productIds = strategies.filter(s => s.product_id).map(s => s.product_id as string)
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

  console.log(`[ml-reprice] ${strategies.length} ítems cargados, ${costMap.size} costos disponibles`)

  const results: any[] = []

  // ── 3. Procesar cada ítem ────────────────────────────────────────────────
  for (const s of strategies) {
    const { id: strategyId, ml_item_id, account_id } = s

    // 3a. Check cooldown
    if (s.last_reprice_at) {
      const nextAllowed = new Date(s.last_reprice_at).getTime() + s.delay_seconds * 1000
      if (now.getTime() < nextAllowed) {
        await createJob(supabase, { strategyId, account_id, ml_item_id, reason: "cooldown", status: "skipped" })
        results.push({ ml_item_id, status: "cooldown", changed: false })
        continue
      }
    }

    try {
      // 3b. Token fresco
      if (!account_id) { results.push({ ml_item_id, status: "error", error: "sin account_id" }); continue }
      const token = await getValidAccessToken(account_id)

      // 3c. Precio actual desde ml_publications
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

      // 3d. Consultar price_to_win a ML
      const ptwRes = await fetch(
        `${ML_API}/items/${ml_item_id}/price_to_win?siteId=MLA&version=v2`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
      )

      if (!ptwRes.ok) {
        const errTxt = await ptwRes.text()
        console.warn(`[ml-reprice] ${ml_item_id}: price_to_win HTTP ${ptwRes.status}`)
        await persistState(supabase, { strategyId, ml_item_id, account_id, currentPrice, new_price: null,
          status: "error", ptwPrice: null, competitorPrice: null, rawResponse: errTxt, changed: false })
        results.push({ ml_item_id, status: "error", error: `HTTP ${ptwRes.status}` })
        await delay(300)
        continue
      }

      const ptwData      = await ptwRes.json()
      const ptwPrice     = ptwData.price_to_win    ? Number(ptwData.price_to_win) : null
      const ptwStatus    = ptwData.status           ?? null
      const winnerStock  = ptwData.winner?.available_quantity != null
                           ? Number(ptwData.winner.available_quantity) : null
      const compPrice    = ptwData.winner?.price    ? Number(ptwData.winner.price) : null

      // 3e. Cost floor para estrategias que lo necesitan
      const rawCost  = s.product_id ? (costMap.get(s.product_id) ?? null) : null
      const costFloor = rawCost !== null && s.target_margin_pct !== null
        ? rawCost * (1 + Number(s.target_margin_pct) / 100)
        : rawCost   // si no hay margen configurado, usar costo como piso exacto

      // 3f. Calcular nuevo precio
      const { new_price, reason } = calcReprice(
        {
          strategy:          s.strategy as Strategy,
          min_price:         Number(s.min_price),
          max_price:         s.max_price         ? Number(s.max_price)          : null,
          delta_amount:      s.delta_amount      ? Number(s.delta_amount)       : null,
          delta_pct:         s.delta_pct         ? Number(s.delta_pct)          : null,
          target_margin_pct: s.target_margin_pct ? Number(s.target_margin_pct)  : null,
          raise_step_amount: s.raise_step_amount ? Number(s.raise_step_amount)  : null,
          raise_step_pct:    s.raise_step_pct    ? Number(s.raise_step_pct)     : null,
          cost_floor:        costFloor,
        },
        { status: ptwStatus, price_to_win: ptwPrice, winner_stock: winnerStock, competitor_price: compPrice },
        currentPrice,
      )

      // 3g. ¿Hay cambio suficiente? Umbral: 1% (evitar micro-fluctuaciones)
      const pctDiff  = Math.abs(new_price - currentPrice) / currentPrice
      const changed  = pctDiff >= 0.01

      if (changed) {
        // 3h. Actualizar precio en ML
        const updateRes = await fetch(`${ML_API}/items/${ml_item_id}`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ price: new_price }),
          signal:  AbortSignal.timeout(10_000),
        })

        if (updateRes.ok) {
          await supabase
            .from("ml_publications")
            .update({ price: new_price, updated_at: new Date().toISOString() })
            .eq("ml_item_id", ml_item_id)
            .eq("account_id", account_id)

          console.log(`[ml-reprice] ${ml_item_id}: $${currentPrice} → $${new_price} (${reason})`)
        } else {
          const errBody = await updateRes.json().catch(() => ({}))
          console.error(`[ml-reprice] ${ml_item_id}: error ML`, errBody)
          await persistState(supabase, {
            strategyId, ml_item_id, account_id, currentPrice, new_price,
            status: "error", ptwPrice, competitorPrice: compPrice,
            rawResponse: errBody, changed: false,
          })
          results.push({ ml_item_id, status: "error", error: errBody.message })
          await delay(300)
          continue
        }
      }

      const finalStatus = changed ? reason : "no_change"
      await persistState(supabase, {
        strategyId, ml_item_id, account_id, currentPrice,
        new_price: changed ? new_price : null, status: finalStatus,
        ptwPrice, competitorPrice: compPrice,
        rawResponse: { price_to_win: ptwPrice, status: ptwStatus, winner_stock: winnerStock },
        changed,
      })

      results.push({ ml_item_id, changed, status: finalStatus, old_price: currentPrice, new_price: changed ? new_price : null })
    } catch (e: any) {
      console.error(`[ml-reprice] ${ml_item_id}:`, e.message)
      await persistState(supabase, {
        strategyId, ml_item_id, account_id, currentPrice: null, new_price: null,
        status: "error", ptwPrice: null, competitorPrice: null,
        rawResponse: { error: e.message }, changed: false,
      })
      results.push({ ml_item_id, status: "error", error: e.message, changed: false })
    }

    await delay(300)  // rate limit ML API
  }

  const changed = results.filter(r => r.changed).length
  const errors  = results.filter(r => r.status === "error").length
  const skipped = results.filter(r => r.status === "cooldown").length

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

// ── Persistencia ──────────────────────────────────────────────────────────────

async function persistState(supabase: any, args: {
  strategyId:      string
  ml_item_id:      string
  account_id:      string
  currentPrice:    number | null
  new_price:       number | null
  status:          string
  ptwPrice:        number | null
  competitorPrice: number | null
  rawResponse:     any
  changed:         boolean
}) {
  const now = new Date().toISOString()
  const finalPrice = args.changed && args.new_price !== null ? args.new_price : args.currentPrice

  await Promise.all([
    // Actualizar estado desnormalizado en ml_price_strategies
    supabase.from("ml_price_strategies").update({
      last_reprice_at:       now,
      last_status:           args.status,
      last_our_price:        finalPrice,
      last_price_to_win:     args.ptwPrice,
      last_competitor_price: args.competitorPrice,
      last_error:            args.status === "error" ? JSON.stringify(args.rawResponse).slice(0, 400) : null,
      updated_at:            now,
    }).eq("id", args.strategyId),

    // Crear job con resultado
    createJob(supabase, {
      strategyId:   args.strategyId,
      account_id:   args.account_id,
      ml_item_id:   args.ml_item_id,
      old_price:    args.currentPrice,
      new_price:    args.changed ? args.new_price : null,
      reason:       args.status,
      status:       args.status === "error" ? "error" : args.changed ? "done" : "skipped",
      processed_at: now,
      response:     args.rawResponse,
    }),
  ])
}

async function createJob(supabase: any, args: {
  strategyId?:  string
  account_id:   string
  ml_item_id:   string
  old_price?:   number | null
  new_price?:   number | null
  reason:       string
  status:       "pending" | "processing" | "done" | "skipped" | "error"
  error?:       string
  processed_at?: string
  response?:    any
}) {
  await supabase.from("ml_repricing_jobs").insert({
    strategy_id:    args.strategyId ?? null,
    account_id:     args.account_id,
    ml_item_id:     args.ml_item_id,
    old_price:      args.old_price ?? null,
    new_price:      args.new_price ?? null,
    reason:         args.reason,
    status:         args.status,
    error_message:  args.error ?? null,
    triggered_by:   "cron",
    processed_at:   args.processed_at ?? new Date().toISOString(),
    response_json:  args.response ?? null,
  })
}
