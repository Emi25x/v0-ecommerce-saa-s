import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET: listar órdenes ML con estado de facturación
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id  = searchParams.get("account_id") || ""
  const estado      = searchParams.get("estado") || ""        // paid, cancelled, etc.
  const facturado   = searchParams.get("facturado") || ""     // "si" | "no" | ""
  const fecha_desde = searchParams.get("fecha_desde") || ""
  const fecha_hasta = searchParams.get("fecha_hasta") || ""
  const page        = parseInt(searchParams.get("page") || "1")
  const limit       = parseInt(searchParams.get("limit") || "50")
  const offset      = (page - 1) * limit

  // Obtener token ML de la cuenta
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, seller_id, nickname")
    .eq("user_id", user.id)
    .eq("seller_id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta de MercadoLibre no encontrada o sin token" }, { status: 404 })
  }

  // Construir query a ML API
  const mlParams = new URLSearchParams({
    seller: mlAccount.seller_id,
    limit:  String(limit),
    offset: String(offset),
    sort:   "date_desc",
  })
  if (estado)      mlParams.set("order.status", estado)
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
  const orderIds = orders.map((o: any) => o.id)
  const { data: facturadas } = await supabase
    .from("ml_order_facturas")
    .select("ml_order_id, factura_id, empresa_id, facturado_at, facturas(numero, tipo_comprobante, cae)")
    .eq("user_id",       user.id)
    .eq("ml_account_id", String(mlAccount.seller_id))
    .in("ml_order_id",   orderIds)

  const facturadaMap = new Map(
    (facturadas || []).map((f: any) => [f.ml_order_id, f])
  )

  // Enriquecer órdenes con estado de facturación
  let enriched = orders.map((o: any) => ({
    id:            o.id,
    fecha:         o.date_created,
    estado:        o.status,
    total:         o.total_amount,
    moneda:        o.currency_id,
    comprador:     o.buyer ? `${o.buyer.first_name || ""} ${o.buyer.last_name || ""}`.trim() : "—",
    items:         (o.order_items || []).map((i: any) => ({
      titulo:    i.item?.title || "",
      cantidad:  i.quantity,
      precio:    i.unit_price,
    })),
    facturada:      facturadaMap.has(o.id),
    factura_info:   facturadaMap.get(o.id) || null,
  }))

  // Filtro de facturado client-side (ML no lo soporta)
  if (facturado === "si")  enriched = enriched.filter(o => o.facturada)
  if (facturado === "no")  enriched = enriched.filter(o => !o.facturada)

  return NextResponse.json({
    ok:      true,
    orders:  enriched,
    total:   mlData.paging?.total || enriched.length,
    account: { seller_id: mlAccount.seller_id, nickname: mlAccount.nickname },
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

  const rows = ml_order_ids.map((oid: number) => ({
    user_id:        user.id,
    ml_order_id:    oid,
    ml_account_id:  String(ml_account_id),
    factura_id:     factura_id || null,
    empresa_id:     empresa_id || null,
  }))

  const { error } = await supabase
    .from("ml_order_facturas")
    .upsert(rows, { onConflict: "ml_order_id,ml_account_id" })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
