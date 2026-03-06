import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/ml/orders
 * Params: account_id?, status?, q?, page?, limit?
 *
 * Lee órdenes de ml_orders (DB local) con paginación y filtros.
 * El total se calcula con un HEAD query separado para evitar el cap de 1000.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const page      = parseInt(searchParams.get("page")  ?? "0", 10)
    const limit     = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)
    const accountId = searchParams.get("account_id")
    const status    = searchParams.get("status")
    const q         = searchParams.get("q")?.trim()

    const supabase = await createClient()

    function applyFilters(qb: any): any {
      if (accountId) qb = qb.eq("account_id", accountId)
      if (status)    qb = qb.eq("status", status)
      // ml_order_id es bigint — buscar por igualdad si q es numérico, por nickname siempre
      if (q) {
        const isNumeric = /^\d+$/.test(q)
        qb = isNumeric
          ? qb.or(`buyer_nickname.ilike.%${q}%,ml_order_id.eq.${q}`)
          : qb.ilike("buyer_nickname", `%${q}%`)
      }
      return qb
    }

    // ── Exact count (HEAD, no cap) ──────────────────────────────────────────
    let countQ = supabase.from("ml_orders").select("id", { count: "exact", head: true })
    countQ = applyFilters(countQ)
    const { count: exactCount, error: countErr } = await countQ
    if (countErr) throw countErr

    // ── Paginated rows ──────────────────────────────────────────────────────
    let dataQ = supabase
      .from("ml_orders")
      .select("id, ml_order_id, account_id, buyer_id, buyer_nickname, status, date_created, total_amount, currency_id, shipping_status, shipping_id, packing_status, items_json, updated_at")
      .order("date_created", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    dataQ = applyFilters(dataQ)

    const { data, error } = await dataQ
    if (error) throw error

    return NextResponse.json({ ok: true, rows: data ?? [], total: exactCount ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
