import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

const PAGE_SIZE = 50

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
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))

    // ── Fuentes vinculadas ──────────────────────────────────────────────────
    const supabaseAdmin = createAdminClient()
    const { data: linkedSources } = await supabaseAdmin
      .from("import_sources")
      .select("id, name, source_key")
      .eq("warehouse_id", warehouseId)

    const sourceNames = (linkedSources ?? []).map((s: any) => s.name)
    const sourceKeys = (linkedSources ?? [])
      .map((s: any) => s.source_key ?? s.name.split(" ")[0].toLowerCase())
      .filter(Boolean)

    // ── Catálogo mode check ─────────────────────────────────────────────────
    const { count: catalogCount } = await supabase
      .from("supplier_catalog_items")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)

    if ((catalogCount ?? 0) > 0) {
      return catalogModeResponse({ supabase, warehouseId, warehouse, sourceNames, search, page })
    }

    // ── Products mode ───────────────────────────────────────────────────────
    const noLinkedSources = sourceKeys.length === 0

    // JSONB filter: use .not("stock_by_source->key", "is", null) which is simpler
    // and more index-friendly than the text-extraction neq approach.
    // The .gt("stock", 0) already ensures the product has stock.
    const jsonbOrFilter = noLinkedSources
      ? ""
      : sourceKeys.map((k: string) => `stock_by_source->>${k}.not.is.null`).join(",")

    // Build base query helper (reused for data + stats)
    function applyFilters(q: any) {
      q = q.gt("stock", 0)
      if (!noLinkedSources) {
        q = q.or(jsonbOrFilter)
      }
      if (search) {
        q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
      }
      return q
    }

    // ── Data query with count ───────────────────────────────────────────────
    const offset = (page - 1) * PAGE_SIZE
    let dataQ = supabase
      .from("products")
      .select("id, ean, sku, title, stock, cost_price, stock_by_source", { count: "exact" })
      .order("stock", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    dataQ = applyFilters(dataQ)

    const { data: prodData, error: prodErr, count: totalCount } = await dataQ

    if (prodErr) {
      return NextResponse.json({
        warehouse, items: [], data_source: "products_error",
        linked_sources: sourceNames, source_keys: sourceKeys,
        pagination: { total: 0, page, page_size: PAGE_SIZE, total_pages: 0 },
        stats: { total_skus: 0, total_units: null, published_ml: null, unpublished_ml: null },
        error: prodErr.message,
      })
    }

    const totalSKUs = totalCount ?? 0
    const totalPages = Math.ceil(totalSKUs / PAGE_SIZE)

    // If page was beyond range and returned empty, retry with last valid page
    let items_raw = prodData ?? []
    let effectivePage = page
    if (items_raw.length === 0 && totalSKUs > 0 && page > 1) {
      effectivePage = totalPages
      const correctedOffset = (effectivePage - 1) * PAGE_SIZE
      let retryQ = supabase
        .from("products")
        .select("id, ean, sku, title, stock, cost_price, stock_by_source")
        .order("stock", { ascending: false })
        .order("id", { ascending: true })
        .range(correctedOffset, correctedOffset + PAGE_SIZE - 1)
      retryQ = applyFilters(retryQ)
      const { data: retryData } = await retryQ
      items_raw = retryData ?? []
    } else {
      effectivePage = Math.min(page, Math.max(totalPages, 1))
    }

    // ── ML publications for this page ───────────────────────────────────────
    const pageProductIds = items_raw.map((p: any) => p.id)
    const mlMap = await fetchMLMap(supabase, pageProductIds)

    // ── Build items ─────────────────────────────────────────────────────────
    const items = items_raw.map((p: any) => {
      const sourceStock = sourceKeys.reduce((sum: number, k: string) => sum + (p.stock_by_source?.[k] ?? 0), 0)
      const displayStock = noLinkedSources ? (p.stock ?? 0) : sourceStock
      const pubs = mlMap[p.id] ?? []
      return {
        id: `prod_${p.id}`,
        supplier_ean: p.ean ?? p.sku,
        supplier_sku: p.sku,
        title: p.title ?? "",
        stock_quantity: displayStock,
        price_original: p.cost_price,
        product_id: p.id,
        has_ml: pubs.length > 0,
        products: { id: p.id, ean: p.ean ?? p.sku, sku: p.sku, title: p.title },
        ml_publications: pubs,
      }
    })

    // ── Global stats (async, non-blocking) ──────────────────────────────────
    // Only compute for warehouses with linked sources and manageable size
    let globalTotalUnits: number | null = null
    let publishedML: number | null = null

    if (!noLinkedSources && totalSKUs > 0 && totalSKUs <= 10000) {
      try {
        // Fetch all matching products (minimal fields, with limit)
        let allQ = supabaseAdmin
          .from("products")
          .select("id, stock_by_source")
          .limit(10000)
        allQ = applyFilters(allQ)
        const { data: allProds } = await allQ

        if (allProds && allProds.length > 0) {
          // Total units: sum stock from warehouse sources
          globalTotalUnits = allProds.reduce((sum: number, p: any) => {
            return sum + sourceKeys.reduce((s: number, k: string) => s + ((p.stock_by_source?.[k] ?? 0) as number), 0)
          }, 0)

          // ML publications: batch .in() queries to avoid URL limit
          const allIds = allProds.map((p: any) => p.id)
          const publishedIds = new Set<string>()
          const BATCH = 200
          for (let i = 0; i < allIds.length; i += BATCH) {
            const batch = allIds.slice(i, i + BATCH)
            const { data: pubs } = await supabaseAdmin
              .from("ml_publications")
              .select("product_id")
              .in("product_id", batch)
            for (const pub of pubs ?? []) {
              if (pub.product_id) publishedIds.add(pub.product_id)
            }
          }
          publishedML = publishedIds.size
        }
      } catch (e) {
        // Non-critical — stats show null, page still works
        console.warn("[WAREHOUSE STOCK] Global stats error:", e)
      }
    }

    const unpublishedML = publishedML !== null ? totalSKUs - publishedML : null

    return NextResponse.json({
      warehouse,
      items,
      data_source: noLinkedSources ? "products_all" : "products_by_source",
      linked_sources: sourceNames,
      source_keys: sourceKeys,
      pagination: {
        total: totalSKUs,
        page: effectivePage,
        page_size: PAGE_SIZE,
        total_pages: totalPages,
      },
      stats: {
        total_skus: totalSKUs,
        total_units: globalTotalUnits,
        published_ml: publishedML,
        unpublished_ml: unpublishedML,
      },
    })
  } catch (error) {
    console.error("[WAREHOUSE STOCK]", error)
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 })
  }
}

// ── Catalog mode ──────────────────────────────────────────────────────────────

async function catalogModeResponse({ supabase, warehouseId, warehouse, sourceNames, search, page }: any) {
  const offset = (page - 1) * PAGE_SIZE

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
    return NextResponse.json({
      warehouse, items: [], data_source: "catalog_error",
      linked_sources: sourceNames, source_keys: [],
      pagination: { total: 0, page, page_size: PAGE_SIZE, total_pages: 0 },
      stats: { total_skus: 0, total_units: null, published_ml: null, unpublished_ml: null },
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
  const reliableTotal = catTotal ?? catTotalCount ?? 0

  const productIds = (catItems ?? []).filter((i: any) => i.product_id).map((i: any) => i.product_id as string)
  const [mlMap, productMap] = await Promise.all([
    fetchMLMap(supabase, productIds),
    fetchProductMap(supabase, productIds),
  ])

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
      published_ml: matchedSKUs,
      unpublished_ml: totalSKUs - matchedSKUs,
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  // Batch to avoid URL length limits
  const BATCH = 200
  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH)
    const { data: mlPubs } = await supabase
      .from("ml_publications")
      .select("product_id, ml_item_id, ml_accounts(nickname, ml_user_id)")
      .in("product_id", batch)
    for (const pub of mlPubs ?? []) {
      if (!pub.product_id) continue
      if (!mlMap[pub.product_id]) mlMap[pub.product_id] = []
      mlMap[pub.product_id].push({
        ml_item_id: pub.ml_item_id,
        account_nickname: (pub.ml_accounts as any)?.nickname ?? (pub.ml_accounts as any)?.ml_user_id ?? "",
      })
    }
  }
  return mlMap
}
