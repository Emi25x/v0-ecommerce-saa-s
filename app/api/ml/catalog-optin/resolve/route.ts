import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST — buscar catalog_product_id por EAN/ISBN/GTIN usando ML products API
// Devuelve match único (resolved), multiple (ambiguous) o ninguno (not_found)
export async function POST(req: NextRequest) {
  const { account_id, ean } = await req.json()
  if (!account_id || !ean) return NextResponse.json({ error: "account_id y ean requeridos" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token")
    .eq("id", account_id)
    .single()

  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  // Igual que publish/route.ts: product_identifier hace búsqueda exacta por EAN/ISBN/GTIN
  const url = `https://api.mercadolibre.com/products/search?status=active&site_id=MLA&product_identifier=${encodeURIComponent(ean)}`
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${account.access_token}` },
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: false, status: "error", ml_status: res.status, error: errBody }, { status: 200 })
  }

  const data = await res.json()
  const results: any[] = data.results ?? []

  if (results.length === 0) {
    return NextResponse.json({ ok: true, status: "not_found", ean, results: [] })
  }

  // product_identifier es búsqueda exacta — tomar el primero directamente (igual que publish)
  return NextResponse.json({
    ok: true,
    status: "resolved",
    ean,
    catalog_product_id: results[0].id,
    product_title: results[0].name ?? results[0].title,
    results,
  })
}
