import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

/**
 * GET /api/warehouses/[id]/debug
 * Diagnóstico completo del almacén. Solo para desarrollo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createAdminClient()
  const { id: warehouseId } = await params
  const result: Record<string, any> = { warehouseId }

  // 1. El almacén existe?
  const { data: warehouse, error: wErr } = await supabase
    .from("warehouses")
    .select("id, name, code")
    .eq("id", warehouseId)
    .single()
  result.warehouse = warehouse ?? wErr?.message

  // 2. Fuentes vinculadas a este almacén
  const { data: sources, error: sErr } = await supabase
    .from("import_sources")
    .select("id, name, warehouse_id, is_active")
    .eq("warehouse_id", warehouseId)
  result.linked_sources = sources ?? []
  result.linked_sources_error = sErr?.message ?? null

  // 3. supplier_catalog_items para este almacén
  const { count: catalogCount, error: catErr } = await supabase
    .from("supplier_catalog_items")
    .select("*", { count: "exact", head: true })
    .eq("warehouse_id", warehouseId)
  result.supplier_catalog_items_count = catalogCount
  result.catalog_error = catErr?.message ?? null

  // 4. Total productos
  const { count: totalProds, error: totalErr } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
  result.total_products = totalProds
  result.total_products_error = totalErr?.message ?? null

  // 5. Productos con stock > 0
  const { count: stockedCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .gt("stock", 0)
  result.products_with_stock_gt_0 = stockedCount

  // 6. Stock_by_source: muestra de los primeros 3 productos con stock > 0
  const { data: sbsSample, error: sbsErr } = await supabase
    .from("products")
    .select("id, ean, stock, stock_by_source")
    .gt("stock", 0)
    .limit(3)
  result.stock_by_source_sample = sbsSample ?? []
  result.stock_by_source_sample_error = sbsErr?.message ?? null

  // 7. Para cada fuente vinculada, probar el filtro JSONB con source.id como clave
  result.per_source_counts = []
  for (const src of sources ?? []) {
    // Usar el operador ->  (extrae JSONB value) — más seguro para UUIDs
    const { count: srcCount, error: srcErr } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not(`stock_by_source->${src.id}`, "is", null)
    result.per_source_counts.push({
      source_id: src.id,
      source_name: src.name,
      count: srcCount,
      error: srcErr?.message ?? null,
    })
  }

  // 8. Contar productos con stock_by_source vacío ({}) para saber cuántos necesitan backfill
  // Filtrar donde stock_by_source IS NULL OR es objeto vacío
  const { count: emptyCount, error: emptyErr } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .gt("stock", 0)
    .or("stock_by_source.is.null,stock_by_source.eq.{}")
  result.products_needing_backfill = emptyCount
  result.backfill_filter_error = emptyErr?.message ?? null

  return NextResponse.json(result, { status: 200 })
}
