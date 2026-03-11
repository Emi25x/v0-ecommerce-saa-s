import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const PAGE_SIZE = 50

/**
 * GET /api/warehouses/[id]/stock
 *
 * Devuelve el stock de un almacén. Dos modos:
 *  1. Catálogo: si hay supplier_catalog_items para este almacén
 *  2. Productos: filtra products.stock_by_source por los source_key de las fuentes vinculadas
 *     (ej: stock_by_source->>'libral' IS NOT NULL para fuente "Libral Argentina")
 *     Si no hay datos en stock_by_source aún, fallback: todos los productos con stock > 0.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: warehouseId } = await params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, name, code, is_default")
      .eq("id", warehouseId)
      .eq("owner_user_id", user.id)
      .single()

    if (warehouseError || !warehouse) {
      return NextResponse.json({ error: "Almacén no encontrado" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") ?? ""
    const page = parseInt(searchParams.get("page") ?? "1", 10)
    const offset = (page - 1) * PAGE_SIZE

    // ── Fuentes vinculadas (con source_key) ───────────────────────────────────
    const { data: linkedSources } = await supabase
      .from("import_sources")
      .select("id, name, source_key")
      .eq("warehouse_id", warehouseId)
      .eq("is_active", true)

    const sourceNames = (linkedSources ?? []).map((s: any) => s.name)
    // source_keys: claves cortas para filtrar stock_by_source (ej: ["libral", "azeta"])
    const sourceKeys = (linkedSources ?? [])
      .map((s: any) => s.source_key ?? s.name.split(" ")[0].toLowerCase())
      .filter(Boolean)

    // ── Modo 1: supplier_catalog_items ────────────────────────────────────────
    const { count: catalogCount } = await supabase
      .from("supplier_catalog_items")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)

    if ((catalogCount ?? 0) > 0) {
      return catalogModeResponse({ supabase, warehouseId, warehouse, sourceNames, search, page, offset })
    }

    // ── Sin fuentes → vacío ───────────────────────────────────────────────────
    if (sourceKeys.length === 0) {
      return NextResponse.json(emptyResponse(warehouse, sourceNames))
    }

    // ── Modo 2: products filtrados por stock_by_source[source_key] ────────────
    // Los source_keys son cadenas cortas sin guiones (e.g. "libral", "azeta")
    // por lo que el filtro JSONB funciona correctamente en PostgREST.
    //
    // Construir filtro OR: stock_by_source->>'key1'.not.is.null,stock_by_source->>'key2'.not.is.null,...
    const jsonbOrFilter = sourceKeys.map((k: string) => `stock_by_source->>${k}.not.is.null`).join(",")

    // Contar cuántos productos ya tienen stock_by_source poblado con alguna de estas claves
    let { count: jsonbCount, error: jsonbTestErr } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .or(jsonbOrFilter)

    if (jsonbTestErr) {
      console.error("[WAREHOUSE STOCK] JSONB filter error:", jsonbTestErr.message)
      jsonbCount = 0
    }

    const hasSourceData = (jsonbCount ?? 0) > 0

    // Construir queries según si hay datos de stock_by_source o no
    let prodQ = supabase
      .from("products")
      .select("id, sku, title, stock, cost_price, stock_by_source")
      .gt("stock", 0)
      .order("stock", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    // Always filter by stock > 0 for both data and count
    let countQ = supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .gt("stock", 0)

    if (hasSourceData) {
      // Filtrar por source_key en stock_by_source
      prodQ = prodQ.or(jsonbOrFilter)
      countQ = countQ.or(jsonbOrFilter)
    }

    if (search) {
      prodQ = prodQ.or(`title.ilike.%${search}%,sku.ilike.%${search}%`)
      countQ = countQ.or(`title.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const [{ data: prodData, error: prodErr }, { count: totalCount }] = await Promise.all([prodQ, countQ])

    if (prodErr) {
      console.error("[WAREHOUSE STOCK] Products query error:", prodErr.message)
    }

    const prodItems = (prodData ?? []) as Array<{
      id: string; sku: string | null; title: string | null
      stock: number | null; cost_price: number | null; stock_by_source: Record<string, number> | null
    }>

    // ML enrichment
    const productIds = prodItems.map((p) => p.id)
    const mlMap = await fetchMLMap(supabase, productIds)

    const items = prodItems.map((p) => {
      // Calcular stock específico de las fuentes del almacén
      const sourceStock = sourceKeys.reduce((sum: number, k: string) => sum + (p.stock_by_source?.[k] ?? 0), 0)
      const displayStock = sourceStock > 0 ? sourceStock : (p.stock ?? 0)
      return {
        id: `prod_${p.id}`,
        supplier_ean: p.sku,
        supplier_sku: p.sku,
        title: p.title ?? "",
        stock_quantity: displayStock,
        price_original: p.cost_price,
        matched_by: "products",
        product_id: p.id,
        products: { id: p.id, ean: p.sku, sku: p.sku, title: p.title },
        ml_publications: mlMap[p.id] ?? [],
      }
    })

    const totalSKUs = totalCount ?? 0

    return NextResponse.json({
      warehouse,
      items,
      data_source: hasSourceData ? "products_by_source" : "products_fallback",
      linked_sources: sourceNames,
      source_keys: sourceKeys,
      pagination: {
        total: totalSKUs,
        page,
        page_size: PAGE_SIZE,
        total_pages: Math.ceil(totalSKUs / PAGE_SIZE),
      },
      stats: {
        total_skus: totalSKUs,
        total_units: items.reduce((s, i) => s + (i.stock_quantity ?? 0), 0),
        matched_skus: totalSKUs,
        unmatched_skus: 0,
      },
    })
  } catch (error) {
    console.error("[WAREHOUSE STOCK]", error)
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyResponse(warehouse: any, sourceNames: string[]) {
  return {
    warehouse,
    items: [],
    data_source: "products",
    linked_sources: sourceNames,
    source_keys: [],
    pagination: { total: 0, page: 1, page_size: PAGE_SIZE, total_pages: 0 },
    stats: { total_skus: 0, total_units: 0, matched_skus: 0, unmatched_skus: 0 },
  }
}

async function catalogModeResponse({ supabase, warehouseId, warehouse, sourceNames, search, page, offset }: any) {
  // Query catalog items WITHOUT inline join to avoid PostgREST join issues
  let catQ = supabase
    .from("supplier_catalog_items")
    .select(
      "id, supplier_ean, supplier_sku, title, stock_quantity, price_original, matched_by, product_id",
      { count: "exact" }
    )
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (search) {
    catQ = catQ.or(`title.ilike.%${search}%,supplier_ean.ilike.%${search}%,supplier_sku.ilike.%${search}%`)
  }

  const { data: catItems, count: catTotal, error: catErr } = await catQ

  if (catErr) {
    console.error("[WAREHOUSE STOCK] Catalog query error:", catErr.message, catErr.code, catErr.details)
    // Return error info visible in response instead of silently returning empty items
    return NextResponse.json({
      warehouse,
      items: [],
      data_source: "catalog_error",
      catalog_error: catErr.message,
      linked_sources: sourceNames,
      source_keys: [],
      pagination: { total: 0, page, page_size: PAGE_SIZE, total_pages: 0 },
      stats: { total_skus: 0, total_units: 0, matched_skus: 0, unmatched_skus: 0 },
    })
  }

  const [{ count: catTotalCount }, { count: matchedCount }] = await Promise.all([
    supabase.from("supplier_catalog_items").select("*", { count: "exact", head: true }).eq("warehouse_id", warehouseId),
    supabase.from("supplier_catalog_items").select("*", { count: "exact", head: true }).eq("warehouse_id", warehouseId).not("product_id", "is", null),
  ])

  const totalSKUs = catTotalCount ?? 0
  const matchedSKUs = matchedCount ?? 0
  const totalUnits = (catItems ?? []).reduce((s: number, r: any) => s + (r.stock_quantity ?? 0), 0)

  // Fetch product data separately (avoids RLS join issues)
  const productIds = (catItems ?? []).filter((i: any) => i.product_id).map((i: any) => i.product_id as string)
  const [mlMap, productMap] = await Promise.all([
    fetchMLMap(supabase, productIds),
    fetchProductMap(supabase, productIds),
  ])

  // Use catTotalCount as reliable count (catTotal may be null if query had issues)
  const reliableTotal = catTotal ?? catTotalCount ?? 0

  return NextResponse.json({
    warehouse,
    items: (catItems ?? []).map((item: any) => ({
      ...item,
      products: item.product_id ? (productMap[item.product_id] ?? null) : null,
      ml_publications: item.product_id ? (mlMap[item.product_id] ?? []) : [],
    })),
    data_source: "catalog",
    linked_sources: sourceNames,
    source_keys: [],
    pagination: { total: reliableTotal, page, page_size: PAGE_SIZE, total_pages: Math.ceil(reliableTotal / PAGE_SIZE) },
    stats: { total_skus: totalSKUs, total_units: totalUnits, matched_skus: matchedSKUs, unmatched_skus: totalSKUs - matchedSKUs },
  })
}

async function fetchProductMap(supabase: any, productIds: string[]) {
  const productMap: Record<string, { id: string; ean: string | null; sku: string | null; title: string | null }> = {}
  if (productIds.length === 0) return productMap
  const { data: products } = await supabase
    .from("products")
    .select("id, ean, sku, title")
    .in("id", productIds)
  for (const p of products ?? []) {
    if (!p.id) continue
    productMap[p.id] = { id: p.id, ean: p.ean, sku: p.sku, title: p.title }
  }
  return productMap
}

async function fetchMLMap(supabase: any, productIds: string[]) {
  const mlMap: Record<string, { ml_item_id: string; account_nickname: string }[]> = {}
  if (productIds.length === 0) return mlMap
  const { data: mlPubs } = await supabase
    .from("ml_publications")
    .select("product_id, ml_item_id, ml_accounts(nickname, ml_user_id)")
    .in("product_id", productIds)
  for (const pub of mlPubs ?? []) {
    if (!pub.product_id) continue
    if (!mlMap[pub.product_id]) mlMap[pub.product_id] = []
    mlMap[pub.product_id].push({
      ml_item_id: pub.ml_item_id,
      account_nickname: (pub.ml_accounts as any)?.nickname ?? (pub.ml_accounts as any)?.ml_user_id ?? "",
    })
  }
  return mlMap
}
