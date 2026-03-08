import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"

export const dynamic    = "force-dynamic"
export const maxDuration = 60

const ML_ORDERS_LIMIT = 50   // max por página en orders/search

/**
 * POST /api/ml/sync-orders
 * Body: { account_id, offset?: number, limit?: number }
 *
 * Usa /users/{id}/orders/search con expand=order_items — ya devuelve todos los
 * datos necesarios en UNA sola llamada, sin loop individual por orden.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase    = await createClient()
    const body        = await request.json()
    const { account_id, offset = 0, limit = ML_ORDERS_LIMIT } = body

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const { data: account } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id")
      .eq("id", account_id)
      .single()

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const token = await getValidAccessToken(account_id)
    const auth  = { Authorization: `Bearer ${token}` }

    // Una sola llamada — orders/search devuelve órdenes completas con buyer + shipping
    const url = `https://api.mercadolibre.com/orders/search` +
      `?seller=${account.ml_user_id}&sort=date_desc&limit=${limit}&offset=${offset}`

    const res = await fetch(url, {
      headers: auth,
      signal:  AbortSignal.timeout(15_000),
    })

    if (res.status === 429) {
      return NextResponse.json({ ok: false, rate_limited: true, message: "Rate limit. Reintentar en unos segundos." })
    }
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ ok: false, error: `ML ${res.status}: ${err}` }, { status: 502 })
    }

    const data    = await res.json()
    const orders: any[] = data.results ?? []
    const totalML: number  = data.paging?.total ?? 0

    if (orders.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, total: totalML, has_more: false })
    }

    // Construir batch de upsert — types deben coincidir con ml_orders schema:
    // ml_order_id bigint, buyer_id bigint, shipping_id bigint, items_json jsonb
    const now   = new Date().toISOString()
    const batch = orders.map((o: any) => ({
      account_id:      account.id,
      ml_order_id:     Number(o.id),
      buyer_id:        o.buyer?.id ? Number(o.buyer.id) : null,
      buyer_nickname:  o.buyer?.nickname ?? null,
      status:          o.status,
      date_created:    o.date_created,
      total_amount:    o.total_amount,
      currency_id:     o.currency_id ?? "ARS",
      packing_status:  o.pack_status  ?? null,
      shipping_status: o.shipping?.status ?? null,
      shipping_id:     o.shipping?.id ? Number(o.shipping.id) : null,
      // jsonb — pasar objeto directamente, no JSON.stringify
      items_json: (o.order_items ?? []).map((i: any) => ({
        title:      i.item?.title ?? "",
        quantity:   i.quantity,
        unit_price: i.unit_price,
        ml_item_id: i.item?.id ?? null,
      })),
      updated_at: now,
    }))

    const { error: upsertErr } = await supabase
      .from("ml_orders")
      .upsert(batch, { onConflict: "account_id,ml_order_id" })

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 })
    }

    // Actualizar última sincronización en la cuenta
    await supabase
      .from("ml_accounts")
      .update({ last_order_sync_at: now })
      .eq("id", account_id)

    return NextResponse.json({
      ok:       true,
      synced:   orders.length,
      total:    totalML,
      has_more: offset + orders.length < totalML,
      offset:   offset + orders.length,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
