/**
 * Shared helpers for stock_by_source read-modify-write pattern.
 *
 * Each import source uses its own source.id as the key in stock_by_source.
 * This preserves the stock contributed by every other source/warehouse.
 * products.stock is always the sum of all entries in stock_by_source.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Build a merged stock_by_source object and recalculate total stock.
 */
export function mergeStockBySource(
  existing: Record<string, number> | null | undefined,
  sourceId: string,
  newQty: number,
): { stock_by_source: Record<string, number>; stock: number } {
  const merged = { ...(existing || {}), [sourceId]: newQty }
  const stock = Object.values(merged).reduce((s, v) => s + (Number(v) || 0), 0)
  return { stock_by_source: merged, stock }
}

/**
 * Fetch stock_by_source for a batch of products matched by a field.
 * Returns a Map: matchValue → stock_by_source
 */
export async function fetchStockBySourceBatch(
  supabase: SupabaseClient,
  matchField: "sku" | "ean",
  matchValues: string[],
): Promise<Map<string, Record<string, number>>> {
  if (matchValues.length === 0) return new Map()
  const { data } = await supabase.from("products").select(`${matchField}, stock_by_source`).in(matchField, matchValues)
  const map = new Map<string, Record<string, number>>()
  for (const p of (data as any[]) ?? []) {
    const key = p[matchField]
    if (key) map.set(key, p.stock_by_source || {})
  }
  return map
}

// ── Warehouse-level consolidated stock ────────────────────────────────────────

export interface WarehouseSourceInfo {
  source_key: string
  source_name: string
  source_id: string
}

export interface WarehouseConsolidatedProduct {
  product_id: string
  ean: string | null
  sku: string | null
  title: string | null
  /** Sum of stock_by_source[key] for all source_keys linked to this warehouse */
  warehouse_stock: number
  /** Breakdown per source within this warehouse */
  stock_detail: Record<string, number>
  /** Total stock across ALL sources (products.stock) */
  total_stock: number
}

export interface WarehouseConsolidatedResult {
  warehouse_id: string
  source_keys: string[]
  sources: WarehouseSourceInfo[]
  products: WarehouseConsolidatedProduct[]
  total_products: number
  total_warehouse_units: number
}

/**
 * Resolve the source_keys linked to a warehouse via import_sources.
 *
 * This is the canonical way to know which stock_by_source keys belong to a warehouse.
 * E.g. warehouse "España" → source_keys ["arnoia", "azeta"]
 *      warehouse "Argentina" → source_keys ["libral"]
 */
export async function getWarehouseSourceKeys(
  supabase: SupabaseClient,
  warehouseId: string,
): Promise<WarehouseSourceInfo[]> {
  const { data, error } = await supabase
    .from("import_sources")
    .select("id, name, source_key")
    .eq("warehouse_id", warehouseId)
    .eq("is_active", true)

  if (error || !data) return []

  return data
    .filter((s: any) => s.source_key)
    .map((s: any) => ({
      source_key: s.source_key as string,
      source_name: s.name as string,
      source_id: s.id as string,
    }))
}

/**
 * Calculate consolidated stock for a warehouse.
 *
 * Given a warehouse_id:
 * 1. Resolves source_keys from import_sources
 * 2. Queries products that have any of those keys in stock_by_source
 * 3. Sums stock_by_source[key] per product across matched sources
 *
 * This is the reusable building block for warehouse-level stock views.
 * Shopify push and ML sync can consume this in a future phase.
 *
 * @param options.page - 1-based page number (default 1)
 * @param options.pageSize - items per page (default 50)
 * @param options.search - optional title/sku search filter
 * @param options.minStock - optional minimum warehouse stock filter (default 0 = include zero-stock)
 */
export async function getWarehouseConsolidatedStock(
  supabase: SupabaseClient,
  warehouseId: string,
  options: { page?: number; pageSize?: number; search?: string; minStock?: number } = {},
): Promise<WarehouseConsolidatedResult> {
  const { page = 1, pageSize = 50, search, minStock = 0 } = options
  const offset = (page - 1) * pageSize

  // 1. Resolve source_keys
  const sources = await getWarehouseSourceKeys(supabase, warehouseId)
  const sourceKeys = sources.map((s) => s.source_key)

  if (sourceKeys.length === 0) {
    return {
      warehouse_id: warehouseId,
      source_keys: [],
      sources: [],
      products: [],
      total_products: 0,
      total_warehouse_units: 0,
    }
  }

  // 2. Build OR filter: stock_by_source has at least one of these keys set (not null)
  const jsonbOrFilter = sourceKeys.map((k) => `stock_by_source->>${k}.not.is.null`).join(",")

  // 3. Query products
  let query = supabase
    .from("products")
    .select("id, ean, sku, title, stock, stock_by_source", { count: "exact" })
    .or(jsonbOrFilter)
    .order("title", { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (search) {
    query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
  }

  const { data: rows, count, error } = await query

  if (error) {
    // Return empty result — callers handle gracefully. Error is in the Supabase response.
    return {
      warehouse_id: warehouseId,
      source_keys: sourceKeys,
      sources,
      products: [],
      total_products: 0,
      total_warehouse_units: 0,
    }
  }

  // 4. Calculate consolidated stock per product
  let totalWarehouseUnits = 0
  const products: WarehouseConsolidatedProduct[] = []

  for (const row of (rows ?? []) as any[]) {
    const sbs: Record<string, number> = row.stock_by_source ?? {}
    const stockDetail: Record<string, number> = {}
    let warehouseStock = 0

    for (const key of sourceKeys) {
      const qty = Number(sbs[key]) || 0
      stockDetail[key] = qty
      warehouseStock += qty
    }

    if (minStock > 0 && warehouseStock < minStock) continue

    totalWarehouseUnits += warehouseStock
    products.push({
      product_id: row.id,
      ean: row.ean ?? null,
      sku: row.sku ?? null,
      title: row.title ?? null,
      warehouse_stock: warehouseStock,
      stock_detail: stockDetail,
      total_stock: row.stock ?? 0,
    })
  }

  return {
    warehouse_id: warehouseId,
    source_keys: sourceKeys,
    sources,
    products,
    total_products: count ?? 0,
    total_warehouse_units: totalWarehouseUnits,
  }
}
