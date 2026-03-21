/**
 * POST /api/competition/bulk-update-price
 *
 * Actualización masiva de precio al price_to_win.
 * Respeta min_price / max_price de ml_price_strategies (fuente de verdad única).
 * Si no tiene config, aplica price_to_win directamente (acción manual).
 *
 * Body: { item_ids: string[] }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { createRepriceJob } from "@/domains/mercadolibre/repricing-engine"

const ML_API = "https://api.mercadolibre.com"

export async function POST(req: NextRequest) {
  try {
    const { item_ids } = await req.json()

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return NextResponse.json({ success: false, error: "item_ids debe ser un array no vacío" }, { status: 400 })
    }

    const supabase = await createClient()

    // Load strategy configs (modern source of truth)
    const { data: configs } = await supabase
      .from("ml_price_strategies")
      .select("ml_item_id, min_price, max_price")
      .in("ml_item_id", item_ids)

    const configMap = new Map((configs || []).map((c: any) => [c.ml_item_id, c]))

    const results: Array<{
      item_id: string
      success: boolean
      old_price?: number
      new_price?: number
      status?: string
      error?: string
    }> = []

    for (const item_id of item_ids) {
      try {
        const { data: pub } = await supabase
          .from("ml_publications")
          .select("account_id, price")
          .eq("ml_item_id", item_id)
          .maybeSingle()

        if (!pub?.account_id) {
          results.push({ item_id, success: false, error: "Publicación no encontrada en la DB" })
          continue
        }

        const accessToken = await getValidAccessToken(pub.account_id)
        const currentPrice = pub.price ? Number(pub.price) : null

        // Fetch price_to_win from ML
        const ptwRes = await fetch(`${ML_API}/items/${item_id}/price_to_win?siteId=MLA&version=v2`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        })

        if (!ptwRes.ok) {
          results.push({ item_id, success: false, error: `ML price_to_win HTTP ${ptwRes.status}` })
          await delay(300)
          continue
        }

        const ptw = await ptwRes.json()
        const ptwPrice = ptw.price_to_win ? Number(ptw.price_to_win) : null

        if (!ptwPrice) {
          results.push({ item_id, success: false, error: "price_to_win no disponible para este ítem" })
          await delay(300)
          continue
        }

        // Apply limits from strategy config
        const cfg = configMap.get(item_id)
        let newPrice = ptwPrice
        let repStatus = "adjusted"

        if (cfg) {
          const minP = Number(cfg.min_price)
          const maxP = cfg.max_price ? Number(cfg.max_price) : null

          if (ptwPrice < minP) {
            newPrice = minP
            repStatus = "below_min"
          } else {
            newPrice = maxP !== null ? Math.min(ptwPrice, maxP) : ptwPrice
            repStatus = maxP !== null && ptwPrice > maxP ? "at_ceiling" : "adjusted"
          }
        }

        // Skip if change < $1
        if (currentPrice !== null && Math.abs(newPrice - currentPrice) < 1) {
          results.push({ item_id, success: true, old_price: currentPrice, new_price: newPrice, status: "no_change" })
          await delay(300)
          continue
        }

        // Update price in ML
        const updateRes = await fetch(`${ML_API}/items/${item_id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ price: newPrice }),
          signal: AbortSignal.timeout(10_000),
        })

        if (!updateRes.ok) {
          const errData = await updateRes.json().catch(() => ({}))
          results.push({ item_id, success: false, error: errData.message || `HTTP ${updateRes.status}` })
          await delay(300)
          continue
        }

        // Update in ml_publications
        await supabase
          .from("ml_publications")
          .update({ price: newPrice, updated_at: new Date().toISOString() })
          .eq("ml_item_id", item_id)
          .eq("account_id", pub.account_id)

        // Record in ml_repricing_jobs (modern audit trail)
        await createRepriceJob(supabase, {
          account_id: pub.account_id,
          ml_item_id: item_id,
          reason: `bulk_manual:${repStatus}`,
          status: "done",
        })

        results.push({
          item_id,
          success: true,
          old_price: currentPrice ?? undefined,
          new_price: newPrice,
          status: repStatus,
        })
        await delay(400)
      } catch (e: any) {
        results.push({ item_id, success: false, error: e.message })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    return NextResponse.json({
      success: true,
      summary: { total: item_ids.length, success: successCount, failed: failCount },
      results,
    })
  } catch (e: any) {
    console.error("[bulk-update-price] Error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
