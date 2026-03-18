import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mlFetchJson, isMlFetchError } from "@/domains/mercadolibre/api-client"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

export const dynamic = "force-dynamic"

// GET /api/ml/catalog/audit?account_id=UUID
// Audita publicaciones activas: cuáles ya son catálogo, cuáles no, cuáles tienen EAN
export async function GET(req: NextRequest) {
  const account_id = req.nextUrl.searchParams.get("account_id")
  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const supabase = createAdminClient()

  // 1. Obtener cuenta y refrescar token
  const { data: account, error: accErr } = await supabase
    .from("ml_accounts")
    .select("*")
    .eq("id", account_id)
    .single()
  if (accErr || !account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const validAccount = await refreshTokenIfNeeded(account) as any
  const accessToken = validAccount.access_token
  const mlUserId = validAccount.ml_user_id

  // 2. Obtener publicaciones activas de nuestra DB
  const { data: pubs, error: pubErr } = await supabase
    .from("ml_publications")
    .select("ml_item_id, title, price, ean, product_id")
    .eq("account_id", account_id)
    .eq("status", "active")
    .not("ml_item_id", "is", null)

  if (pubErr) return NextResponse.json({ error: pubErr.message }, { status: 500 })
  if (!pubs || pubs.length === 0) {
    return NextResponse.json({ ok: true, total: 0, already_catalog: 0, no_ean: 0, candidates: [] })
  }

  // 3. Para cada pub, obtener detalles del item via ML API en batches de 20
  const BATCH = 20
  const results: any[] = []

  for (let i = 0; i < pubs.length; i += BATCH) {
    const batch = pubs.slice(i, i + BATCH)
    const ids = batch.map((p: any) => p.ml_item_id).join(",")
    const url = `https://api.mercadolibre.com/items?ids=${ids}&attributes=id,catalog_product_id,attributes,status,permalink`

    const data = await mlFetchJson(url, { accessToken }, { account_id, op_name: "catalog_audit_batch" })
    if (isMlFetchError(data)) {
      console.error("[CATALOG-AUDIT] batch error:", data)
      continue
    }

    const itemsArr: any[] = Array.isArray(data) ? data : []
    for (const entry of itemsArr) {
      const item = entry.body || entry
      const pub = batch.find((p: any) => p.ml_item_id === item.id)
      if (!pub) continue

      // Detectar si ya es catálogo
      const already_catalog = !!item.catalog_product_id

      // Extraer EAN/GTIN de attributes o de nuestra DB
      let ean = pub.ean || null
      if (!ean && item.attributes) {
        const gtinAttr = item.attributes.find(
          (a: any) => a.id === "GTIN" || a.id === "EAN" || a.id === "ISBN"
        )
        if (gtinAttr?.value_name) ean = gtinAttr.value_name
      }

      results.push({
        ml_item_id: item.id,
        title: pub.title,
        price: pub.price,
        ean,
        already_catalog,
        catalog_product_id: item.catalog_product_id || null,
        permalink: item.permalink || null,
        product_id: pub.product_id,
      })
    }
  }

  const already_catalog = results.filter((r) => r.already_catalog).length
  const no_ean = results.filter((r) => !r.ean && !r.already_catalog).length
  const candidates = results.filter((r) => !r.already_catalog && r.ean)

  return NextResponse.json({
    ok: true,
    total: results.length,
    already_catalog,
    no_ean,
    candidate_count: candidates.length,
    candidates,
    all: results,
  })
}
