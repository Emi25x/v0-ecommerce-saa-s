import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import {
  getWarehouseSourceKeys,
  getWarehouseSafetyStock,
} from "@/domains/inventory/stock-helpers"

/**
 * GET /api/inventory/publishable-stock?warehouse_id=...&page=1&limit=50&search=...
 *
 * Returns per-product publishable stock for a warehouse, including:
 * - stock_by_source breakdown
 * - warehouse_stock (sum of relevant sources)
 * - safety_stock
 * - publishable_stock = max(0, warehouse_stock - safety_stock)
 * - ML publication status per account
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const sp = request.nextUrl.searchParams

    const warehouseId = sp.get("warehouse_id")
    if (!warehouseId) {
      return NextResponse.json({ error: "warehouse_id is required" }, { status: 400 })
    }

    const page = Math.max(1, Number(sp.get("page") || "1"))
    const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || "50")))
    const search = sp.get("search") || ""
    const minPublishable = Number(sp.get("min_publishable") || "0")
    const onlyUnpublished = sp.get("only_unpublished") === "true"
    const offset = (page - 1) * limit

    // 1. Resolve warehouse sources + safety stock
    const sources = await getWarehouseSourceKeys(supabase, warehouseId)
    const sourceKeys = sources.map((s) => s.source_key)
    const safetyStock = await getWarehouseSafetyStock(supabase, warehouseId)

    if (sourceKeys.length === 0) {
      return NextResponse.json({
        products: [],
        total: 0,
        page,
        limit,
        warehouse_id: warehouseId,
        source_keys: [],
        safety_stock: safetyStock,
      })
    }

    // 2. Query products that have any stock_by_source key for this warehouse
    const jsonbOrFilter = sourceKeys.map((k) => `stock_by_source->>${k}.not.is.null`).join(",")

    let query = supabase
      .from("products")
      .select("id, ean, sku, title, stock, stock_by_source, image_url", { count: "exact" })
      .or(jsonbOrFilter)
      .order("title", { ascending: true })

    if (search) {
      query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
    }

    // We need to fetch all for filtering, then paginate manually when filtering by publishable stock
    // For efficiency, use range if no complex filters
    if (minPublishable <= 0 && !onlyUnpublished) {
      query = query.range(offset, offset + limit - 1)
    }

    const { data: rows, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 3. Fetch ML publications for these products
    const productIds = (rows ?? []).map((r: any) => r.id)
    const mlPubMap: Record<string, Array<{ ml_item_id: string; account_id: string; nickname: string; status: string }>> = {}

    if (productIds.length > 0) {
      const { data: pubs } = await supabase
        .from("ml_publications")
        .select("product_id, ml_item_id, account_id, status, ml_accounts(nickname)")
        .in("product_id", productIds.slice(0, 500))

      for (const pub of (pubs ?? []) as any[]) {
        if (!pub.product_id) continue
        if (!mlPubMap[pub.product_id]) mlPubMap[pub.product_id] = []
        mlPubMap[pub.product_id].push({
          ml_item_id: pub.ml_item_id,
          account_id: pub.account_id,
          nickname: pub.ml_accounts?.nickname ?? "—",
          status: pub.status ?? "unknown",
        })
      }
    }

    // 4. Build enriched response
    const enriched = []
    for (const row of (rows ?? []) as any[]) {
      const sbs: Record<string, number> = row.stock_by_source ?? {}
      const stockDetail: Record<string, number> = {}
      let warehouseStock = 0

      for (const key of sourceKeys) {
        const qty = Number(sbs[key]) || 0
        stockDetail[key] = qty
        warehouseStock += qty
      }

      const publishableStock = Math.max(0, warehouseStock - safetyStock)
      const publications = mlPubMap[row.id] ?? []
      const isPublished = publications.length > 0

      // Determine reason if not publishable
      let reason = ""
      if (publishableStock <= 0) {
        if (warehouseStock <= 0) reason = "sin_stock_warehouse"
        else reason = "bajo_safety_stock"
      } else if (!row.ean) {
        reason = "sin_ean"
      }

      if (minPublishable > 0 && publishableStock < minPublishable) continue
      if (onlyUnpublished && isPublished) continue

      enriched.push({
        id: row.id,
        ean: row.ean,
        sku: row.sku,
        title: row.title,
        image_url: row.image_url,
        stock_by_source: stockDetail,
        warehouse_stock: warehouseStock,
        safety_stock: safetyStock,
        publishable_stock: publishableStock,
        is_published: isPublished,
        publications,
        reason,
      })
    }

    // If we fetched all (for filtering), paginate here
    const total = (minPublishable > 0 || onlyUnpublished) ? enriched.length : (count ?? 0)
    const paginated = (minPublishable > 0 || onlyUnpublished)
      ? enriched.slice(offset, offset + limit)
      : enriched

    return NextResponse.json({
      products: paginated,
      total,
      page,
      limit,
      warehouse_id: warehouseId,
      source_keys: sourceKeys,
      safety_stock: safetyStock,
      sources: sources.map((s) => ({ key: s.source_key, name: s.source_name })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 })
  }
}
