import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const PAGE_SIZE = 50

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

    let query = supabase
      .from("supplier_catalog_items")
      .select(
        `
        id,
        supplier_ean,
        supplier_sku,
        title,
        stock_quantity,
        price_original,
        matched_by,
        product_id,
        products:product_id (
          id,
          ean,
          sku,
          title
        )
        `,
        { count: "exact" }
      )
      .eq("warehouse_id", warehouseId)
      .order("stock_quantity", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,supplier_ean.ilike.%${search}%,supplier_sku.ilike.%${search}%`
      )
    }

    const { data: items, count, error: itemsError } = await query

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // Get ML publication links for matched products
    const productIds = (items ?? [])
      .filter((i) => i.product_id)
      .map((i) => i.product_id as string)

    let mlMap: Record<string, { ml_item_id: string; account_nickname: string }[]> = {}
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

    // Aggregate totals (fast count of matched vs unmatched)
    const { data: totals } = await supabase
      .from("supplier_catalog_items")
      .select("stock_quantity, product_id")
      .eq("warehouse_id", warehouseId)

    const totalSKUs = totals?.length ?? 0
    const totalUnits = totals?.reduce((s, r) => s + (r.stock_quantity ?? 0), 0) ?? 0
    const matchedSKUs = totals?.filter((r) => r.product_id).length ?? 0

    const enrichedItems = (items ?? []).map((item) => ({
      ...item,
      ml_publications: item.product_id ? (mlMap[item.product_id] ?? []) : [],
    }))

    return NextResponse.json({
      warehouse,
      items: enrichedItems,
      pagination: {
        total: count ?? 0,
        page,
        page_size: PAGE_SIZE,
        total_pages: Math.ceil((count ?? 0) / PAGE_SIZE),
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
