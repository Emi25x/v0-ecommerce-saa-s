/**
 * ML Repricing Engine — 5 pricing strategies.
 *
 * Pure business logic extracted from /api/cron/ml-reprice/route.ts.
 * No HTTP, no Supabase — just pricing calculations.
 */

export type Strategy = "win_buybox" | "follow_competitor" | "maximize_margin_if_alone" | "cost_plus" | "hybrid"

export interface StrategyCfg {
  strategy:          Strategy
  min_price:         number
  max_price:         number | null
  delta_amount:      number | null
  delta_pct:         number | null
  target_margin_pct: number | null
  raise_step_amount: number | null
  raise_step_pct:    number | null
  cost_floor:        number | null
}

export interface Competition {
  status:           string | null
  price_to_win:     number | null
  winner_stock:     number | null
  competitor_price: number | null
}

/** min_price efectivo: el mayor entre min_price config y cost_floor (si aplica) */
function effectiveMin(cfg: StrategyCfg): number {
  return cfg.cost_floor !== null ? Math.max(cfg.min_price, cfg.cost_floor) : cfg.min_price
}

/** Calcula el precio objetivo cuando estamos solos (subida gradual o salto a max) */
function raisePrice(current: number, cfg: StrategyCfg): number {
  let next: number
  if (cfg.raise_step_amount !== null)      next = current + cfg.raise_step_amount
  else if (cfg.raise_step_pct !== null)    next = current * (1 + cfg.raise_step_pct / 100)
  else                                     next = cfg.max_price ?? current

  const floor = effectiveMin(cfg)
  const ceil  = cfg.max_price ?? next
  return Math.min(Math.max(next, floor), ceil)
}

/** Aplica delta (ajuste vs precio objetivo) */
function applyDelta(price: number, cfg: StrategyCfg): number {
  if (cfg.delta_amount !== null) return price + cfg.delta_amount
  if (cfg.delta_pct    !== null) return price * (1 + cfg.delta_pct / 100)
  return price
}

export function calcReprice(
  cfg:         StrategyCfg,
  competition: Competition,
  current:     number,
): { new_price: number; reason: string } {

  const eMin   = effectiveMin(cfg)
  const isAlone = competition.status === "alone"
  const noStock = competition.winner_stock !== null && competition.winner_stock === 0

  if (isAlone || noStock) {
    const raised  = raisePrice(current, cfg)
    return { new_price: raised, reason: isAlone ? "alone" : "competitor_no_stock" }
  }

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
      target = competition.price_to_win
      break
    case "hybrid":
      target = competition.competitor_price ?? competition.price_to_win
      break
  }

  if (target === null) {
    return { new_price: current, reason: "no_competition_data" }
  }

  target = applyDelta(target, cfg)

  if (target < eMin) return { new_price: eMin, reason: "below_min" }

  const capped = cfg.max_price !== null ? Math.min(target, cfg.max_price) : target
  const reason = capped < target
    ? "at_ceiling"
    : cfg.cost_floor !== null && target <= cfg.cost_floor
      ? "cost_floor"
      : "adjusted"

  return { new_price: capped, reason }
}

/**
 * Persist repricing state: update strategy row + create job record.
 */
export async function persistRepriceState(supabase: any, args: {
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
    supabase.from("ml_price_strategies").update({
      last_reprice_at:       now,
      last_status:           args.status,
      last_our_price:        finalPrice,
      last_price_to_win:     args.ptwPrice,
      last_competitor_price: args.competitorPrice,
      last_error:            args.status === "error" ? JSON.stringify(args.rawResponse).slice(0, 400) : null,
      updated_at:            now,
    }).eq("id", args.strategyId),

    supabase.from("ml_repricing_jobs").insert({
      strategy_id:    args.strategyId ?? null,
      account_id:     args.account_id,
      ml_item_id:     args.ml_item_id,
      old_price:      args.currentPrice ?? null,
      new_price:      args.changed ? args.new_price : null,
      reason:         args.status,
      status:         args.status === "error" ? "error" : args.changed ? "done" : "skipped",
      error_message:  null,
      triggered_by:   "cron",
      processed_at:   now,
      response_json:  args.rawResponse ?? null,
    }),
  ])
}

export async function createRepriceJob(supabase: any, args: {
  strategyId?:  string
  account_id:   string
  ml_item_id:   string
  reason:       string
  status:       "pending" | "processing" | "done" | "skipped" | "error"
}) {
  await supabase.from("ml_repricing_jobs").insert({
    strategy_id:    args.strategyId ?? null,
    account_id:     args.account_id,
    ml_item_id:     args.ml_item_id,
    reason:         args.reason,
    status:         args.status,
    triggered_by:   "cron",
    processed_at:   new Date().toISOString(),
  })
}
