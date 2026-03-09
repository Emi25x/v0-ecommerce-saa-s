import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET: listar órdenes ML desde DB local (ml_orders) con filtros y paginación exacta.
// No llama a ML API para listar — evita el bug de filtros client-side post-paginación
// que causaba páginas vacías cuando shipping_status o facturado filtraban los resultados.
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

  if (!account_id) {
    return NextResponse.json({ ok: false, error: "Falta account_id" }, { status: 400 })
  }

  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!mlAccount) {
    return NextResponse.json({ ok: false, error: "Cuenta ML no encontrada" }, { status: 404 })
  }

  // Órdenes ya facturadas por este usuario (para filtro facturado si/no)
  const { data: facturadas } = await supabase
    .from("ml_order_facturas")
    .select("ml_order_id, factura_id, empresa_id, facturado_at")
    .eq("user_id",       user.id)
    .eq("ml_account_id", account_id)

  const facturadaMap = new Map((facturadas || []).map((f: any) => [f.ml_order_id, f]))
  const facturadaIds = Array.from(facturadaMap.keys())   // string[]

  // Cuando facturado=si pero no hay ninguna facturada, devolver vacío directamente
  if (facturado === "si" && facturadaIds.length === 0) {
    return NextResponse.json({
      ok: true, orders: [], total: 0,
      account: { id: account_id, ml_user_id: mlAccount.ml_user_id, nickname: mlAccount.nickname },
    })
  }

  // Aplica todos los filtros a un query base
  function applyFilters(q: any): any {
    q = q.eq("account_id", account_id)
    if (estado)       q = q.eq("status",          estado)
    if (estado_envio) q = q.eq("shipping_status",  estado_envio)
    if (fecha_desde)  q = q.gte("date_created",    fecha_desde)
    if (fecha_hasta)  q = q.lte("date_created",    fecha_hasta)
    if (facturado === "si" && facturadaIds.length > 0)
      q = q.in("ml_order_id", facturadaIds)
    if (facturado === "no" && facturadaIds.length > 0)
      q = q.not("ml_order_id", "in", `(${facturadaIds.join(",")})`)
    return q
  }

  // Count exacto (respeta todos los filtros)
  let countQ = supabase.from("ml_orders").select("id", { count: "exact", head: true })
  countQ = applyFilters(countQ)
  const { count } = await countQ

  // Filas paginadas
  let dataQ = supabase
    .from("ml_orders")
    .select("ml_order_id, status, date_created, total_amount, currency_id, buyer_nickname, buyer_id, shipping_status, items_json")
    .order("date_created", { ascending: false })
    .range(offset, offset + limit - 1)
  dataQ = applyFilters(dataQ)
  const { data: orders } = await dataQ

  const enriched = (orders || []).map((o: any) => {
    const items: any[] = Array.isArray(o.items_json) ? o.items_json : []
    const key = String(o.ml_order_id)
    return {
      id:              o.ml_order_id,
      fecha:           o.date_created,
      estado:          o.status,
      envio_status:    o.shipping_status ?? null,
      envio_substatus: null,
      total:           o.total_amount,
      moneda:          o.currency_id,
      comprador:       o.buyer_nickname  || "",
      buyer_id:        String(o.buyer_id || ""),
      items: items.map(i => ({
        titulo:   i.title      || "",
        ean:      null,
        cantidad: i.quantity,
        precio:   i.unit_price,
      })),
      facturada:    facturadaMap.has(key),
      factura_info: facturadaMap.get(key) || null,
    }
  })

  return NextResponse.json({
    ok:      true,
    orders:  enriched,
    total:   count ?? 0,
    account: { id: account_id, ml_user_id: mlAccount.ml_user_id, nickname: mlAccount.nickname },
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
