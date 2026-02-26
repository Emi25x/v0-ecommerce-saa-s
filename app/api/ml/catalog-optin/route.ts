import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — devuelve publicaciones activas/pausadas con EAN (rápido, sin llamar a ML)
// El cliente luego resuelve una a una via /api/ml/catalog-optin/resolve
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id")
  const offset     = parseInt(searchParams.get("offset") ?? "0", 10)
  const limit      = parseInt(searchParams.get("limit")  ?? "50", 10)

  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("id")
    .eq("id", account_id)
    .single()

  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const { data: pubs, error, count } = await supabase
    .from("ml_publications")
    .select("id, ml_item_id, title, price, status, ean, isbn, gtin", { count: "exact" })
    .eq("account_id", account_id)
    .in("status", ["active", "paused"])
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    pubs: pubs ?? [],
    total: count ?? 0,
    offset,
    limit,
  })
}

// POST — ejecutar optin sobre un item (catalog_product_id ya conocido)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { account_id, item_id, catalog_product_id, dry_run = false } = body

  if (!account_id || !item_id || !catalog_product_id) {
    return NextResponse.json({ error: "account_id, item_id y catalog_product_id son requeridos" }, { status: 400 })
  }

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  if (dry_run) {
    return NextResponse.json({ ok: true, dry_run: true, item_id, catalog_product_id, message: "DRY RUN — no se ejecutó optin" })
  }

  const authHeaders: Record<string, string> = {
    "Authorization": `Bearer ${account.access_token}`,
    "Content-Type": "application/json",
  }

  // Verificar estado del item en ML
  const itemCheckRes = await fetch(
    `https://api.mercadolibre.com/items/${item_id}?attributes=id,status,catalog_listing,catalog_product_id`,
    { headers: authHeaders }
  )

  if (itemCheckRes.ok) {
    const itemData = await itemCheckRes.json()

    // Si ya tiene catálogo, skip
    if (itemData.catalog_listing === true || (itemData.catalog_product_id && itemData.catalog_product_id !== "")) {
      return NextResponse.json({
        ok: false, skip: true, item_id, catalog_product_id,
        ml_error: { message: `El item ya tiene catalog_product_id=${itemData.catalog_product_id}` },
      })
    }

    // Activar si está pausado — ML requiere status=active para optin
    if (itemData.status === "paused") {
      console.log(`[CATALOG-OPTIN] Activando item pausado ${item_id} antes del optin`)
      await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ status: "active" }),
      })
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  // Ejecutar optin
  const optinRes = await fetch("https://api.mercadolibre.com/items/catalog_listings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ item_id, catalog_product_id }),
  })

  const optinBody = await optinRes.json().catch(() => ({}))

  if (!optinRes.ok) {
    console.error(`[CATALOG-OPTIN POST] FAIL item=${item_id} product=${catalog_product_id} http=${optinRes.status} body=${JSON.stringify(optinBody)}`)
    return NextResponse.json({ ok: false, item_id, catalog_product_id, status: optinRes.status, ml_error: optinBody })
  }

  // Guardar la nueva listing de catálogo en nuestra DB si ML devolvió el nuevo item
  if (optinBody.id) {
    await supabase.from("ml_listings").upsert({
      account_id,
      ml_id: optinBody.id,
      catalog_listing: true,
      catalog_product_id,
      status: optinBody.status ?? "active",
      price: optinBody.price ?? null,
      permalink: optinBody.permalink ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "ml_id" })
  }

  return NextResponse.json({ ok: true, item_id, catalog_listing: optinBody })
}
