/**
 * PATCH /api/shopify/stores/settings
 *
 * Guarda la configuración de exportación de una tienda Shopify:
 *   - vendor, product_category
 *   - price_source ('products.price' | 'product_prices')
 *   - price_list_id (UUID, cuando price_source = 'product_prices')
 *   - default_warehouse_id (UUID)
 *   - sucursal_stock_code (texto, ej: "5AJ;YFB;YXZG")
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const {
      store_id,
      vendor,
      product_category,
      price_source,
      price_list_id,
      default_warehouse_id,
      sucursal_stock_code,
    } = body

    if (!store_id)
      return NextResponse.json({ ok: false, error: "store_id es requerido" }, { status: 400 })

    // Verificar propiedad
    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store)
      return NextResponse.json({ ok: false, error: "Tienda no encontrada" }, { status: 404 })

    const patch: Record<string, any> = { updated_at: new Date().toISOString() }
    if (vendor              !== undefined) patch.vendor               = vendor || null
    if (product_category    !== undefined) patch.product_category     = product_category || null
    if (price_source        !== undefined) patch.price_source         = price_source
    if (price_list_id       !== undefined) patch.price_list_id        = price_list_id || null
    if (default_warehouse_id!== undefined) patch.default_warehouse_id = default_warehouse_id || null
    if (sucursal_stock_code !== undefined) patch.sucursal_stock_code  = sucursal_stock_code || null

    const { error } = await supabase
      .from("shopify_stores")
      .update(patch)
      .eq("id", store_id)

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
