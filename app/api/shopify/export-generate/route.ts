/**
 * POST /api/shopify/export-generate
 * Body: { store_id, eans: string[], warehouse_id?: string }
 *
 * Generates an XLSX-ready row set matching the exact 78-column Shopify
 * products import format. Returns { ok, columns, rows }.
 */

import { createClient } from "@/lib/db/server"
import { buildExportRows, resolveColumns } from "@/domains/shopify/export-builder"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
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
      .select("id, shop_domain, name, sucursal_stock_code")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .maybeSingle()
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

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

    // 4. Load best stock per product from supplier_catalog_items
    const productIds = products.map((p) => p.id)
    let stockQuery = supabase
      .from("supplier_catalog_items")
      .select("product_id, stock_quantity")
      .in("product_id", productIds)
      .order("stock_quantity", { ascending: false })

    if (warehouse_id) stockQuery = stockQuery.eq("warehouse_id", warehouse_id)

    const { data: stockRows } = await stockQuery
    const stockMap: Record<string, number> = {}
    for (const s of stockRows ?? []) {
      if (s.product_id && !(s.product_id in stockMap)) {
        stockMap[s.product_id] = s.stock_quantity ?? 0
      }
    }

    // 5. Build export rows (domain logic)
    const result = buildExportRows({ products, stockMap, columns, defaults, store })

    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error("[shopify/export-generate]", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
