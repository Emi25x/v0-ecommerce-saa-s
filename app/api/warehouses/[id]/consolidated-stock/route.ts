import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getWarehouseConsolidatedStock } from "@/domains/inventory/stock-helpers"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

/**
 * GET /api/warehouses/[id]/consolidated-stock
 *
 * Returns the consolidated stock for a warehouse, calculated by summing
 * products.stock_by_source[source_key] for all import_sources linked to
 * the warehouse.
 *
 * This is the canonical endpoint for "how much stock does this warehouse have?"
 * and is designed to be consumed by Shopify push, ML sync, and any future
 * marketplace integration.
 *
 * Query params:
 *  - page (default 1)
 *  - limit (default 50)
 *  - search (optional, filters by title/sku/ean)
 *  - min_stock (optional, default 0 — set to 1 to hide zero-stock products)
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

    // Verify ownership
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
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)))
    const search = searchParams.get("search") || undefined
    const minStock = parseInt(searchParams.get("min_stock") ?? "0", 10) || 0

    const result = await getWarehouseConsolidatedStock(supabase, warehouseId, {
      page,
      pageSize,
      search,
      minStock,
    })

    return NextResponse.json({
      warehouse,
      ...result,
      pagination: {
        page,
        page_size: pageSize,
        total: result.total_products,
        total_pages: Math.ceil(result.total_products / pageSize),
      },
    })
  } catch (error) {
    const log = createStructuredLogger({ request_id: genRequestId() })
    log.error("Consolidated stock error", error, "consolidated_stock.fatal")
    return NextResponse.json({ error: "Error interno", detail: String(error) }, { status: 500 })
  }
}
