import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mlFetchJson, isMlFetchError } from "@/lib/ml/http"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

export const dynamic = "force-dynamic"

// POST /api/ml/catalog/resolve
// Busca catalog_product_id en ML para cada item por EAN/GTIN
// Solo acepta resultado si hay EXACTAMENTE 1 match
export async function POST(req: NextRequest) {
  const { account_id, items } = await req.json()
  // items: Array<{ ml_item_id: string, ean: string }>

  if (!account_id || !items?.length) {
    return NextResponse.json({ error: "account_id e items requeridos" }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("*")
    .eq("id", account_id)
    .single()
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const validAccount = await refreshTokenIfNeeded(account)
  const accessToken = validAccount.access_token

  const resolved: any[] = []

  for (const item of items) {
    if (!item.ean) {
      resolved.push({ ml_item_id: item.ml_item_id, ean: null, action: "skip_no_ean", catalog_product_id: null })
      continue
    }

    // Buscar en catálogo ML por GTIN
    const url = `https://api.mercadolibre.com/products/search?status=active&site_id=MLA&search_type=scan&q=${encodeURIComponent(item.ean)}`
    const data = await mlFetchJson(url, { accessToken }, { account_id, op_name: `catalog_resolve_${item.ean}` })

    if (isMlFetchError(data)) {
      resolved.push({ ml_item_id: item.ml_item_id, ean: item.ean, action: "skip_no_match", catalog_product_id: null, error: data.body_text })
      continue
    }

    const results: any[] = data.results || []

    if (results.length === 0) {
      resolved.push({ ml_item_id: item.ml_item_id, ean: item.ean, action: "skip_no_match", catalog_product_id: null })
    } else if (results.length > 1) {
      resolved.push({ ml_item_id: item.ml_item_id, ean: item.ean, action: "skip_ambiguous", catalog_product_id: null, matches: results.length })
    } else {
      // Exactamente 1 match — aceptar
      resolved.push({
        ml_item_id: item.ml_item_id,
        ean: item.ean,
        action: "create_new_catalog_item",
        catalog_product_id: results[0].id,
        catalog_name: results[0].name,
      })
    }

    // Pequeña pausa para no saturar rate limit
    await new Promise((r) => setTimeout(r, 150))
  }

  return NextResponse.json({ ok: true, resolved })
}
