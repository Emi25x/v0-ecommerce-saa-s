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
