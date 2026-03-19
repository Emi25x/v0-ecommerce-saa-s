/**
 * GET /api/ml/intel/daily-actions?account_id=UUID
 * Lista priorizada de acciones del día:
 * - zona_33k (rojo)
 * - overpriced (naranja)
 * - underpriced (verde)
 * - oportunidades nuevas con score alto (azul)
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

const ZONE_LOW = 31000
const ZONE_HIGH = 34000

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account_id = searchParams.get("account_id")
  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Traer publicaciones activas con snapshot del día
  const { data: pubs } = await supabase
    .from("ml_publications")
    .select("ean, title, price, ml_item_id, permalink")
    .eq("account_id", account_id)
    .not("ean", "is", null)
    .in("status", ["active", "paused"])
    .limit(500)

  const eans = [...new Set((pubs || []).map((p) => p.ean).filter(Boolean))]

  const { data: snaps } = await supabase
    .from("ml_market_snapshots")
    .select("ean, min_price, median_price, sellers_count, full_sellers_count, sold_qty_proxy")
    .eq("account_id", account_id)
    .eq("captured_day", today)
    .in("ean", eans.length > 0 ? eans : ["__none__"])

  const snapMap = new Map<string, any>()
  for (const s of snaps || []) snapMap.set(s.ean, s)

  // Oportunidades nuevas con score alto
  const { data: opps } = await supabase
    .from("ml_opportunities")
    .select("id, ean, title, opportunity_score, min_price, median_price, sellers_count")
    .eq("account_id", account_id)
    .eq("status", "new")
    .gte("opportunity_score", 30)
    .order("opportunity_score", { ascending: false })
    .limit(20)

  type Priority = "critical" | "warning" | "good" | "info"
  const actions: Array<{
    type: string
    priority: Priority
    ean: string
    title: string
    my_price?: number
    market_price?: number
    score?: number
    detail: string
    ml_item_id?: string | null
    opp_id?: string
  }> = []

  for (const pub of pubs ?? []) {
    const snap = snapMap.get(pub.ean!)
    const myPrice = Number(pub.price) || 0
    if (!snap || !myPrice) continue

    const medianMkt = Number(snap.median_price)
    const sellers = snap.sellers_count || 0
    if (!medianMkt) continue

    const diff = (myPrice - medianMkt) / medianMkt
    const zona33k = myPrice >= ZONE_LOW && myPrice <= ZONE_HIGH

    if (zona33k) {
      actions.push({
        type: "zona_33k",
        priority: "critical",
        ean: pub.ean!,
        title: pub.title || pub.ean!,
        my_price: myPrice,
        market_price: medianMkt,
        detail: `Precio $${myPrice.toLocaleString("es-AR")} en zona umbral 33k — revisar comision`,
        ml_item_id: pub.ml_item_id,
      })
    } else if (diff > 0.2 && sellers >= 3) {
      actions.push({
        type: "overpriced",
        priority: "warning",
        ean: pub.ean!,
        title: pub.title || pub.ean!,
        my_price: myPrice,
        market_price: medianMkt,
        detail: `Tu precio es +${Math.round(diff * 100)}% vs mediana con ${sellers} vendedores`,
        ml_item_id: pub.ml_item_id,
      })
    } else if (diff < -0.15 && sellers >= 2) {
      actions.push({
        type: "underpriced",
        priority: "good",
        ean: pub.ean!,
        title: pub.title || pub.ean!,
        my_price: myPrice,
        market_price: medianMkt,
        detail: `Podés subir ${Math.abs(Math.round(diff * 100))}% hasta mediana $${medianMkt.toLocaleString("es-AR")}`,
        ml_item_id: pub.ml_item_id,
      })
    }
  }

  // Agregar oportunidades
  for (const opp of opps ?? []) {
    actions.push({
      type: "opportunity",
      priority: "info",
      ean: opp.ean,
      title: opp.title || opp.ean,
      score: opp.opportunity_score,
      market_price: opp.median_price,
      detail: `Score ${opp.opportunity_score} — ${opp.sellers_count} vendedores, mediana $${Number(opp.median_price || 0).toLocaleString("es-AR")}`,
      opp_id: opp.id,
    })
  }

  // Ordenar: critical → warning → good → info
  const ORDER: Record<Priority, number> = { critical: 0, warning: 1, good: 2, info: 3 }
  actions.sort((a, b) => ORDER[a.priority] - ORDER[b.priority])

  const safeActions = actions ?? []
  const oppCount = (opps ?? []).length

  if (oppCount === 0) {
    console.log("[daily-actions] No se detectaron oportunidades")
  }

  const summary = {
    zona_33k: safeActions.filter((a) => a.type === "zona_33k").length,
    overpriced: safeActions.filter((a) => a.type === "overpriced").length,
    underpriced: safeActions.filter((a) => a.type === "underpriced").length,
    opportunities: safeActions.filter((a) => a.type === "opportunity").length,
    total: safeActions.length,
    has_snapshot_today: snaps?.length ?? 0,
  }

  return NextResponse.json({ actions: safeActions, summary, today })
}
