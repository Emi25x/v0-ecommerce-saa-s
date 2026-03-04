import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET: listar órdenes ML con datos de facturación del comprador
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id   = searchParams.get("account_id") || ""
  const estado       = searchParams.get("estado") || ""
  const estado_envio = searchParams.get("estado_envio") || ""
  const facturado    = searchParams.get("facturado") || ""
  const fecha_desde  = searchParams.get("fecha_desde") || ""
  const fecha_hasta  = searchParams.get("fecha_hasta") || ""
  const page         = parseInt(searchParams.get("page") || "1")
  const limit        = parseInt(searchParams.get("limit") || "50")
  const offset       = (page - 1) * limit

  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta de MercadoLibre no encontrada o sin token" }, { status: 404 })
  }

  const auth     = `Bearer ${mlAccount.access_token}`
  const mlUserId = mlAccount.ml_user_id

  // Paso 1: buscar órdenes con /orders/search
  const mlParams = new URLSearchParams({
    seller: mlUserId,
    limit:  String(limit),
    offset: String(offset),
    sort:   "date_desc",
  })
  if (estado)      mlParams.set("order.status",            estado)
  if (fecha_desde) mlParams.set("order.date_created.from", fecha_desde)
  if (fecha_hasta) mlParams.set("order.date_created.to",   fecha_hasta)

  const mlRes = await fetch(
    `https://api.mercadolibre.com/orders/search?${mlParams}`,
    { headers: { Authorization: auth } }
  )
  if (!mlRes.ok) {
    const err = await mlRes.json()
    return NextResponse.json({ ok: false, error: err.message || "Error consultando MercadoLibre" }, { status: 502 })
  }
  const mlData = await mlRes.json()
  const orders: any[] = mlData.results || []

  // Paso 2: marcar cuáles ya fueron facturadas en nuestra BD
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

  // Paso 3: GET /orders/{id} para obtener buyer.billing_info (datos fiscales)
  // y estado de envío actualizado. Se hace en chunks de 10 en paralelo.
  // buyer.billing_info = { name, last_name, identification: { type, number } }
  const CHUNK = 10
  const orderDetailMap = new Map<string, any>()
  const shipmentStatusMap = new Map<string, { status: string; substatus: string | null }>()

  for (let i = 0; i < orders.length; i += CHUNK) {
    const chunk = orders.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map((o: any) =>
        fetch(
          `https://api.mercadolibre.com/orders/${o.id}`,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(8000) }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    )
    chunk.forEach((o: any, idx: number) => {
      const r = results[idx]
      if (r.status === "fulfilled" && r.value) {
        orderDetailMap.set(String(o.id), r.value)
      }
    })
  }

  // Paso 4: estado de envío desde /shipments/{id}
  const shipmentIds = orders.map((o: any) => o.shipping?.id).filter(Boolean).map(String)
  for (let i = 0; i < shipmentIds.length; i += CHUNK) {
    const chunk = shipmentIds.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map(sid =>
        fetch(
          `https://api.mercadolibre.com/shipments/${sid}`,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(6000) }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    )
    chunk.forEach((_sid, idx) => {
      const r = results[idx]
      if (r.status === "fulfilled" && r.value) {
        const s = r.value
        shipmentStatusMap.set(String(s.id), { status: s.status || "", substatus: s.substatus || null })
      }
    })
  }

  // Paso 5: armar respuesta enriquecida
  let enriched = orders.map((o: any) => {
    const detail   = orderDetailMap.get(String(o.id))
    const shipment = shipmentStatusMap.get(String(o.shipping?.id))

    // buyer.billing_info es el objeto con los datos fiscales del comprador
    const bi    = detail?.buyer?.billing_info || {}
    const ident = bi.identification || {}
    if (o === orders[0]) console.log("[v0] buyer completo orden 0:", JSON.stringify(detail?.buyer))

    // Nombre: billing_info.name + billing_info.last_name
    // Fallback: nickname (siempre disponible en /orders/search)
    const nombre = [bi.name, bi.last_name].filter(Boolean).join(" ").trim()
      || o.buyer?.nickname
      || ""

    return {
      id:                 o.id,
      fecha:              o.date_created,
      estado:             o.status,
      envio_status:       shipment?.status    ?? detail?.shipping?.status ?? null,
      envio_substatus:    shipment?.substatus ?? null,
      total:              o.total_amount,
      moneda:             o.currency_id,
      // Datos del comprador para facturar
      comprador:          nombre,
      comprador_doc:      ident.number || null,
      comprador_doc_tipo: ident.type   || null,
      buyer_id:           String(o.buyer?.id || ""),
      items: (o.order_items || []).map((i: any) => ({
        titulo:   i.item?.title || "",
        ean:      i.item?.attributes?.find((a: any) => a.id === "EAN")?.value_name || null,
        cantidad: i.quantity,
        precio:   Math.round(i.unit_price * 100) / 100,
      })),
      facturada:    facturadaMap.has(String(o.id)),
      factura_info: facturadaMap.get(String(o.id)) || null,
    }
  })

  // Filtros client-side
  if (estado_envio && estado_envio !== "all") enriched = enriched.filter(o => o.envio_status === estado_envio)
  if (facturado === "si") enriched = enriched.filter(o => o.facturada)
  if (facturado === "no") enriched = enriched.filter(o => !o.facturada)

  return NextResponse.json({
    ok:      true,
    orders:  enriched,
    total:   mlData.paging?.total || enriched.length,
    account: { id: account_id, ml_user_id: mlUserId, nickname: mlAccount.nickname },
  })
}

// POST: marcar órdenes como facturadas
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
    user_id:       user.id,
    ml_order_id:   String(oid),
    ml_account_id: String(ml_account_id),
    factura_id:    factura_id || null,
    empresa_id:    empresa_id || null,
  }))

  const { error } = await supabase
    .from("ml_order_facturas")
    .upsert(rows, { onConflict: "ml_order_id,ml_account_id" })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
