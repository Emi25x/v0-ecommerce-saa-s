import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { account_id, ean, check_vendor = false } = await req.json()
  if (!account_id || !ean) return NextResponse.json({ error: "account_id y ean requeridos" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id")
    .eq("id", account_id)
    .single()

  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const authHeaders = { "Authorization": `Bearer ${account.access_token}` }

  // Buscar catalog product por EAN exacto (igual que publish/route.ts)
  const searchRes = await fetch(
    `https://api.mercadolibre.com/products/search?status=active&site_id=MLA&product_identifier=${encodeURIComponent(ean)}`,
    { headers: authHeaders }
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

  const catalogProductId = results[0].id
  const productTitle = results[0].name ?? results[0].title ?? null

  // Si check_vendor=true, verificar si el vendedor YA tiene una listing de catálogo
  // para este catalog_product_id — si la tiene, no mostrar en el listado
  let vendorHasCatalog = false
  if (check_vendor && account.ml_user_id) {
    try {
      const vendorRes = await fetch(
        `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?catalog_product_id=${catalogProductId}&limit=1`,
        { headers: authHeaders }
      )
      if (vendorRes.ok) {
        const vendorData = await vendorRes.json()
        vendorHasCatalog = (vendorData.results ?? []).length > 0
      }
    } catch {
      // Si falla la verificación, asumir que no tiene (mejor mostrar de más que filtrar)
    }
  }

  return NextResponse.json({
    ok: true,
    status: "resolved",
    ean,
    catalog_product_id: catalogProductId,
    product_title: productTitle,
    vendor_has_catalog: vendorHasCatalog,
  })
}
