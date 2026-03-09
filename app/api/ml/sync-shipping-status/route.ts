import { createClient } from "@/lib/supabase/server"
import { getValidAccessToken } from "@/lib/mercadolibre"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

/**
 * POST /api/ml/sync-shipping-status
 *
 * Actualiza shipping_status en ml_orders para órdenes que tienen shipping_id
 * pero shipping_status IS NULL. Llama directamente a /shipments/{id} de ML —
 * más confiable que expand=shipping en orders/search.
 *
 * Body: { account_id, limit?: number }
 * Response: { ok, updated, total_checked }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { account_id, limit = 500, fecha_desde, fecha_hasta } = body

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

  // Órdenes con shipping_id que aún no están en estado terminal (delivered/not_delivered/cancelled).
  // Incluye shipping_status NULL y estados intermedios (ready_to_ship, shipped, handling, pending)
  // para que las órdenes entregadas se actualicen aunque ya tuvieran un estado previo.
  // Si se pasa fecha_desde/fecha_hasta se priorizan las órdenes del período visible.
  let ordersQuery = supabase
    .from("ml_orders")
    .select("ml_order_id, shipping_id")
    .eq("account_id", account_id)
    .not("shipping_id", "is", null)
    .or("shipping_status.is.null,shipping_status.eq.ready_to_ship,shipping_status.eq.shipped,shipping_status.eq.handling,shipping_status.eq.pending")

  if (fecha_desde) ordersQuery = ordersQuery.gte("date_created", fecha_desde)
  if (fecha_hasta) ordersQuery = ordersQuery.lte("date_created", fecha_hasta)

  const { data: ordersToSync, error: fetchErr } = await ordersQuery.limit(limit)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!ordersToSync || ordersToSync.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, total_checked: 0 })
  }

  const token = await getValidAccessToken(account_id)
  const authHeader = { Authorization: `Bearer ${token}` }

  // Fetches en paralelo de a 20 para no saturar la API
  const BATCH = 20
  let updated = 0

  for (let i = 0; i < ordersToSync.length; i += BATCH) {
    const batch = ordersToSync.slice(i, i + BATCH)

    const settled = await Promise.allSettled(
      batch.map(async (order) => {
        const res = await fetch(
          `https://api.mercadolibre.com/shipments/${order.shipping_id}`,
          { headers: authHeader, signal: AbortSignal.timeout(10_000) },
        )
        if (!res.ok) return null
        const data = await res.json()
        if (!data.status) return null
        return { ml_order_id: order.ml_order_id, status: data.status as string }
      }),
    )

    // Actualizar DB en un solo upsert por batch
    const toUpdate = settled
      .filter((r): r is PromiseFulfilledResult<{ ml_order_id: any; status: string }> =>
        r.status === "fulfilled" && r.value !== null,
      )
      .map(r => r.value)

    for (const row of toUpdate) {
      await supabase
        .from("ml_orders")
        .update({ shipping_status: row.status })
        .eq("account_id", account_id)
        .eq("ml_order_id", row.ml_order_id)
      updated++
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    total_checked: ordersToSync.length,
  })
}
