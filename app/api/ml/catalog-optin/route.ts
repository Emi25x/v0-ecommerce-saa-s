import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DELAY = (ms: number) => new Promise(r => setTimeout(r, ms))

// GET — cargar publicaciones que ML tiene catalog product pero el vendedor aún no hizo optin
// Para cada pub: busca product_identifier, si hay resultado y el vendedor no tiene esa listing → incluir
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id")
  const offset     = parseInt(searchParams.get("offset") ?? "0", 10)
  const limit      = parseInt(searchParams.get("limit")  ?? "50", 10)

  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, site_id")
    .eq("id", account_id)
    .single()

  if (!account?.access_token) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const siteId = account.site_id ?? "MLA"
  const authHeaders = { "Authorization": `Bearer ${account.access_token}`, "Accept": "application/json" }

  // Traer publicaciones activas/pausadas con EAN/ISBN/GTIN en el rango pedido
  const { data: rawPubs, error, count } = await supabase
    .from("ml_publications")
    .select("id, ml_item_id, title, price, status, ean, isbn, gtin", { count: "exact" })
    .eq("account_id", account_id)
    .in("status", ["active", "paused"])
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allPubs = rawPubs ?? []
  if (allPubs.length === 0) {
    return NextResponse.json({ ok: true, pubs: [], total: count ?? 0, offset, limit })
  }

  // Para cada pub: resolver EAN → catalog_product_id y verificar si vendedor ya tiene esa listing
  const result: any[] = []
  let scanned = 0, noMatch = 0, alreadyHas = 0

  for (const pub of allPubs) {
    const ean = pub.ean ?? pub.isbn ?? pub.gtin
    if (!ean) { noMatch++; continue }

    // 1. Buscar catalog product para este EAN
    let catalogProductId: string | null = null
    let productTitle: string | null = null
    try {
      const searchRes = await fetch(
        `https://api.mercadolibre.com/products/search?status=active&site_id=${siteId}&product_identifier=${encodeURIComponent(ean)}`,
        { headers: authHeaders }
      )
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const results: any[] = searchData.results ?? []
        if (results.length > 0) {
          catalogProductId = results[0].id
          productTitle = results[0].name ?? results[0].title ?? null
        }
      }
    } catch { /* ignorar */ }

    if (!catalogProductId) { noMatch++; await DELAY(100); continue }

    // 2. Verificar si el vendedor ya tiene una pub de catálogo para ese catalog_product_id
    let vendorAlreadyHas = false
    try {
      const vendorRes = await fetch(
        `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?catalog_product_id=${catalogProductId}&limit=1`,
        { headers: authHeaders }
      )
      if (vendorRes.ok) {
        const vendorData = await vendorRes.json()
        const existing: string[] = vendorData.results ?? []
        // Si existe alguna listing para este producto que NO sea la publicación tradicional actual, ya tiene catálogo
        vendorAlreadyHas = existing.some(id => id !== pub.ml_item_id)
      }
    } catch { /* si falla la verificación, incluir (mejor mostrar de más) */ }

    if (vendorAlreadyHas) { alreadyHas++; await DELAY(100); continue }

    // Esta pub es elegible: ML tiene el producto, el vendedor aún no tiene la listing de catálogo
    result.push({
      ...pub,
      resolve_status: "resolved",
      catalog_product_id: catalogProductId,
      product_title: productTitle,
    })
    scanned++
    await DELAY(100)
  }

  return NextResponse.json({
    ok: true,
    pubs: result,
    total: count ?? 0,
    scanned,
    no_match: noMatch,
    already_has: alreadyHas,
    offset,
    limit,
  })
}

// POST — ejecutar optin sobre un item (ya resuelto, catalog_product_id conocido)
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

  // Verificar estado del item — si está pausado, activar primero
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

    // Activar si está pausado
    if (itemData.status === "paused") {
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
    console.error(`[CATALOG-OPTIN POST] FAIL item=${item_id} product=${catalog_product_id} status=${optinRes.status} body=${JSON.stringify(optinBody)}`)
    return NextResponse.json({ ok: false, item_id, catalog_product_id, status: optinRes.status, ml_error: optinBody })
  }

  // Guardar la nueva listing de catálogo en nuestra DB
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
