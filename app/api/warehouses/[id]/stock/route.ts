import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const PAGE_SIZE = 50

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()
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
    const offset = (page - 1) * PAGE_SIZE

    // ── Fuentes vinculadas ────────────────────────────────────────────────────
    const { data: linkedSources } = await supabase
      .from("import_sources")
      .select("id, name")
      .eq("warehouse_id", warehouseId)
      .eq("is_active", true)

    const sourceKeys = (linkedSources ?? []).map((s) => s.id)
    const sourceNames = (linkedSources ?? []).map((s) => s.name)

    // ── Modo 1: supplier_catalog_items ────────────────────────────────────────
    const { count: catalogCount } = await supabase
      .from("supplier_catalog_items")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)

    if ((catalogCount ?? 0) > 0) {
      // Modo catálogo: paginar supplier_catalog_items
      let catQ = supabase
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
        catQ = catQ.or(`title.ilike.%${search}%,supplier_ean.ilike.%${search}%,supplier_sku.ilike.%${search}%`)
      }

      const { data: catItems, count: catTotal } = await catQ

      // Stats via aggregate queries
      const { count: catTotalCount } = await supabase
        .from("supplier_catalog_items")
        .select("*", { count: "exact", head: true })
        .eq("warehouse_id", warehouseId)

      const { count: matchedCount } = await supabase
        .from("supplier_catalog_items")
        .select("*", { count: "exact", head: true })
        .eq("warehouse_id", warehouseId)
        .not("product_id", "is", null)

      const totalSKUs = catTotalCount ?? 0
      const totalUnits = (catItems ?? []).reduce((s: number, r: any) => s + (r.stock_quantity ?? 0), 0)
      const matchedSKUs = matchedCount ?? 0

      const productIds = (catItems ?? []).filter((i) => i.product_id).map((i) => i.product_id as string)
      const mlMap = await fetchMLMap(supabase, productIds)

      return NextResponse.json({
        warehouse,
        items: (catItems ?? []).map((item) => ({
          ...item,
          ml_publications: item.product_id ? (mlMap[item.product_id] ?? []) : [],
        })),
        data_source: "catalog",
        linked_sources: sourceNames,
        pagination: {
          total: totalSKUs,
          page,
          page_size: PAGE_SIZE,
          total_pages: Math.ceil(totalSKUs / PAGE_SIZE),
        },
        stats: {
          total_skus: totalSKUs,
          total_units: totalUnits,
          matched_skus: matchedSKUs,
          unmatched_skus: totalSKUs - matchedSKUs,
        },
      })
    }

    // ── Modo 2: products via import_sources ───────────────────────────────────
    // Si no hay fuentes vinculadas, nada que mostrar
    if (sourceKeys.length === 0) {
      return NextResponse.json({
        warehouse,
        items: [],
        data_source: "products",
        linked_sources: [],
        pagination: { total: 0, page: 1, page_size: PAGE_SIZE, total_pages: 0 },
        stats: { total_skus: 0, total_units: 0, matched_skus: 0, unmatched_skus: 0 },
      })
    }

    // Construir query de productos: filtrar por stock_by_source[sourceId] o fallback a stock > 0
    // Intentar filtro JSONB primero, luego fallback
    let prodQuery = supabase
      .from("products")
      .select("id, ean, sku, title, stock, cost_price, stock_by_source", { count: "exact" })
      .order("stock", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    let totalCountQuery = supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    // Intentar filtro JSONB por source.id como clave
    const jsonbOrFilter = sourceKeys.map((k) => `stock_by_source->>${k}.not.is.null`).join(",")
    const { count: jsonbCount, error: jsonbErr } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .or(jsonbOrFilter)

    const useJsonb = !jsonbErr && (jsonbCount ?? 0) > 0

    if (useJsonb) {
      prodQuery = prodQuery.or(jsonbOrFilter)
      totalCountQuery = totalCountQuery.or(jsonbOrFilter)
    } else {
      // Fallback: todos los productos con stock > 0
      prodQuery = prodQuery.gt("stock", 0)
      totalCountQuery = totalCountQuery.gt("stock", 0)
    }

    if (search) {
      prodQuery = prodQuery.or(`title.ilike.%${search}%,ean.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const [{ data: prodData, count: pCount }, { count: totalCount }] = await Promise.all([
      prodQuery,
      totalCountQuery,
    ])

    const productItems = (prodData ?? []) as Array<{
      id: string; ean: string | null; sku: string | null; title: string | null
      stock: number | null; cost_price: number | null; stock_by_source: Record<string, number> | null
    }>

    // totalUnits: sum from the current page (exact sum requires loading all rows, skip for perf)
    const totalUnits = productItems.reduce((s, p) => {
      const src = sourceKeys.reduce((sum, k) => sum + (p.stock_by_source?.[k] ?? 0), 0)
      return s + (src > 0 ? src : (p.stock ?? 0))
    }, 0)

    const totalSKUs = totalCount ?? 0

    // ML enrichment
    const productIds = productItems.map((p) => p.id)
    const mlMap = await fetchMLMap(supabase, productIds)

    const items = productItems.map((p) => {
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
        ml_publications: mlMap[p.id] ?? [],
      }
    })

    return NextResponse.json({
      warehouse,
      items,
      data_source: "products",
      linked_sources: sourceNames,
      pagination: {
        total: totalSKUs,
        page,
        page_size: PAGE_SIZE,
        total_pages: Math.ceil(totalSKUs / PAGE_SIZE),
      },
      stats: {
        total_skus: totalSKUs,
        total_units: totalUnits,
        matched_skus: totalSKUs,
        unmatched_skus: 0,
      },
    })
  } catch (error) {
    console.error("[WAREHOUSE STOCK]", error)
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 })
  }
}

async function fetchMLMap(
  supabase: any,
  productIds: string[]
): Promise<Record<string, { ml_item_id: string; account_nickname: string }[]>> {
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
