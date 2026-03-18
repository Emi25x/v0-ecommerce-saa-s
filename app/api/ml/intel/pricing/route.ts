/**
 * GET /api/ml/intel/pricing?account_id=UUID
 * JOIN ml_publications + ml_market_snapshots + products
 * Devuelve por EAN: tu precio, min/median mercado, sellers, %FULL, zona_33k, sugerencia conservadora
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

const ZONE_LOW = 31000
const ZONE_HIGH = 34000
const FULL_THRESHOLD = 0.5 // >50% sellers con envío gratis = relevante

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account_id = searchParams.get("account_id")
  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Publicaciones activas con EAN
  const { data: pubs, error: pubsErr } = await supabase
    .from("ml_publications")
    .select("id, ean, title, price, product_id, ml_item_id, status")
    .eq("account_id", account_id)
    .not("ean", "is", null)
    .neq("ean", "")
    .in("status", ["active", "paused"])
    .order("title", { ascending: true })
    .limit(500)

  if (pubsErr) return NextResponse.json({ error: pubsErr.message }, { status: 500 })
  if (!pubs?.length) return NextResponse.json({ rows: [] })

  // Snapshots del día para esta cuenta
  const eans = [...new Set(pubs.map((p) => p.ean).filter(Boolean))]
  const { data: snaps } = await supabase
    .from("ml_market_snapshots")
    .select("ean, min_price, median_price, avg_price, sellers_count, full_sellers_count, free_shipping_rate, sold_qty_proxy")
    .eq("account_id", account_id)
    .eq("captured_day", today)
    .in("ean", eans)

  const snapMap = new Map<string, any>()
  for (const s of snaps || []) snapMap.set(s.ean, s)

  // Cost price desde products (opcional)
  const productIds = [...new Set(pubs.map((p) => p.product_id).filter(Boolean))]
  let costMap = new Map<string, number>()
  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, cost_price")
      .in("id", productIds)
    for (const p of prods || []) {
      if (p.cost_price) costMap.set(p.id, Number(p.cost_price))
    }
  }

  // Construir filas con sugerencia conservadora
  const rows = pubs.map((pub) => {
    const snap = snapMap.get(pub.ean!)
    const myPrice = Number(pub.price) || 0
    const minMkt = snap ? Number(snap.min_price) : null
    const medianMkt = snap ? Number(snap.median_price) : null
    const sellers = snap ? snap.sellers_count : null
    const fullSellers = snap ? snap.full_sellers_count : null
    const fullPct = sellers && sellers > 0 ? Math.round((fullSellers / sellers) * 100) : null
    const soldProxy = snap ? snap.sold_qty_proxy : null
    const costPrice = pub.product_id ? costMap.get(pub.product_id) ?? null : null

    // Zona 33k flag
    const zona33k = myPrice >= ZONE_LOW && myPrice <= ZONE_HIGH

    // Sugerencia conservadora
    let suggestion: "subir" | "bajar" | "mantener" | "sin_datos" = "sin_datos"
    let motivo = ""

    if (medianMkt !== null && myPrice > 0) {
      const diff = (myPrice - medianMkt) / medianMkt

      if (zona33k) {
        suggestion = "mantener"
        motivo = "Zona umbral 33k — no mover sin analizar comision"
      } else if (diff < -0.15) {
        // Nuestro precio es >15% más bajo que la mediana → podemos subir
        suggestion = "subir"
        motivo = `Tu precio $${myPrice.toLocaleString("es-AR")} es ${Math.abs(Math.round(diff * 100))}% menor a la mediana $${medianMkt.toLocaleString("es-AR")}`
      } else if (diff > 0.2 && sellers !== null && sellers >= 3) {
        // Somos >20% más caros con 3+ competidores → bajar
        suggestion = "bajar"
        motivo = `Tu precio es ${Math.round(diff * 100)}% mayor a la mediana con ${sellers} vendedores`
      } else {
        suggestion = "mantener"
        motivo = `Precio competitivo (${Math.round(diff * 100) >= 0 ? "+" : ""}${Math.round(diff * 100)}% vs mediana)`
      }

      // Ajuste si no hay envío gratis dominante
      if (suggestion === "subir" && fullPct !== null && fullPct > 70) {
        suggestion = "bajar"
        motivo += ". Mercado dominado por FULL"
      }
    }

    return {
      ean: pub.ean,
      title: pub.title,
      ml_item_id: pub.ml_item_id,
      my_price: myPrice,
      cost_price: costPrice,
      min_market: minMkt,
      median_market: medianMkt,
      sellers_count: sellers,
      full_pct: fullPct,
      sold_proxy: soldProxy,
      zona33k,
      suggestion,
      motivo,
      has_snapshot: !!snap,
    }
  })

  return NextResponse.json({ rows, today })
}
