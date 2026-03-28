import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

const PAGE_SIZE = 50

/**
 * GET /api/warehouses/[id]/stock
 *
 * Reads from warehouse_products snapshot table (fast, pre-computed).
 * Falls back to products table if snapshot doesn't exist.
 * Stats come from warehouse_stock_summary (instant, no aggregation).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { id: warehouseId } = await params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: warehouse, error: whErr } = await supabase
      .from("warehouses")
      .select("id, name, code, is_default")
      .eq("id", warehouseId)
      .eq("owner_user_id", user.id)
      .single()

    if (whErr || !warehouse) {
      return NextResponse.json({ error: "Almacén no encontrado" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search") ?? ""
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
    const offset = (page - 1) * PAGE_SIZE

    // Linked sources (for badge display)
    const { data: linkedSources } = await admin
      .from("import_sources")
      .select("id, name, source_key")
      .eq("warehouse_id", warehouseId)
    const sourceNames = (linkedSources ?? []).map((s: any) => s.name)

    // ── Try snapshot table first ────────────────────────────────────────────
    const snapshotResult = await readFromSnapshot(admin, warehouseId, search, page, offset)

    if (snapshotResult) {
      // Enrich with ML publications for this page
      const pageIds = snapshotResult.items.map((p: any) => p.product_id)
      const mlMap = await fetchMLMap(admin, pageIds)

      const items = snapshotResult.items.map((p: any) => {
        const pubs = mlMap[p.product_id] ?? []
        return {
          id: `prod_${p.product_id}`,
          supplier_ean: p.ean ?? p.sku,
          supplier_sku: p.sku,
          title: p.title ?? "",
          stock_quantity: p.warehouse_stock,
          price_original: p.cost_price,
          product_id: p.product_id,
          has_ml: p.has_ml || pubs.length > 0,
          products: { id: p.product_id, ean: p.ean ?? p.sku, sku: p.sku, title: p.title },
          ml_publications: pubs,
        }
      })

      return NextResponse.json({
        warehouse,
        items,
        data_source: "snapshot",
        linked_sources: sourceNames,
        source_keys: (linkedSources ?? []).map((s: any) => s.source_key).filter(Boolean),
        pagination: snapshotResult.pagination,
        stats: snapshotResult.stats,
      })
    }

    // ── Fallback: no snapshot, read from products directly ──────────────────
    return fallbackFromProducts(supabase, admin, warehouse, warehouseId, linkedSources ?? [], sourceNames, search, page, offset)
  } catch (error) {
    console.error("[WAREHOUSE STOCK]", error)
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 })
  }
}

// ── Snapshot reader ─────────────────────────────────────────────────────────

async function readFromSnapshot(
  admin: any,
  warehouseId: string,
  search: string,
  page: number,
  offset: number,
): Promise<{ items: any[]; pagination: any; stats: any } | null> {
  // Check if snapshot exists
  const { count: snapshotCount } = await admin
    .from("warehouse_products")
    .select("*", { count: "exact", head: true })
    .eq("warehouse_id", warehouseId)
    .gt("warehouse_stock", 0)

  if (snapshotCount === null || snapshotCount === 0) {
    // Try refreshing first
    try {
      await admin.rpc("refresh_warehouse_products", { p_warehouse_id: warehouseId })
    } catch {
      return null // RPC not installed
    }

    // Check again
    const { count: retryCount } = await admin
      .from("warehouse_products")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)
      .gt("warehouse_stock", 0)

    if (!retryCount || retryCount === 0) return null
  }

  // Read stats from summary (instant)
  const { data: summary } = await admin
    .from("warehouse_stock_summary")
    .select("total_skus, total_units, published_ml, unpublished_ml, refreshed_at")
    .eq("warehouse_id", warehouseId)
    .single()

  // Read paginated data
  let q = admin
    .from("warehouse_products")
    .select("product_id, ean, sku, title, warehouse_stock, cost_price, source_detail, has_ml, ml_count", { count: "exact" })
    .eq("warehouse_id", warehouseId)
    .gt("warehouse_stock", 0)
    .order("warehouse_stock", { ascending: false })
    .order("product_id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (search) {
    q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
  }

  const { data, count, error } = await q

  if (error) {
    console.error("[WAREHOUSE STOCK] Snapshot query error:", error.message)
    return null
  }

  const totalSKUs = summary?.total_skus ?? count ?? 0
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)
  const effectivePage = totalPages > 0 ? Math.min(page, totalPages) : 1

  return {
    items: data ?? [],
    pagination: {
      total: count ?? 0,
      page: effectivePage,
      page_size: PAGE_SIZE,
      total_pages: totalPages,
    },
    stats: {
      total_skus: totalSKUs,
      total_units: summary?.total_units ?? null,
      published_ml: summary?.published_ml ?? null,
      unpublished_ml: summary?.unpublished_ml ?? null,
      refreshed_at: summary?.refreshed_at ?? null,
    },
  }
}

// ── Fallback (no snapshot) ──────────────────────────────────────────────────

async function fallbackFromProducts(
  supabase: any, admin: any, warehouse: any, warehouseId: string,
  linkedSources: any[], sourceNames: string[],
  search: string, page: number, offset: number,
) {
  const sourceKeys = (linkedSources ?? []).map((s: any) => s.source_key).filter(Boolean)
  const noLinkedSources = sourceKeys.length === 0

  let q = supabase
    .from("products")
    .select("id, ean, sku, title, stock, cost_price, stock_by_source", { count: "exact" })
    .gt("stock", 0)
    .order("stock", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)

  if (search) {
    q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
  }

  const { data, count, error } = await q

  if (error) {
    return NextResponse.json({
      warehouse, items: [], data_source: "products_error",
      linked_sources: sourceNames, source_keys: sourceKeys,
      pagination: { total: 0, page, page_size: PAGE_SIZE, total_pages: 0 },
      stats: { total_skus: 0, total_units: null, published_ml: null, unpublished_ml: null },
      error: error.message,
    })
  }

  const pageIds = (data ?? []).map((p: any) => p.id)
  const mlMap = await fetchMLMap(admin, pageIds)

  const items = (data ?? []).map((p: any) => {
    const sourceStock = sourceKeys.reduce((sum: number, k: string) => sum + ((p.stock_by_source?.[k] ?? 0) as number), 0)
    const pubs = mlMap[p.id] ?? []
    return {
      id: `prod_${p.id}`,
      supplier_ean: p.ean ?? p.sku,
      supplier_sku: p.sku,
      title: p.title ?? "",
      stock_quantity: noLinkedSources ? (p.stock ?? 0) : sourceStock,
      price_original: p.cost_price,
      product_id: p.id,
      has_ml: pubs.length > 0,
      products: { id: p.id, ean: p.ean ?? p.sku, sku: p.sku, title: p.title },
      ml_publications: pubs,
    }
  })

  const totalSKUs = count ?? 0
  const totalPages = Math.ceil(totalSKUs / PAGE_SIZE)

  return NextResponse.json({
    warehouse, items,
    data_source: noLinkedSources ? "products_all" : "products_fallback",
    linked_sources: sourceNames,
    source_keys: sourceKeys,
    pagination: { total: totalSKUs, page: Math.min(page, Math.max(totalPages, 1)), page_size: PAGE_SIZE, total_pages: totalPages },
    stats: { total_skus: totalSKUs, total_units: null, published_ml: null, unpublished_ml: null },
  })
}

// ── ML publications helper ──────────────────────────────────────────────────

async function fetchMLMap(client: any, productIds: string[]) {
  const mlMap: Record<string, { ml_item_id: string; account_nickname: string }[]> = {}
  if (productIds.length === 0) return mlMap
  for (let i = 0; i < productIds.length; i += 200) {
    const batch = productIds.slice(i, i + 200)
    const { data } = await client
      .from("ml_publications")
      .select("product_id, ml_item_id, ml_accounts(nickname, ml_user_id)")
      .in("product_id", batch)
    for (const pub of data ?? []) {
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
