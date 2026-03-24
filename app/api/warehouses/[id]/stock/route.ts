import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

const PAGE_SIZE = 50

/**
 * GET /api/warehouses/[id]/stock
 *
 * Devuelve el stock de un almacén. Dos modos:
 *  1. Catálogo: si hay supplier_catalog_items para este almacén
 *  2. Productos: filtra products.stock_by_source por los source_key de las fuentes vinculadas
 *     (ej: stock_by_source->>'libral' IS NOT NULL para fuente "Libral Argentina")
 *     Si no hay fuentes vinculadas, muestra todos los productos con stock > 0.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { id: warehouseId } = await params

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
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
    const stockFilter = searchParams.get("stock_filter") ?? "in_stock" // "in_stock" | "all"
    const offset = (page - 1) * PAGE_SIZE

    // ── Fuentes vinculadas (con source_key) ───────────────────────────────────
    // Usar admin client para evitar problemas de RLS en import_sources
    // No filtrar por is_active: si la fuente está vinculada al warehouse, debe contar
    const supabaseAdmin = createAdminClient()
    const { data: linkedSources } = await supabaseAdmin
      .from("import_sources")
      .select("id, name, source_key")
      .eq("warehouse_id", warehouseId)

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

    // ── Sin fuentes vinculadas → mostrar todos los productos con stock > 0 ─────
    const noLinkedSources = sourceKeys.length === 0

    // ── Modo 2: products filtrados por stock_by_source[source_key] ────────────
    // Dos modos de filtro:
    //   "in_stock": solo productos con stock > 0 en ESTE warehouse (stock_by_source->key > 0)
    //   "all":      todos los productos vinculados al warehouse (stock_by_source->>key IS NOT NULL)
    const wantsInStock = stockFilter !== "all"

    let jsonbOrFilter = ""
    if (!noLinkedSources) {
      if (wantsInStock) {
        // Filtrar por stock real > 0 en al menos una source del warehouse
        // Usar -> (JSON value) en lugar de ->> (text) para comparación numérica
        jsonbOrFilter = sourceKeys.map((k: string) => `stock_by_source->${k}.gt.0`).join(",")
      } else {
        // Mostrar todos los productos que tengan la clave, aunque stock sea 0
        jsonbOrFilter = sourceKeys.map((k: string) => `stock_by_source->>${k}.not.is.null`).join(",")
      }
    }

    // Construir queries — cuando hay fuentes vinculadas, SIEMPRE filtrar por ellas.
    // Si no hay productos que coincidan, devolver vacío (no fallback a "todos").
    let prodQ = supabase
      .from("products")
      .select("id, ean, sku, title, stock, cost_price, stock_by_source")
      .order("stock", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    let countQ = supabase.from("products").select("*", { count: "exact", head: true })

    if (!noLinkedSources) {
      // Siempre filtrar por source_key cuando hay fuentes vinculadas
      prodQ = prodQ.or(jsonbOrFilter)
      countQ = countQ.or(jsonbOrFilter)
      if (search) {
        const searchFilter = `title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`
        prodQ = prodQ.or(searchFilter)
        countQ = countQ.or(searchFilter)
      }
    } else {
      // Sin fuentes vinculadas → fallback a stock global > 0
      prodQ = prodQ.gt("stock", 0)
      countQ = countQ.gt("stock", 0)
      if (search) {
        prodQ = prodQ.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
        countQ = countQ.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
      }
    }

    const [{ data: prodData, error: prodErr }, { count: totalCount }] = await Promise.all([prodQ, countQ])

    if (prodErr) {
      console.error("[WAREHOUSE STOCK] Products query error:", prodErr.message)
      // Return empty items but keep the count to help diagnose
      return NextResponse.json({
        warehouse,
        items: [],
        data_source: "products_error",
        linked_sources: sourceNames,
        source_keys: sourceKeys,
        pagination: {
          total: totalCount ?? 0,
          page,
          page_size: PAGE_SIZE,
          total_pages: Math.ceil((totalCount ?? 0) / PAGE_SIZE),
        },
        stats: { total_skus: totalCount ?? 0, total_units: 0, matched_skus: 0, unmatched_skus: 0 },
        error: prodErr.message,
      })
    }

    const prodItems = (prodData ?? []) as Array<{
      id: string
      sku: string | null
      title: string | null
      stock: number | null
      cost_price: number | null
      stock_by_source: Record<string, number> | null
    }>

    // ML enrichment
    const productIds = prodItems.map((p) => p.id)
    const mlMap = await fetchMLMap(supabase, productIds)

    const items = prodItems.map((p) => {
      // Calcular stock específico de las fuentes del almacén.
      // Cuando hay fuentes vinculadas, SIEMPRE mostrar stock del warehouse (incluso si es 0).
      // Solo usar stock global cuando NO hay fuentes vinculadas (fallback mode).
      const sourceStock = sourceKeys.reduce((sum: number, k: string) => sum + (p.stock_by_source?.[k] ?? 0), 0)
      const displayStock = noLinkedSources ? (p.stock ?? 0) : sourceStock
      return {
        id: `prod_${p.id}`,
        supplier_ean: (p as any).ean ?? p.sku,
        supplier_sku: p.sku,
        title: p.title ?? "",
        stock_quantity: displayStock,
        price_original: p.cost_price,
        matched_by: "products",
        product_id: p.id,
        products: { id: p.id, ean: (p as any).ean ?? p.sku, sku: p.sku, title: p.title },
        ml_publications: mlMap[p.id] ?? [],
      }
    })

    const totalSKUs = totalCount ?? 0

    return NextResponse.json({
      warehouse,
      items,
      data_source: noLinkedSources ? "products_all" : "products_by_source",
      stock_filter: noLinkedSources ? "all" : stockFilter,
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
    .select("id, supplier_ean, supplier_sku, title, stock_quantity, price_original, matched_by, product_id", {
      count: "exact",
    })
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
    supabase
      .from("supplier_catalog_items")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)
      .not("product_id", "is", null),
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
    stats: {
      total_skus: totalSKUs,
      total_units: totalUnits,
      matched_skus: matchedSKUs,
      unmatched_skus: totalSKUs - matchedSKUs,
    },
  })
}

async function fetchProductMap(supabase: any, productIds: string[]) {
  const productMap: Record<string, { id: string; sku: string | null; title: string | null }> = {}
  if (productIds.length === 0) return productMap
  const { data: products, error } = await supabase.from("products").select("id, sku, title").in("id", productIds)
  if (error) console.error("[WAREHOUSE STOCK] fetchProductMap error:", error.message)
  for (const p of products ?? []) {
    if (!p.id) continue
    productMap[p.id] = { id: p.id, sku: p.sku, title: p.title }
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
