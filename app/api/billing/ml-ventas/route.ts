import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET: listar órdenes ML
// Los datos fiscales (buyer.billing_info) se obtienen al momento de facturar,
// no al listar — para no hacer 50 llamadas individuales que superan el timeout.
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
  
  // ── IMPORTANTE: Traer MÁS filas de ML para compensar los que se filtran después ──
  // Los filtros estado_envio y facturado se aplican DESPUÉS, por lo que podemos
  // terminar con menos filas que el limit solicitado. Traer 3x para tener margen.
  const mlLimit      = Math.min(limit * 3, 250)  // máx 250 para no exceder timeout
  const offset       = (page - 1) * limit

  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta ML no encontrada" }, { status: 404 })
  }

  const auth     = `Bearer ${mlAccount.access_token}`
  const mlUserId = mlAccount.ml_user_id

  // Paso 1: /orders/search — devuelve buyer: { id, nickname }
  // Traer mlLimit filas en lugar de limit para compensar los filtros posteriores
  const mlParams = new URLSearchParams({
    seller: mlUserId,
    limit:  String(mlLimit),
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
    return NextResponse.json({ ok: false, error: err.message || "Error ML" }, { status: 502 })
  }
  const mlData = await mlRes.json()
  const orders: any[] = mlData.results || []
  const mlTotal = mlData.paging?.total || 0

  // Paso 2: marcar cuáles ya fueron facturadas
  // IMPORTANTE: el .in() no debe tener más de 51 elementos
  const orderIds = orders.map((o: any) => String(o.id)).slice(0, 51)  // Limitar a 51 máximo
  const { data: facturadas } = await supabase
    .from("ml_order_facturas")
    .select("ml_order_id, factura_id, empresa_id, facturado_at")
    .eq("user_id",       user.id)
    .eq("ml_account_id", account_id)
    .in("ml_order_id",   orderIds)

  const facturadaMap = new Map(
    (facturadas || []).map((f: any) => [f.ml_order_id, f])
  )

  // Paso 3: estado de envío desde /shipments/{id} — solo en chunks de 10
  const shipmentStatusMap = new Map<string, { status: string; substatus: string | null }>()
  const shipmentIds = orders.map((o: any) => o.shipping?.id).filter(Boolean).map(String)
  const CHUNK = 10

  for (let i = 0; i < shipmentIds.length; i += CHUNK) {
    const chunk = shipmentIds.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      chunk.map(sid =>
        fetch(
          `https://api.mercadolibre.com/shipments/${sid}`,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(5000) }
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

  // Armar respuesta — el nombre es el nickname (buyer.billing_info llega en GET /orders/{id} al facturar)
  let enriched = orders.map((o: any) => {
    const shipment = shipmentStatusMap.get(String(o.shipping?.id))
    return {
      id:              o.id,
      fecha:           o.date_created,
      estado:          o.status,
      envio_status:    shipment?.status    ?? null,
      envio_substatus: shipment?.substatus ?? null,
      total:           o.total_amount,
      moneda:          o.currency_id,
      comprador:       o.buyer?.nickname   || "",
      buyer_id:        String(o.buyer?.id  || ""),
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

  // ── IMPORTANTE: Aplicar filtros CLIENT-SIDE pero SOLO después de informar el total de ML ──
  // Los filtros estado_envio y facturado se aplican DESPUÉS de la paginación de ML
  // Esto es correcto porque ML no expone estos campos en /orders/search
  // Pero necesitamos que el usuario sepa que faltan resultados
  const totalBeforeFilters = enriched.length
  
  if (estado_envio && estado_envio !== "all") enriched = enriched.filter(o => o.envio_status === estado_envio)
  if (facturado === "si") enriched = enriched.filter(o => o.facturada)
  if (facturado === "no") enriched = enriched.filter(o => !o.facturada)

  const totalAfterFilters = enriched.length

  return NextResponse.json({
    ok:                   true,
    orders:               enriched,
    total:                mlTotal,          // Total de ML (sin filtros cliente)
    totalBeforeFilters:   totalBeforeFilters, // Después de paginación de ML pero antes de filtros cliente
    totalAfterFilters:    totalAfterFilters,  // Después de aplicar todos los filtros
    filteredOut:          totalBeforeFilters - totalAfterFilters,
    account:              { id: account_id, ml_user_id: mlUserId, nickname: mlAccount.nickname },
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
