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

  // Obtener datos del comprador:
  // /orders/search solo devuelve buyer: { id } — sin nombre ni DNI.
  // Hay que llamar a GET /orders/{id} individualmente para obtener:
  //   buyer.first_name, buyer.last_name, buyer.identification (tipo/número)
  // Y GET /orders/{id}/billing_info para dirección fiscal.
  // Se procesan en lotes de 5 en serie para no hacer timeout.
  const orderBillingMap = new Map<string, {
    doc_type: string; doc_number: string
    first_name: string; last_name: string
    address: string; city: string; state: string; zip: string
  }>()

  // IMPORTANTE (doc oficial ML):
  // GET /orders/{id} y /orders/search solo devuelven buyer: { id } — SIN nombre ni DNI.
  // Para obtener nombre, apellido e identification hay que llamar a:
  //   GET /users/{buyer_id}  → first_name, last_name, identification.type/number
  // Para dirección fiscal:
  //   GET /orders/{id}/billing_info → billing_address con calle, ciudad, etc.
  // Se deduplican buyers (mismo buyer puede aparecer en varias órdenes).
  const ordersToFetch = orders.slice(0, 20)

  // Deduplicar buyer_ids para no llamar múltiples veces por el mismo comprador
  const buyerIdToOrders = new Map<string, string[]>()
  for (const o of ordersToFetch) {
    const bid = String(o.buyer?.id || "")
    if (!bid) continue
    if (!buyerIdToOrders.has(bid)) buyerIdToOrders.set(bid, [])
    buyerIdToOrders.get(bid)!.push(String(o.id))
  }

  // Mapa buyer_id → datos del comprador
  const buyerDataMap = new Map<string, { first_name: string; last_name: string; doc_type: string; doc_number: string }>()

  const buyerIds = [...buyerIdToOrders.keys()]
  const CHUNK = 5
  for (let i = 0; i < buyerIds.length; i += CHUNK) {
    const chunk = buyerIds.slice(i, i + CHUNK)
    await Promise.all(chunk.map(async (buyerId) => {
      try {
        const auth = `Bearer ${mlAccount.access_token}`
        // GET /users/{buyer_id} — devuelve perfil público con nombre e identification
        const userRes = await fetch(
          `https://api.mercadolibre.com/users/${buyerId}`,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(7000) }
        )
        if (!userRes.ok) return
        const userData = await userRes.json()
        // identification puede estar en userData.identification o userData.identification.type/number
        const ident = userData.identification || {}
        buyerDataMap.set(buyerId, {
          first_name: userData.first_name || "",
          last_name:  userData.last_name  || "",
          doc_type:   ident.type   || "",
          doc_number: ident.number || "",
        })
      } catch { /* ignorar */ }
    }))
  }

  // Dirección fiscal: GET /orders/{id}/billing_info por cada orden
  const billingAddressMap = new Map<string, { address: string; city: string; state: string; zip: string }>()
  for (let i = 0; i < ordersToFetch.length; i += CHUNK) {
    const chunk = ordersToFetch.slice(i, i + CHUNK)
    await Promise.all(chunk.map(async (o: any) => {
      try {
        const auth = `Bearer ${mlAccount.access_token}`
        const billingRes = await fetch(
          `https://api.mercadolibre.com/orders/${o.id}/billing_info`,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(7000) }
        )
        if (!billingRes.ok) return
        const bd = await billingRes.json()
        // billing_info devuelve billing_address con la dirección fiscal del comprador
        const addr = bd.billing_address || bd.buyer?.address || {}
        billingAddressMap.set(String(o.id), {
          address: addr.street_name
            ? `${addr.street_name} ${addr.street_number || ""}`.trim()
            : "",
          city:  addr.city?.name  || (typeof addr.city  === "string" ? addr.city  : "") || "",
          state: addr.state?.name || (typeof addr.state === "string" ? addr.state : "") || "",
          zip:   addr.zip_code || "",
        })
      } catch { /* ignorar */ }
    }))
  }

  // Combinar en el mapa final por order_id
  for (const o of ordersToFetch) {
    const buyerId   = String(o.buyer?.id || "")
    const buyerData = buyerDataMap.get(buyerId) || { first_name: "", last_name: "", doc_type: "", doc_number: "" }
    const addrData  = billingAddressMap.get(String(o.id)) || { address: "", city: "", state: "", zip: "" }
    orderBillingMap.set(String(o.id), { ...buyerData, ...addrData })
  }

  // Enriquecer órdenes con estado de facturación, envío y datos del comprador
  let enriched = orders.map((o: any) => {
    const shipment  = shipmentStatusMap.get(String(o.shipping?.id))
    const billing   = orderBillingMap.get(String(o.id))
    // Jerarquía: billing_info > order.buyer > "Consumidor Final"
    const firstName = billing?.first_name || o.buyer?.first_name || ""
    const lastName  = billing?.last_name  || o.buyer?.last_name  || ""
    // nickname es lo único que /orders/search siempre devuelve en buyer
    const nickname  = o.buyer?.nickname || ""
    const buyerName = [firstName, lastName].filter(Boolean).join(" ").trim()
      || nickname
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
