import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/suppliers/stock-aggregate
 *
 * Agrega stock de todos los proveedores por EAN para un warehouse dado,
 * usando SUM (aggregation_mode = 'sum').
 * Actualiza products.stock para cada EAN encontrado en la tabla products.
 *
 * Body: { warehouse_id: string, dry_run?: boolean }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient({ useServiceRole: true })
  const body     = await request.json()

  const warehouseId: string = body.warehouse_id
  const dryRun: boolean     = body.dry_run === true

  if (!warehouseId) {
    return NextResponse.json({ error: "warehouse_id requerido" }, { status: 400 })
  }

  // ── Fetch all supplier_stock for this warehouse ────────────────────────────
  const { data: stockRows, error: stockErr } = await supabase
    .from("supplier_stock")
    .select("ean, quantity, supplier_id")
    .eq("warehouse_id", warehouseId)

  if (stockErr) return NextResponse.json({ error: stockErr.message }, { status: 500 })

  // ── Aggregate: SUM per EAN ─────────────────────────────────────────────────
  const totals = new Map<string, number>()
  for (const row of stockRows ?? []) {
    if (!row.ean) continue
    totals.set(row.ean, (totals.get(row.ean) ?? 0) + (row.quantity ?? 0))
  }

  if (totals.size === 0) {
    return NextResponse.json({ ok: true, updated: 0, not_found: 0, message: "No hay stock para este almacén" })
  }

  // ── Fetch products by EAN ──────────────────────────────────────────────────
  const eans = [...totals.keys()]
  const { data: products } = await supabase
    .from("products")
    .select("id, ean")
    .in("ean", eans)

  const eanToProductId = new Map<string, string>()
  for (const p of products ?? []) {
    if (p.ean) eanToProductId.set(p.ean, p.id)
  }

  if (dryRun) {
    const preview = [...totals.entries()].slice(0, 20).map(([ean, qty]) => ({
      ean,
      total_stock: qty,
      product_found: eanToProductId.has(ean),
    }))
    return NextResponse.json({
      ok:         true,
      dry_run:    true,
      total_eans: totals.size,
      matched:    eanToProductId.size,
      not_found:  totals.size - eanToProductId.size,
      preview,
    })
  }

  // ── Update products.stock ──────────────────────────────────────────────────
  let updated  = 0
  let notFound = 0
  const CHUNK  = 200

  const updates = [...totals.entries()]
    .map(([ean, qty]) => ({ id: eanToProductId.get(ean), qty }))
    .filter(u => u.id != null)

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    for (const u of chunk) {
      const { error } = await supabase
        .from("products")
        .update({ stock: u.qty })
        .eq("id", u.id!)
      if (error) continue
      updated++
    }
  }

  notFound = totals.size - eanToProductId.size

  return NextResponse.json({
    ok:        true,
    updated,
    not_found: notFound,
    total_eans: totals.size,
  })
}

/**
 * GET /api/suppliers/stock-aggregate?warehouse_id=xxx
 * Devuelve resumen de stock por proveedor para un warehouse
 */
export async function GET(request: NextRequest) {
  const supabase    = await createClient({ useServiceRole: true })
  const warehouseId = new URL(request.url).searchParams.get("warehouse_id")

  const query = supabase
    .from("supplier_stock")
    .select("supplier_id, ean, quantity, updated_at, suppliers(name, code)")
  if (warehouseId) query.eq("warehouse_id", warehouseId as any)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Summarize per supplier
  const bySupplier = new Map<string, { name: string; code: string; eans: number; total_stock: number; updated_at: string | null }>()
  for (const row of data ?? []) {
    const sid  = row.supplier_id
    const name = (row as any).suppliers?.name ?? sid
    const code = (row as any).suppliers?.code ?? sid
    if (!bySupplier.has(sid)) bySupplier.set(sid, { name, code, eans: 0, total_stock: 0, updated_at: null })
    const s = bySupplier.get(sid)!
    s.eans++
    s.total_stock += row.quantity ?? 0
    if (!s.updated_at || row.updated_at > s.updated_at) s.updated_at = row.updated_at
  }

  return NextResponse.json({
    ok:        true,
    warehouse_id: warehouseId,
    suppliers: [...bySupplier.values()],
    total_eans: data?.length ?? 0,
  })
}
