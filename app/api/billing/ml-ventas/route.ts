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

  // Obtener estado de envíos — ML devuelve solo shipment.id en orders/search
  // Se consulta /shipments/{id} en paralelo (chunks de 20 para no saturar)
  const shipmentStatusMap = new Map<string, { status: string; substatus: string | null }>()
  const shipmentIds = orders.map((o: any) => o.shipping?.id).filter(Boolean).map(String)

  if (shipmentIds.length > 0) {
    const chunks: string[][] = []
    for (let i = 0; i < shipmentIds.length; i += 20) chunks.push(shipmentIds.slice(i, i + 20))
    await Promise.all(chunks.map(async (chunk) => {
      await Promise.all(chunk.map(async (sid) => {
        try {
          const sr = await fetch(
            `https://api.mercadolibre.com/shipments/${sid}`,
            { headers: { Authorization: `Bearer ${mlAccount.access_token}` } }
          )
          if (sr.ok) {
            const s = await sr.json()
            if (s?.id) shipmentStatusMap.set(String(s.id), { status: s.status || "", substatus: s.substatus || null })
          }
        } catch { /* ignorar */ }
      }))
    }))
  }

  // Obtener datos del comprador combinando dos endpoints de ML:
  // • GET /orders/{id}              → buyer.first_name, last_name, identification
  // • GET /orders/{id}/billing_info → buyer.identification (doc_type/number), dirección fiscal
  //
  // IMPORTANTE: se procesan en lotes de 5 en serie para evitar timeout en Vercel.
  // billing_info estructura real: { buyer: { first_name, last_name, identification: { type, number }, ... } }
  const orderBillingMap = new Map<string, {
    doc_type: string; doc_number: string
    first_name: string; last_name: string
    address: string; city: string; state: string; zip: string
  }>()

  const ordersToFetch = orders.slice(0, 20)
  const CHUNK = 5
  for (let i = 0; i < ordersToFetch.length; i += CHUNK) {
    const chunk = ordersToFetch.slice(i, i + CHUNK)
    await Promise.all(chunk.map(async (o: any) => {
      try {
        const headers = { Authorization: `Bearer ${mlAccount.access_token}` }
        // Timeout de 5s por llamada para no colgar el handler en Vercel
        const signal  = AbortSignal.timeout(5000)

        // billing_info trae nombre + doc del comprador
        const billingRes = await fetch(
          `https://api.mercadolibre.com/orders/${o.id}/billing_info`,
          { headers, signal }
        )

        if (!billingRes.ok) return

        const bd = await billingRes.json()

        // Estructura real de ML billing_info:
        // { buyer: { first_name, last_name, identification: { type: "DNI"|"CUIT", number: "..." }, ... } }
        const buyer  = bd.buyer  || bd.payer  || {}
        const seller = bd.seller || {}
        const ident  = buyer.identification || buyer.doc || {}

        // Dirección: puede estar en billing_address o en address
        const addr   = bd.billing_address || buyer.address || {}

        orderBillingMap.set(String(o.id), {
          first_name: buyer.first_name || "",
          last_name:  buyer.last_name  || "",
          doc_type:   ident.type       || "",
          doc_number: ident.number     || "",
          address:    addr.street_name ? `${addr.street_name} ${addr.street_number || ""}`.trim() : "",
          city:       addr.city?.name  || addr.city || "",
          state:      addr.state?.name || addr.state || "",
          zip:        addr.zip_code    || "",
        })
      } catch { /* ignorar errores individuales */ }
    }))
  }

  // Enriquecer órdenes con estado de facturación, envío y datos del comprador
  let enriched = orders.map((o: any) => {
    const shipment  = shipmentStatusMap.get(String(o.shipping?.id))
    const billing   = orderBillingMap.get(String(o.id))
    // billing_info trae nombre completo; fallback a lo que venga en la orden
    const firstName = billing?.first_name || ""
    const lastName  = billing?.last_name  || ""
    const buyerName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Consumidor Final"

    return {
      id:                  o.id,
      fecha:               o.date_created,
      estado:              o.status,
      envio_status:        shipment?.status    || null,
      envio_substatus:     shipment?.substatus || null,
      total:               o.total_amount,
      moneda:              o.currency_id,
      comprador:           buyerName || "Consumidor Final",
      comprador_doc:       billing?.doc_number || o.buyer?.identification?.number || null,
      comprador_doc_tipo:  billing?.doc_type   || null,
      comprador_address:   billing?.address    || null,
      comprador_city:      billing?.city       || null,
      comprador_state:     billing?.state      || null,
      comprador_zip:       billing?.zip        || null,
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
