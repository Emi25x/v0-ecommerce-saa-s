/**
 * POST /api/shopify/push-product
 *
 * Sube un producto de nuestra BD directamente a una tienda Shopify.
 * Crea el producto si no existe, o actualiza si ya está publicado.
 *
 * Body: { store_id, ean, dry_run?: boolean }
 */

import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-auth"
import { parseBody } from "@/lib/validation/parse-body"
import { ShopifyPushProductSchema } from "@/lib/validation/schemas"
import { pushProductToShopify } from "@/domains/shopify/push-product"

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  const parsed = await parseBody(req, ShopifyPushProductSchema)
  if (!parsed.ok) return parsed.response

  try {
    const { store_id, ean, dry_run } = parsed.data
    const result = await pushProductToShopify(auth.supabase, store_id, ean, auth.user.id, dry_run)

    if (!result.ok) {
      const status = result.error?.includes("no encontr") ? 404 : 500
      return NextResponse.json(result, { status })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[push-product]", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json(
      { ok: false, error: { code: "internal_error", detail: message } },
      { status: 500 },
    )
  }
}
