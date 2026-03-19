import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

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
    const page = parseInt(searchParams.get("page") ?? "0", 10)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)
    const accountId = searchParams.get("account_id")
    const status = searchParams.get("status")
    const q = searchParams.get("q")?.trim()

    const supabase = await createClient()

    function applyFilters(qb: any): any {
      if (accountId) qb = qb.eq("account_id", accountId)
      if (status) qb = qb.eq("status", status)
      // ml_order_id es bigint — buscar siempre por nickname; si q es numérico, filtrar también por id exacto
      if (q) {
        const isNumeric = /^\d+$/.test(q)
        if (isNumeric) {
          qb = qb.or(`buyer_nickname.ilike.%${q}%,ml_order_id.eq.${parseInt(q, 10)}`)
        } else {
          qb = qb.ilike("buyer_nickname", `%${q}%`)
        }
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
      .select(
        "id, ml_order_id, account_id, buyer_id, buyer_nickname, status, date_created, total_amount, currency_id, shipping_status, shipping_id, packing_status, items_json, updated_at",
      )
      .order("date_created", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    dataQ = applyFilters(dataQ)

    const { data, error } = await dataQ
    if (error) throw error

    const rows = data ?? []

    // ── Join factura_status from facturas via orden_id ──────────────────────
    // facturas.orden_id is text, ml_orders.ml_order_id is bigint — cast to match
    if (rows.length > 0) {
      const orderIds = rows.map((r) => String(r.ml_order_id))
      const { data: facturas } = await supabase
        .from("facturas")
        .select("orden_id, estado, cae, numero, tipo_comprobante")
        .in("orden_id", orderIds)
        .eq("origen", "ml")

      // Build lookup: orden_id → factura
      const facturaMap = new Map<
        string,
        { estado: string; cae: string | null; numero: number | null; tipo_comprobante: number | null }
      >()
      for (const f of facturas ?? []) {
        if (f.orden_id) facturaMap.set(f.orden_id, f)
      }

      // Attach factura_status to each row
      const enriched = rows.map((r) => ({
        ...r,
        factura: facturaMap.get(String(r.ml_order_id)) ?? null,
      }))

      return NextResponse.json({ ok: true, rows: enriched, total: exactCount ?? 0 })
    }

    return NextResponse.json({ ok: true, rows, total: exactCount ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
