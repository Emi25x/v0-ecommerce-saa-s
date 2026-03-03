import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET: listar órdenes ML con estado de facturación
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id    = searchParams.get("account_id") || ""
  const estado        = searchParams.get("estado") || ""       // paid, cancelled, pending
  const estado_envio  = searchParams.get("estado_envio") || "" // delivered, shipped, etc.
  const facturado     = searchParams.get("facturado") || ""    // "si" | "no" | ""
  const fecha_desde   = searchParams.get("fecha_desde") || ""
  const fecha_hasta   = searchParams.get("fecha_hasta") || ""
  const page        = parseInt(searchParams.get("page") || "1")
  const limit       = parseInt(searchParams.get("limit") || "50")
  const offset      = (page - 1) * limit

  // Buscar solo por id (uuid) — user_id puede estar vacío en cuentas conectadas previamente
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta de MercadoLibre no encontrada o sin token" }, { status: 404 })
  }

  const mlUserId = mlAccount.ml_user_id

  // Construir query a ML API — las órdenes se buscan con el seller id numérico
  const mlParams = new URLSearchParams({
    seller: mlUserId,
    limit:  String(limit),
    offset: String(offset),
    sort:   "date_desc",
  })
  if (estado)       mlParams.set("order.status",          estado)
  if (estado_envio) mlParams.set("order.shipping.status", estado_envio)
  if (fecha_desde)  mlParams.set("order.date_created.from", fecha_desde)
  if (fecha_hasta)  mlParams.set("order.date_created.to",   fecha_hasta)

  const mlRes = await fetch(
    `https://api.mercadolibre.com/orders/search?${mlParams}`,
    { headers: { Authorization: `Bearer ${mlAccount.access_token}` } }
  )
  if (!mlRes.ok) {
    const err = await mlRes.json()
    return NextResponse.json({ ok: false, error: err.message || "Error consultando MercadoLibre" }, { status: 502 })
  }
  const mlData = await mlRes.json()
  const orders: any[] = mlData.results || []

  // Obtener cuáles ya fueron facturadas
  const orderIds = orders.map((o: any) => String(o.id))
  const { data: facturadas } = await supabase
    .from("ml_order_facturas")
    .select("ml_order_id, factura_id, empresa_id, facturado_at")
    .eq("user_id",       user.id)
    .eq("ml_account_id", account_id)
    .in("ml_order_id",   orderIds)

  const facturadaMap = new Map(
    (facturadas || []).map((f: any) => [f.ml_order_id, f])
  )

  // Obtener estado de envíos en batch (ML devuelve solo shipment.id en orders/search)
  // ML permite hasta 20 ids por request con /shipments?ids=id1,id2,...
  const shipmentStatusMap = new Map<string, string>()
  const shipmentIds = orders
    .map((o: any) => o.shipping?.id)
    .filter(Boolean)
    .map(String)

  // Log para ver qué trae shipping en la primera orden
  if (orders.length > 0) {
    console.log("[v0] primera orden shipping raw:", JSON.stringify(orders[0].shipping))
    console.log("[v0] shipmentIds encontrados:", shipmentIds.slice(0, 5))
  }

  if (shipmentIds.length > 0) {
    // Procesar de a uno — /shipments/{id} es el endpoint correcto de ML
    await Promise.all(shipmentIds.slice(0, 20).map(async (sid) => {
      try {
        const sr = await fetch(
          `https://api.mercadolibre.com/shipments/${sid}`,
          { headers: { Authorization: `Bearer ${mlAccount.access_token}` } }
        )
        if (sr.ok) {
          const sData = await sr.json()
          console.log("[v0] shipment", sid, "status:", sData.status, "substatus:", sData.substatus)
          if (sData?.id) shipmentStatusMap.set(String(sData.id), sData.status || "")
        } else {
          console.log("[v0] shipment", sid, "error:", sr.status)
        }
      } catch (e) { console.log("[v0] shipment fetch error:", e) }
    }))
  }

  // Enriquecer órdenes con estado de facturación y envío
  let enriched = orders.map((o: any) => ({
    id:            o.id,
    fecha:         o.date_created,
    estado:        o.status,
    envio_status:  shipmentStatusMap.get(String(o.shipping?.id)) || null,
    total:         o.total_amount,
    moneda:        o.currency_id,
    comprador:     o.buyer ? `${o.buyer.first_name || ""} ${o.buyer.last_name || ""}`.trim() : "—",
    comprador_doc: o.buyer?.identification?.number || null,
    items:         (o.order_items || []).map((i: any) => ({
      titulo:   i.item?.title || "",
      cantidad: i.quantity,
      precio:   Math.round(i.unit_price * 100) / 100,
    })),
    facturada:    facturadaMap.has(String(o.id)),
    factura_info: facturadaMap.get(String(o.id)) || null,
  }))

  // Filtro de facturado client-side (ML no lo soporta nativamente)
  if (facturado === "si") enriched = enriched.filter(o => o.facturada)
  if (facturado === "no") enriched = enriched.filter(o => !o.facturada)

  return NextResponse.json({
    ok:      true,
    orders:  enriched,
    total:   mlData.paging?.total || enriched.length,
    account: { id: account_id, ml_user_id: mlUserId, nickname: mlAccount.nickname },
  })
}

// POST: marcar una o varias órdenes como facturadas (después de emitir)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json()
  const { ml_order_ids, ml_account_id, factura_id, empresa_id } = body

  if (!ml_order_ids?.length || !ml_account_id) {
    return NextResponse.json({ ok: false, error: "Parámetros incompletos" }, { status: 400 })
  }

  const rows = ml_order_ids.map((oid: number | string) => ({
    user_id:        user.id,
    ml_order_id:    String(oid),
    ml_account_id:  String(ml_account_id),  // uuid de la fila en ml_accounts
    factura_id:     factura_id || null,
    empresa_id:     empresa_id || null,
  }))

  const { error } = await supabase
    .from("ml_order_facturas")
    .upsert(rows, { onConflict: "ml_order_id,ml_account_id" })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
