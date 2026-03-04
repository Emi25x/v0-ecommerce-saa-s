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
  // Nota: order.shipping.status no funciona bien en la API ML, se filtra client-side
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

  // FLUJO CORRECTO para datos fiscales del comprador (doc oficial ML):
  // Paso 1: GET /orders/{id}  →  leer buyer.billing_info.id
  // Paso 2: GET /orders/billing-info/MLA/{billing_info_id}  →  nombre, DNI/CUIT, dirección fiscal
  //
  // Además se consulta /shipments/{id} solo para el estado del envío.

  const CHUNK = 5

  // Estado de envíos
  const shipmentStatusMap = new Map<string, { status: string; substatus: string | null }>()
  const shipmentIds = orders.map((o: any) => o.shipping?.id).filter(Boolean).map(String)
  if (shipmentIds.length > 0) {
    for (let i = 0; i < shipmentIds.length; i += CHUNK) {
      const chunk = shipmentIds.slice(i, i + CHUNK)
      await Promise.all(chunk.map(async (sid) => {
        try {
          const sr = await fetch(
            `https://api.mercadolibre.com/shipments/${sid}`,
            { headers: { Authorization: `Bearer ${mlAccount.access_token}` }, signal: AbortSignal.timeout(6000) }
          )
          if (!sr.ok) return
          const s = await sr.json()
          shipmentStatusMap.set(String(s.id), { status: s.status || "", substatus: s.substatus || null })
        } catch { /* ignorar */ }
      }))
    }
  }

  // Datos fiscales del comprador:
  // GET /orders/{id} devuelve buyer.billing_info con todos los datos fiscales directamente.
  // Estructura real confirmada:
  //   buyer.billing_info.name           → primer nombre
  //   buyer.billing_info.last_name      → apellido
  //   buyer.billing_info.identification → { type: "DNI", number: "26044763" }
  // No hace falta un segundo llamado — los datos ya vienen en la orden.
  const orderBillingMap = new Map<string, {
    first_name: string; last_name: string
    doc_type: string;   doc_number: string
  }>()

  for (let i = 0; i < orders.length; i += CHUNK) {
    const chunk = orders.slice(i, i + CHUNK)
    await Promise.all(chunk.map(async (o: any) => {
      try {
        const auth      = `Bearer ${mlAccount.access_token}`
        const orderRes  = await fetch(
          `https://api.mercadolibre.com/orders/${o.id}`,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(6000) }
        )
        if (!orderRes.ok) return
        const orderDetail  = await orderRes.json()
        const bi           = orderDetail?.buyer?.billing_info || {}
        const ident        = bi.identification || {}

        orderBillingMap.set(String(o.id), {
          first_name: bi.name      || bi.first_name || "",
          last_name:  bi.last_name || "",
          doc_type:   ident.type   || "",
          doc_number: ident.number || "",
        })
      } catch { /* ignorar */ }
    }))
  }

  // Enriquecer órdenes con estado de facturación, envío y datos del comprador
  let enriched = orders.map((o: any) => {
    const shipment  = shipmentStatusMap.get(String(o.shipping?.id))
    const billing   = orderBillingMap.get(String(o.id))
    // buyer.billing_info.name = primer nombre, buyer.billing_info.last_name = apellido
    const buyerName = [billing?.first_name, billing?.last_name].filter(Boolean).join(" ").trim()
      || o.buyer?.nickname
      || ""

    return {
      id:                  o.id,
      fecha:               o.date_created,
      estado:              o.status,
      envio_status:        shipment?.status    || null,
      envio_substatus:     shipment?.substatus || null,
      total:               o.total_amount,
      moneda:              o.currency_id,
      comprador:           buyerName,
      comprador_doc:       billing?.doc_number || null,
      comprador_doc_tipo:  billing?.doc_type   || null,
      buyer_id:            String(o.buyer?.id || ""),
      items:               (o.order_items || []).map((i: any) => ({
        titulo:   i.item?.title || "",
        ean:      i.item?.attributes?.find((a: any) => a.id === "EAN")?.value_name || null,
        cantidad: i.quantity,
        precio:   Math.round(i.unit_price * 100) / 100,
      })),
      facturada:    facturadaMap.has(String(o.id)),
      factura_info: facturadaMap.get(String(o.id)) || null,
    }
  })

  // Filtros client-side (ML no soporta estos nativamente o falla)
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
