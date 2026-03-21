/**
 * POST /api/shopify/export-generate
 * Body: { store_id, eans: string[], warehouse_id?: string }
 *
 * Generates an XLSX-ready row set matching the exact 78-column Shopify
 * products import format. Returns { ok, columns, rows }.
 */

import { createClient } from "@/lib/db/server"
import { buildExportRows, resolveColumns } from "@/domains/shopify/export-builder"
import { resolveProductStockForWarehouse } from "@/domains/inventory/stock-helpers"
import { createStructuredLogger, genRequestId } from "@/lib/logger"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const log = createStructuredLogger({ request_id: genRequestId() })
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await request.json()) as {
      store_id: string
      eans: string[]
      warehouse_id?: string
    }
    const { store_id, eans, warehouse_id } = body

    if (!store_id || !eans?.length) {
      return NextResponse.json({ error: "store_id y eans son requeridos" }, { status: 400 })
    }

    // 1. Verify store ownership
    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain, name, sucursal_stock_code, default_warehouse_id")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .maybeSingle()
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })
    const store_warehouse_id = (store as any).default_warehouse_id as string | undefined

    // 2. Load template (columns override + defaults like Vendor, Type)
    const { data: tpl } = await supabase
      .from("shopify_export_templates")
      .select("template_columns_json, defaults_json")
      .eq("shopify_store_id", store_id)
      .maybeSingle()

    const columns = resolveColumns(tpl?.template_columns_json as string[] | null)
    const defaults: Record<string, string> = (tpl?.defaults_json as Record<string, string> | null) ?? {}

    // 3. Load products by EAN or ISBN
    const { data: productsRaw, error: prodError } = await supabase
      .from("products")
      .select(
        "id, title, description, brand, sku, ean, isbn, price, cost_price, stock, " +
          "canonical_weight_g, image_url, category, custom_fields, " +
          "height, width, thickness, pages, author, language, binding, " +
          "ibic_subjects, edition_date, year_edition, subject, course, condition",
      )
      .or(eans.map((e) => `ean.eq.${e},isbn.eq.${e}`).join(","))
    const products = productsRaw as any[] | null

    if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })
    if (!products?.length) {
      return NextResponse.json({ error: "No se encontraron productos para los EANs ingresados" }, { status: 404 })
    }

    // 4. Load best stock per product — prefer warehouse-consolidated, fallback to supplier_catalog_items
    const productIds = products.map((p) => p.id)
    let stockMap: Record<string, number> = {}
    let stockMode: "warehouse_consolidated" | "legacy_fallback" = "legacy_fallback"

    // Try warehouse-consolidated stock first (from stock_by_source + import_sources)
    const resolveWhId = warehouse_id ?? store_warehouse_id
    const resolved = await resolveProductStockForWarehouse(supabase, resolveWhId, productIds)
    if (resolved.mode === "warehouse_consolidated" && Object.keys(resolved.stockMap).length > 0) {
      stockMap = resolved.stockMap
      stockMode = "warehouse_consolidated"
      log.info("Export stock resolved via warehouse", "shopify_export.stock_resolved", {
        stock_mode: "warehouse_consolidated",
        warehouse_id: resolveWhId,
        source_keys: resolved.source_keys,
        products_resolved: Object.keys(stockMap).length,
      })
    } else {
      // Fallback: supplier_catalog_items (legacy path)
      let stockQuery = supabase
        .from("supplier_catalog_items")
        .select("product_id, stock_quantity")
        .in("product_id", productIds)
        .order("stock_quantity", { ascending: false })

      if (warehouse_id) stockQuery = stockQuery.eq("warehouse_id", warehouse_id)

      const { data: stockRows } = await stockQuery
      for (const s of stockRows ?? []) {
        if (s.product_id && !(s.product_id in stockMap)) {
          stockMap[s.product_id] = s.stock_quantity ?? 0
        }
      }
      stockMode = "legacy_fallback"
      log.info("Export stock resolved via legacy fallback", "shopify_export.stock_resolved", {
        stock_mode: "legacy_fallback",
        warehouse_id: warehouse_id ?? null,
        products_with_stock: Object.keys(stockMap).length,
      })
    }

    // 5. Build export rows (domain logic)
    const result = buildExportRows({ products, stockMap, columns, defaults, store })

    return NextResponse.json({ ok: true, stock_mode: stockMode, ...result })
  } catch (e: any) {
    log.error("Export generate failed", e, "shopify_export.fatal")
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
