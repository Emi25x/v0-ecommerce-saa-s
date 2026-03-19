import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const { account_id, ean } = await req.json()
  if (!account_id || !ean) return NextResponse.json({ error: "account_id y ean requeridos" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token, site_id")
    .eq("id", account_id)
    .single()

  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const authHeaders = { Authorization: `Bearer ${account.access_token}` }
  const siteId = account.site_id ?? "MLA"

  const searchRes = await fetch(
    `https://api.mercadolibre.com/products/search?status=active&site_id=${siteId}&product_identifier=${encodeURIComponent(ean)}`,
    { headers: authHeaders },
  )

  if (!searchRes.ok) {
    const errBody = await searchRes.json().catch(() => ({}))
    return NextResponse.json({ ok: false, status: "error", ml_status: searchRes.status, error: errBody })
  }

  const searchData = await searchRes.json()
  const results: any[] = searchData.results ?? []

  if (results.length === 0) {
    return NextResponse.json({ ok: true, status: "not_found", ean })
  }

  return NextResponse.json({
    ok: true,
    status: "resolved",
    ean,
    catalog_product_id: results[0].id,
    product_title: results[0].name ?? results[0].title ?? null,
  })
}
