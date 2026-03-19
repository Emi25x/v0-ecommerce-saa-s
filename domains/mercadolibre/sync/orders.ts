import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_ORDERS_LIMIT = 50

export interface SyncOrdersParams {
  account_id: string
  offset?: number
  limit?: number
}

export interface SyncOrdersResult {
  ok: boolean
  synced?: number
  total?: number
  has_more?: boolean
  offset?: number
  rate_limited?: boolean
  error?: string
}

/**
 * Sincroniza una página de órdenes de ML para una cuenta dada.
 * Extrae lógica de negocio para ser llamada desde la route y desde el cron.
 */
export async function executeSyncOrdersBatch(supabase: any, params: SyncOrdersParams): Promise<SyncOrdersResult> {
  const { account_id, offset = 0, limit = ML_ORDERS_LIMIT } = params

  const { data: account } = await supabase.from("ml_accounts").select("id, ml_user_id").eq("id", account_id).single()

  if (!account) {
    return { ok: false, error: "Account not found" }
  }

  const token = await getValidAccessToken(account_id)
  const auth = { Authorization: `Bearer ${token}` }

  const url =
    `https://api.mercadolibre.com/orders/search` +
    `?seller=${account.ml_user_id}&sort=date_desc&limit=${limit}&offset=${offset}&expand=shipping`

  const res = await fetch(url, {
    headers: auth,
    signal: AbortSignal.timeout(15_000),
  })

  if (res.status === 429) {
    return { ok: false, rate_limited: true, error: "Rate limit. Reintentar en unos segundos." }
  }
  if (!res.ok) {
    const err = await res.text()
    return { ok: false, error: `ML ${res.status}: ${err}` }
  }

  const data = await res.json()
  const orders: any[] = data.results ?? []
  const totalML: number = data.paging?.total ?? 0

  if (orders.length === 0) {
    return { ok: true, synced: 0, total: totalML, has_more: false }
  }

  const now = new Date().toISOString()
  const batch = orders.map((o: any) => ({
    account_id: account.id,
    ml_order_id: Number(o.id),
    buyer_id: o.buyer?.id ? Number(o.buyer.id) : null,
    buyer_nickname: o.buyer?.nickname ?? null,
    status: o.status,
    date_created: o.date_created,
    total_amount: o.total_amount,
    currency_id: o.currency_id ?? "ARS",
    pack_id: o.pack_id ? String(o.pack_id) : null,
    packing_status: o.pack_status ?? null,
    shipping_status: o.shipping?.status ?? null,
    shipping_id: o.shipping?.id ? Number(o.shipping.id) : null,
    items_json: (o.order_items ?? []).map((i: any) => ({
      title: i.item?.title ?? "",
      quantity: i.quantity,
      unit_price: i.unit_price,
      ml_item_id: i.item?.id ?? null,
    })),
    updated_at: now,
  }))

  const { error: upsertErr } = await supabase.from("ml_orders").upsert(batch, { onConflict: "account_id,ml_order_id" })

  if (upsertErr) {
    return { ok: false, error: upsertErr.message }
  }

  await supabase.from("ml_accounts").update({ last_order_sync_at: now }).eq("id", account_id)

  return {
    ok: true,
    synced: orders.length,
    total: totalML,
    has_more: offset + orders.length < totalML,
    offset: offset + orders.length,
  }
}
