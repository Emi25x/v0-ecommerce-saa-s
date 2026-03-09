/**
 * GET /api/cron/reprice
 *
 * Cron de repricing automático. Reemplaza los dos crons rotos:
 *   - /api/cron/analyze-competition  (apuntaba a endpoint inexistente)
 *   - /api/cron/auto-price-tracking  (columna incorrecta, solo bajaba)
 *
 * Lógica de 5 escenarios:
 *   1. Competidor activo, price_to_win >= min_price   → bajar/subir hasta price_to_win (capped a max_price)
 *   2. Competidor activo, price_to_win < min_price    → quedarse en min_price (no bajar del mínimo)
 *   3. Competidor sin stock                           → subir a target_price ?? max_price
 *   4. Solo en el catálogo (status = 'alone')        → subir a target_price ?? max_price
 *   5. Error de API / price_to_win nulo               → no tocar el precio, loguear error
 *
 * Para agregar a vercel.json:
 *   { "path": "/api/cron/reprice", "schedule": "0 * * * *" }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getValidAccessToken } from "@/lib/mercadolibre"

export const maxDuration = 300 // 5 min — procesar ítems en serie sin timeout

const ML_API = "https://api.mercadolibre.com"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── Helper: precio objetivo cuando no hay competencia activa ─────────────────
function targetWhenAlone(cfg: {
  target_price: number | null
  max_price:    number | null
  min_price:    number
  last_our_price: number | null
}): number | null {
  if (cfg.target_price) return Math.min(cfg.target_price, cfg.max_price ?? cfg.target_price)
  if (cfg.max_price)    return cfg.max_price
  return null // sin target ni techo → no subir
}

// ── Helper: calcular precio nuevo + status según los 5 escenarios ────────────
function calcReprice(cfg: {
  min_price:       number
  max_price:       number | null
  target_price:    number | null
  last_our_price:  number | null
}, ptw: {
  status:          string | null
  price_to_win:    number | null
  winner_stock:    number | null
}): { new_price: number | null; status: string } {

  // Escenario 4 — solo en el catálogo
  if (ptw.status === "alone") {
    const p = targetWhenAlone(cfg)
    return { new_price: p ? Math.max(p, cfg.min_price) : null, status: "alone" }
  }

  // Escenario 3 — competidor sin stock
  if (ptw.winner_stock !== null && ptw.winner_stock === 0) {
    const p = targetWhenAlone(cfg)
    return { new_price: p ? Math.max(p, cfg.min_price) : null, status: "competitor_no_stock" }
  }

  // Sin price_to_win (error de API, ítem no catalogado, etc.)
  if (!ptw.price_to_win) {
    return { new_price: null, status: "error" }
  }

  const desired = ptw.price_to_win

  // Escenario 2 — price_to_win por debajo del mínimo
  if (desired < cfg.min_price) {
    return { new_price: cfg.min_price, status: "below_min" }
  }

  // Escenario 1 — seguir al competidor, capped al techo rentable
  const capped = cfg.max_price !== null ? Math.min(desired, cfg.max_price) : desired
  const status = capped < desired ? "at_ceiling" : "adjusted"
  return { new_price: capped, status }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth: solo Vercel Cron o llamada interna con CRON_SECRET
  const auth = req.headers.get("authorization")
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()

  // ── 1. Obtener todos los ítems con repricing habilitado ────────────────────
  const { data: configs, error: cfgErr } = await supabase
    .from("repricing_config")
    .select("id, ml_item_id, account_id, min_price, max_price, target_price, last_our_price")
    .eq("enabled", true)

  if (cfgErr) {
    console.error("[reprice] Error leyendo repricing_config:", cfgErr.message)
    return NextResponse.json({ ok: false, error: cfgErr.message }, { status: 500 })
  }

  if (!configs || configs.length === 0) {
    return NextResponse.json({ ok: true, message: "No hay ítems con repricing activo", processed: 0 })
  }

  console.log(`[reprice] Procesando ${configs.length} ítems`)

  const results: Array<{
    ml_item_id: string
    changed: boolean
    status: string
    old_price?: number | null
    new_price?: number | null
    error?: string
  }> = []

  // ── 2. Procesar cada ítem ──────────────────────────────────────────────────
  for (const cfg of configs) {
    const { ml_item_id, account_id } = cfg

    try {
      // 2a. Obtener access token fresco
      if (!account_id) {
        console.warn(`[reprice] ${ml_item_id}: sin account_id configurado, saltando`)
        continue
      }
      const token = await getValidAccessToken(account_id)

      // 2b. Precio actual desde ml_publications (fuente de verdad)
      const { data: pub } = await supabase
        .from("ml_publications")
        .select("price")
        .eq("ml_item_id", ml_item_id)
        .eq("account_id", account_id)
        .maybeSingle()

      const currentPrice: number | null = pub?.price ? Number(pub.price) : null

      // 2c. Consultar price_to_win a ML
      const ptwRes = await fetch(
        `${ML_API}/items/${ml_item_id}/price_to_win?siteId=MLA&version=v2`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
      )

      if (!ptwRes.ok) {
        const errTxt = await ptwRes.text()
        console.warn(`[reprice] ${ml_item_id}: price_to_win HTTP ${ptwRes.status}`)
        await persistResult({
          cfg, currentPrice, new_price: null, status: "error",
          ptw_price: null, winner_stock: null, rawResponse: errTxt, changed: false,
        })
        results.push({ ml_item_id, changed: false, status: "error", error: `HTTP ${ptwRes.status}` })
        await delay(300)
        continue
      }

      const ptw = await ptwRes.json()
      const ptwPrice    = ptw.price_to_win       ? Number(ptw.price_to_win) : null
      const ptwStatus   = ptw.status             ?? null
      const winnerStock = ptw.winner?.available_quantity != null
        ? Number(ptw.winner.available_quantity) : null
      const competitorPrice = ptw.winner?.price  ? Number(ptw.winner.price) : null

      // 2d. Calcular precio objetivo según los 5 escenarios
      const { new_price, status } = calcReprice(
        {
          min_price:      Number(cfg.min_price),
          max_price:      cfg.max_price      ? Number(cfg.max_price)      : null,
          target_price:   cfg.target_price   ? Number(cfg.target_price)   : null,
          last_our_price: currentPrice,
        },
        { status: ptwStatus, price_to_win: ptwPrice, winner_stock: winnerStock },
      )

      const needsChange = new_price !== null && currentPrice !== null
        && Math.abs(new_price - currentPrice) >= 1  // umbral de $1 para evitar updates innecesarios

      // 2e. Aplicar cambio de precio en ML (si corresponde)
      if (needsChange && new_price !== null) {
        const updateRes = await fetch(`${ML_API}/items/${ml_item_id}`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ price: new_price }),
          signal:  AbortSignal.timeout(10_000),
        })

        if (updateRes.ok) {
          // Actualizar precio en ml_publications
          await supabase
            .from("ml_publications")
            .update({ price: new_price, updated_at: new Date().toISOString() })
            .eq("ml_item_id", ml_item_id)
            .eq("account_id", account_id)

          console.log(`[reprice] ${ml_item_id}: ${currentPrice} → ${new_price} (${status})`)
        } else {
          const errBody = await updateRes.json().catch(() => ({}))
          console.error(`[reprice] ${ml_item_id}: error al actualizar precio en ML`, errBody)
          await persistResult({
            cfg, currentPrice, new_price, status: "error",
            ptw_price: ptwPrice, winner_stock: winnerStock, rawResponse: errBody, changed: false,
          })
          results.push({ ml_item_id, changed: false, status: "error", error: errBody.message })
          await delay(300)
          continue
        }
      }

      // 2f. Guardar estado del ciclo
      await persistResult({
        cfg, currentPrice, new_price,
        status, ptw_price: ptwPrice, winner_stock: winnerStock,
        rawResponse: { price_to_win: ptwPrice, status: ptwStatus, winner_stock: winnerStock },
        changed: needsChange,
        competitor_price: competitorPrice,
      })

      results.push({ ml_item_id, changed: needsChange, status, old_price: currentPrice, new_price })
    } catch (e: any) {
      console.error(`[reprice] ${ml_item_id}: excepción`, e.message)
      results.push({ ml_item_id, changed: false, status: "error", error: e.message })
    }

    // Rate limit: 300ms entre ítems
    await delay(300)
  }

  const changed = results.filter((r) => r.changed).length
  const errors  = results.filter((r) => r.status === "error").length

  return NextResponse.json({
    ok: true,
    processed:  results.length,
    changed,
    errors,
    duration_ms: Date.now() - startedAt,
    results,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function persistResult(args: {
  cfg:              { id: string; ml_item_id: string }
  currentPrice:     number | null
  new_price:        number | null
  status:           string
  ptw_price:        number | null
  winner_stock:     number | null
  rawResponse:      any
  changed:          boolean
  competitor_price?: number | null
}) {
  const { cfg, currentPrice, new_price, status, ptw_price, rawResponse, changed, competitor_price } = args
  const now = new Date().toISOString()

  await Promise.all([
    // Actualizar estado en repricing_config
    supabase
      .from("repricing_config")
      .update({
        last_run_at:           now,
        last_status:           status,
        last_our_price:        changed && new_price !== null ? new_price : currentPrice,
        last_price_to_win:     ptw_price,
        last_competitor_price: competitor_price ?? null,
        last_error:            status === "error" ? JSON.stringify(rawResponse).slice(0, 300) : null,
        updated_at:            now,
      })
      .eq("id", cfg.id),

    // Insertar en historial
    supabase
      .from("repricing_history")
      .insert({
        ml_item_id:   cfg.ml_item_id,
        old_price:    currentPrice,
        new_price:    new_price,
        price_to_win: ptw_price,
        status,
        changed,
        raw_response: rawResponse,
        created_at:   now,
      }),
  ])
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
