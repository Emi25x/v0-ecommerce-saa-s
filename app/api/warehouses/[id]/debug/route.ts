import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/warehouses/[id]/debug
 * Diagnóstico del estado de datos del almacén. Solo para desarrollo.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // 2. import_sources.warehouse_id columna existe?
  try {
    const { data: sources, error: sErr } = await supabase
      .from("import_sources")
      .select("id, name, warehouse_id, is_active")
      .eq("warehouse_id", warehouseId)
    result.linked_sources = sources ?? []
    result.linked_sources_error = sErr?.message ?? null
  } catch (e: any) {
    result.linked_sources = []
    result.linked_sources_error = e.message
  }

  // 3. Todas las fuentes (para ver si hay warehouse_id columna)
  try {
    const { data: allSources, error: asErr } = await supabase
      .from("import_sources")
      .select("id, name, warehouse_id")
      .limit(20)
    result.all_sources_sample = allSources ?? asErr?.message
  } catch (e: any) {
    result.all_sources_sample = `ERROR: ${e.message}`
  }

  // 4. supplier_catalog_items para este almacén
  const { count: catalogCount } = await supabase
    .from("supplier_catalog_items")
    .select("*", { count: "exact", head: true })
    .eq("warehouse_id", warehouseId)
  result.supplier_catalog_items_count = catalogCount

  // 5. Total productos con stock > 0
  const { count: stockedCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .gt("stock", 0)
  result.products_with_stock_gt_0 = stockedCount

  // 6. Total productos con stock_by_source NOT NULL
  const { count: sbsCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .not("stock_by_source", "is", null)
  result.products_with_stock_by_source = sbsCount

  // 7. Muestra de stock_by_source para ver claves reales
  const { data: sbsSample } = await supabase
    .from("products")
    .select("id, ean, stock, stock_by_source")
    .not("stock_by_source", "is", null)
    .limit(5)
  result.stock_by_source_sample = sbsSample ?? []

  // 8. Probar filtro JSONB para "azeta"
  const { count: azetaCount, error: azetaErr } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .not("stock_by_source->azeta", "is", null)
  result.products_with_azeta_stock = azetaCount
  result.azeta_filter_error = azetaErr?.message ?? null

  // 9. Probar filtro JSONB para "arnoia"
  const { count: arnoiaCount, error: arnoiaErr } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .not("stock_by_source->arnoia", "is", null)
  result.products_with_arnoia_stock = arnoiaCount
  result.arnoia_filter_error = arnoiaErr?.message ?? null

  // 10. Total productos
  const { count: totalProds } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
  result.total_products = totalProds

  return NextResponse.json(result, { status: 200 })
}
