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

  // Buscar en ML Products por GTIN — mismo endpoint que usa el matcher
  const url = `https://api.mercadolibre.com/products/search?site_id=MLA&q=GTIN:${encodeURIComponent(ean)}&limit=5`
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

  if (results.length === 1) {
    return NextResponse.json({
      ok: true,
      status: "resolved",
      ean,
      catalog_product_id: results[0].id,
      product_title: results[0].name ?? results[0].title,
      results,
    })
  }

  // Múltiples resultados — devolver todos para que el usuario elija
  return NextResponse.json({
    ok: true,
    status: "ambiguous",
    ean,
    results: results.map((r) => ({ id: r.id, name: r.name ?? r.title })),
  })
}
