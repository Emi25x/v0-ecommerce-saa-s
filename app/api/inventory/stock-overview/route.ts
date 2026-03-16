import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const search   = searchParams.get("search") || ""
  const zeroOnly = searchParams.get("zero") === "1"
  const page     = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit    = 50
  const offset   = (page - 1) * limit

  // ── Productos ──────────────────────────────────────────────────────────────
  let query = supabase
    .from("products")
    .select("id, sku, title, stock, stock_by_source, price", { count: "exact" })
    .order("title", { ascending: true })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%`)
  }
  if (zeroOnly) {
    query = query.eq("stock", 0)
  }

  const { data: products, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Fuentes: source.id es la clave en stock_by_source ─────────────────────
  // Agrupar por warehouse_id para la vista "Por almacén"
  const { data: sources } = await supabase
    .from("import_sources")
    .select("id, name, source_key, warehouse_id, warehouses(id, name, code)")
    .eq("is_active", true)

  // source_key → warehouse info  (stock_by_source uses source_key, not UUID)
  const sourceWarehouse: Record<string, { id: string; name: string; code: string } | null> = {}
  const sourceLabel: Record<string, string> = {}
  for (const s of sources ?? []) {
    const key = (s as any).source_key ?? s.id
    sourceWarehouse[key] = (s as any).warehouses ?? null
    sourceLabel[key] = s.name
  }

  // ── Collect all source keys present in stock_by_source ────────────────────
  const sourceKeysSet = new Set<string>()
  for (const p of products ?? []) {
    if (p.stock_by_source && typeof p.stock_by_source === "object") {
      Object.keys(p.stock_by_source).forEach(k => sourceKeysSet.add(k))
    }
  }
  const sourceKeys = Array.from(sourceKeysSet).sort()

  // ── Build warehouse → [source_keys] map ───────────────────────────────────
  const warehouseMap: Record<string, { id: string; name: string; code: string; source_keys: string[] }> = {}
  const noWarehouseKeys: string[] = []

  for (const key of sourceKeys) {
    const wh = sourceWarehouse[key]
    if (wh) {
      if (!warehouseMap[wh.id]) {
        warehouseMap[wh.id] = { ...wh, source_keys: [] }
      }
      warehouseMap[wh.id].source_keys.push(key)
    } else {
      noWarehouseKeys.push(key)
    }
  }

  const warehouses = Object.values(warehouseMap)

  return NextResponse.json({
    products: products ?? [],
    source_keys: sourceKeys,
    source_label: sourceLabel,
    warehouses,          // [{ id, name, code, source_keys[] }]
    no_warehouse_keys: noWarehouseKeys,
    total: count ?? 0,
    page,
    limit,
  })
}
