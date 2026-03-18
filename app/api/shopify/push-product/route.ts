/**
 * POST /api/shopify/push-product
 *
 * Sube un producto de nuestra BD directamente a una tienda Shopify.
 * Crea el producto si no existe, o actualiza si ya está publicado.
 *
 * Body: { store_id, ean, dry_run?: boolean }
 */

import { createClient }  from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { pushProductToShopify } from "@/lib/shopify/push-product"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { store_id, ean, dry_run = false } = body

    if (!store_id || !ean)
      return NextResponse.json({ ok: false, error: "store_id y ean son requeridos" }, { status: 400 })

    const result = await pushProductToShopify(supabase, store_id, ean, user.id, dry_run)

    if (!result.ok) {
      const status = result.error?.includes("no encontr") ? 404 : 500
      return NextResponse.json(result, { status })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[push-product]", err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
