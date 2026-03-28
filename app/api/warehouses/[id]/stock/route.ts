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
    const admin = createAdminClient()
    const { data: linkedSources } = await admin
      .from("import_sources")
      .select("id, name, source_key")
      .eq("warehouse_id", warehouseId)

    const sourceNames = (linkedSources ?? []).map((s: any) => s.name)
    const sourceKeys = (linkedSources ?? [])
      .map((s: any) => s.source_key ?? s.name.split(" ")[0].toLowerCase())
      .filter(Boolean)

    // ── Catálogo mode ───────────────────────────────────────────────────────
    const { count: catalogCount } = await supabase
      .from("supplier_catalog_items")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)

    if ((catalogCount ?? 0) > 0) {
      return catalogModeResponse({ supabase, admin, warehouseId, warehouse, sourceNames, search, page })
    }

    // ── Products mode ───────────────────────────────────────────────────────
    const noLinkedSources = sourceKeys.length === 0
    const offset = (page - 1) * PAGE_SIZE

    let prodItems: any[] = []
    let totalSKUs = 0

    if (!noLinkedSources) {
      // ── RPC path: fast JSONB filtering via SQL function ─────────────────
      const { data: rpcData, error: rpcErr } = await admin.rpc("get_warehouse_stock", {
        p_source_keys: sourceKeys,
        p_search: search || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      })

      if (rpcErr) {
        // RPC might not exist yet — fall back to PostgREST
        console.warn("[WAREHOUSE STOCK] RPC failed, using fallback:", rpcErr.message)
        const fallback = await postgrEstFallback(supabase, sourceKeys, search, offset)
        prodItems = fallback.items
        totalSKUs = fallback.total
      } else {
        prodItems = rpcData ?? []
        totalSKUs = prodItems.length > 0 ? Number(prodItems[0].total_count) : 0
      }
    } else {
      // ── No linked sources: show all products with stock > 0 ─────────────
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
      const { data, count } = await q
      prodItems = data ?? []
      totalSKUs = count ?? 0
    }

    const totalPages = Math.ceil(totalSKUs / PAGE_SIZE)
    const effectivePage = totalPages > 0 ? Math.min(page, totalPages) : 1

    // ── ML publications for this page ───────────────────────────────────────
    const pageIds = prodItems.map((p: any) => p.id)
    const mlMap = await fetchMLMap(admin, pageIds)

    // ── Build items ─────────────────────────────────────────────────────────
    const items = prodItems.map((p: any) => {
      const sourceStock = sourceKeys.reduce((sum: number, k: string) => sum + ((p.stock_by_source?.[k] ?? 0) as number), 0)
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

    // ── Global stats ────────────────────────────────────────────────────────
    let globalTotalUnits: number | null = null
    let publishedML: number | null = null

    if (!noLinkedSources && totalSKUs > 0 && totalSKUs <= 10000) {
      try {
        // Sum stock from all warehouse products (use RPC data if small enough)
        const { data: allProds } = await admin.rpc("get_warehouse_stock", {
          p_source_keys: sourceKeys,
          p_search: null,
          p_limit: 10000,
          p_offset: 0,
        })

        if (allProds && allProds.length > 0) {
          globalTotalUnits = allProds.reduce((sum: number, p: any) => {
            return sum + sourceKeys.reduce((s: number, k: string) => s + ((p.stock_by_source?.[k] ?? 0) as number), 0)
          }, 0)

          // ML count: batch to avoid URL limits
          const allIds = allProds.map((p: any) => p.id)
          const publishedIds = new Set<string>()
          for (let i = 0; i < allIds.length; i += 200) {
            const batch = allIds.slice(i, i + 200)
            const { data: pubs } = await admin
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
        console.warn("[WAREHOUSE STOCK] Global stats error:", e)
      }
    }

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
        unpublished_ml: publishedML !== null ? totalSKUs - publishedML : null,
      },
    })
  } catch (error) {
    console.error("[WAREHOUSE STOCK]", error)
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 })
  }
}

// ── PostgREST fallback (if RPC not installed) ───────────────────────────────

async function postgrEstFallback(
  supabase: any,
  sourceKeys: string[],
  search: string,
  offset: number,
): Promise<{ items: any[]; total: number }> {
  const jsonbFilter = sourceKeys.map((k) => `stock_by_source->>${k}.not.is.null`).join(",")
  let q = supabase
    .from("products")
    .select("id, ean, sku, title, stock, cost_price, stock_by_source", { count: "exact" })
    .gt("stock", 0)
    .or(jsonbFilter)
    .order("stock", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)
  if (search) {
    q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
  }
  const { data, count } = await q
  return { items: data ?? [], total: count ?? 0 }
}

// ── Catalog mode ──────────────────────────────────────────────────────────────

async function catalogModeResponse({ supabase, admin, warehouseId, warehouse, sourceNames, search, page }: any) {
  const offset = (page - 1) * PAGE_SIZE

  let catQ = supabase
    .from("supplier_catalog_items")
    .select("id, supplier_ean, supplier_sku, title, stock_quantity, price_original, matched_by, product_id", { count: "exact" })
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
    supabase.from("supplier_catalog_items").select("*", { count: "exact", head: true }).eq("warehouse_id", warehouseId).not("product_id", "is", null),
  ])

  const totalSKUs = catTotalCount ?? 0
  const reliableTotal = catTotal ?? totalSKUs
  const productIds = (catItems ?? []).filter((i: any) => i.product_id).map((i: any) => i.product_id as string)
  const [mlMap, productMap] = await Promise.all([fetchMLMap(admin, productIds), fetchProductMap(supabase, productIds)])

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
      total_units: (catItems ?? []).reduce((s: number, r: any) => s + (r.stock_quantity ?? 0), 0),
      published_ml: matchedCount ?? 0,
      unpublished_ml: totalSKUs - (matchedCount ?? 0),
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchProductMap(supabase: any, productIds: string[]) {
  if (productIds.length === 0) return {}
  const map: Record<string, any> = {}
  const { data } = await supabase.from("products").select("id, sku, title").in("id", productIds)
  for (const p of data ?? []) if (p.id) map[p.id] = { id: p.id, sku: p.sku, title: p.title }
  return map
}

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
