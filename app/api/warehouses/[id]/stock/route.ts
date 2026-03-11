import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const PAGE_SIZE = 50

/**
 * GET /api/warehouses/[id]/stock
 *
 * Devuelve el contenido de stock de un almacén.
 * Combina dos fuentes:
 *  1. supplier_catalog_items (importaciones de catálogo de proveedores)
 *  2. products.stock_by_source (importaciones directas de fuentes como azeta/arnoia)
 *     → se activa cuando hay import_sources con warehouse_id = este almacén
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Verify warehouse belongs to user
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

    // ── Fuente 1: supplier_catalog_items ─────────────────────────────────────
    let catalogQuery = supabase
      .from("supplier_catalog_items")
      .select(
        `id, supplier_ean, supplier_sku, title, stock_quantity, price_original, matched_by, product_id,
         products:product_id (id, ean, sku, title)`,
        { count: "exact" }
      )
      .eq("warehouse_id", warehouseId)
      .order("stock_quantity", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (search) {
      catalogQuery = catalogQuery.or(
        `title.ilike.%${search}%,supplier_ean.ilike.%${search}%,supplier_sku.ilike.%${search}%`
      )
    }

    const { data: catalogItems, count: catalogCount } = await catalogQuery

    // ── Fuente 2: import_sources con warehouse_id → products.stock_by_source ─
    const { data: linkedSources } = await supabase
      .from("import_sources")
      .select("id, name")
      .eq("warehouse_id", warehouseId)
      .eq("is_active", true)

    // Cada fuente usa su UUID como clave en stock_by_source (consistente con mergeStockBySource)
    const sourceKeys = (linkedSources ?? []).map((s) => s.id)

    // Productos con stock_by_source en alguna de esas claves
    type ProductRow = {
      id: string
      ean: string | null
      sku: string | null
      title: string | null
      stock: number | null
      cost_price: number | null
      stock_by_source: Record<string, number> | null
    }
    let productItems: ProductRow[] = []
    let productCount = 0

    if (sourceKeys.length > 0) {
      // PostgREST OR filter: stock_by_source->>'key' IS NOT NULL para cada clave de fuente
      const jsonbOrFilter = sourceKeys.map((k) => `stock_by_source->>${k}.not.is.null`).join(",")

      let prodQuery = supabase
        .from("products")
        .select("id, ean, sku, title, stock, cost_price, stock_by_source", { count: "exact" })
        .or(jsonbOrFilter)
        .order("stock", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (search) {
        prodQuery = prodQuery.or(`title.ilike.%${search}%,ean.ilike.%${search}%,sku.ilike.%${search}%`)
      }

      const { data: prodData, count: pCount } = await prodQuery
      productItems = (prodData ?? []) as ProductRow[]
      productCount = pCount ?? 0
    }

    // ── Combinar fuentes ──────────────────────────────────────────────────────
    // Si hay supplier_catalog_items, usarlos (modo catálogo)
    // Si no, usar products (modo stock_by_source)
    const usingCatalogMode = (catalogCount ?? 0) > 0 || sourceKeys.length === 0

    let items: any[]
    let total: number

    if (usingCatalogMode) {
      items = catalogItems ?? []
      total = catalogCount ?? 0
    } else {
      // Mapear products al mismo shape que catalog items
      items = productItems.map((p) => {
        const sourceStock = sourceKeys.reduce((sum, k) => sum + (p.stock_by_source?.[k] ?? 0), 0)
        return {
          id: `prod_${p.id}`,
          supplier_ean: p.ean,
          supplier_sku: p.sku,
          title: p.title ?? "",
          stock_quantity: sourceStock > 0 ? sourceStock : (p.stock ?? 0),
          price_original: p.cost_price,
          matched_by: "products",
          product_id: p.id,
          products: { id: p.id, ean: p.ean, sku: p.sku, title: p.title },
          _source: "products",
        }
      })
      total = productCount
    }

    // ── ML publication links ──────────────────────────────────────────────────
    const productIds = items.filter((i) => i.product_id).map((i) => i.product_id as string)
    const mlMap: Record<string, { ml_item_id: string; account_nickname: string }[]> = {}

    if (productIds.length > 0) {
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
    }

    // ── Aggregate totals ──────────────────────────────────────────────────────
    let totalSKUs = 0
    let totalUnits = 0
    let matchedSKUs = 0

    if (usingCatalogMode) {
      const { data: totals } = await supabase
        .from("supplier_catalog_items")
        .select("stock_quantity, product_id")
        .eq("warehouse_id", warehouseId)
      totalSKUs = totals?.length ?? 0
      totalUnits = totals?.reduce((s, r) => s + (r.stock_quantity ?? 0), 0) ?? 0
      matchedSKUs = totals?.filter((r) => r.product_id).length ?? 0
    } else {
      // Stats from products
      const { data: allProds } = await supabase
        .from("products")
        .select("id, stock, stock_by_source")
        .or(sourceKeys.map((k) => `stock_by_source->>${k}.not.is.null`).join(","))
      totalSKUs = allProds?.length ?? 0
      totalUnits = allProds?.reduce((s, r) => {
        const src = sourceKeys.reduce((sum, k) => sum + ((r.stock_by_source as any)?.[k] ?? 0), 0)
        return s + (src > 0 ? src : (r.stock ?? 0))
      }, 0) ?? 0
      matchedSKUs = totalSKUs // all products are "matched" since they are in products table
    }

    const enrichedItems = items.map((item) => ({
      ...item,
      ml_publications: item.product_id ? (mlMap[item.product_id] ?? []) : [],
    }))

    return NextResponse.json({
      warehouse,
      items: enrichedItems,
      data_source: usingCatalogMode ? "catalog" : "products",
      linked_sources: (linkedSources ?? []).map((s) => s.name),
      pagination: {
        total,
        page,
        page_size: PAGE_SIZE,
        total_pages: Math.ceil(total / PAGE_SIZE),
      },
      stats: {
        total_skus: totalSKUs,
        total_units: totalUnits,
        matched_skus: matchedSKUs,
        unmatched_skus: totalSKUs - matchedSKUs,
      },
    })
  } catch (error) {
    console.error("[WAREHOUSE STOCK]", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
