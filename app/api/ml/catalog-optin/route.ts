import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — devuelve publicaciones activas/pausadas con EAN de la DB (rápido, sin llamar a ML)
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

  return NextResponse.json({ ok: true, pubs: pubs ?? [], total: count ?? 0, offset, limit })
}

// POST — procesar UN item:
//   1. Verificar en ML si ya tiene catalog_listing=true → skip
//   2. Buscar catalog_product_id por EAN/ISBN/GTIN → si no hay → not_found
//   3. Si item está pausado → activarlo
//   4. POST /items/catalog_listings → optin
export async function POST(req: NextRequest) {
  try {
  const body = await req.json().catch(() => ({}))
  const { account_id, item_id, ean, dry_run = false } = body

  if (!account_id || !item_id) {
    return NextResponse.json({ ok: false, error: "account_id e item_id son requeridos" }, { status: 400 })
  }

  const { data: account, error: accountError } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!account) {
    console.error("[CATALOG-OPTIN POST] Cuenta no encontrada:", account_id, accountError?.message)
    return NextResponse.json({ ok: false, error: "Cuenta no encontrada", account_id }, { status: 404 })
  }
  if (!account.access_token) {
    console.error("[CATALOG-OPTIN POST] access_token vacío para cuenta:", account_id)
    return NextResponse.json({ ok: false, error: "Token de acceso no disponible" }, { status: 400 })
  }

  const authHeaders: Record<string, string> = {
    "Authorization": `Bearer ${account.access_token}`,
    "Content-Type": "application/json",
  }

  // PASO 1: verificar estado actual del item en ML
  const itemRes = await fetch(
    `https://api.mercadolibre.com/items/${item_id}?attributes=id,status,catalog_listing,catalog_product_id`,
    { headers: authHeaders }
  )

  if (!itemRes.ok) {
    const err = await itemRes.json().catch(() => ({}))
    return NextResponse.json({ ok: false, item_id, step: "item_check", ml_error: err })
  }

  const itemData = await itemRes.json()

  // Si ya tiene catalog_listing=true → ya está hecho
  if (itemData.catalog_listing === true) {
    return NextResponse.json({
      ok: false, skip: true, item_id,
      reason: "already_catalog",
      catalog_product_id: itemData.catalog_product_id,
      ml_error: { message: `Ya tiene publicación de catálogo (${itemData.catalog_product_id})` },
    })
  }

  // PASO 2: buscar catalog_product_id por EAN/ISBN/GTIN
  if (!ean) {
    return NextResponse.json({ ok: false, item_id, step: "resolve", ml_error: { message: "Sin EAN/ISBN/GTIN" } })
  }

  const siteId = "MLA"
  const searchRes = await fetch(
    `https://api.mercadolibre.com/products/search?status=active&site_id=${siteId}&product_identifier=${encodeURIComponent(ean)}`,
    { headers: authHeaders }
  )

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}))
    return NextResponse.json({ ok: false, item_id, step: "resolve", ml_error: err })
  }

  const searchData = await searchRes.json()
  const results: any[] = searchData.results ?? []

  if (results.length === 0) {
    return NextResponse.json({
      ok: false, item_id, step: "resolve",
      reason: "not_found",
      ml_error: { message: `Sin producto en catálogo ML para EAN ${ean}` },
    })
  }

  const catalog_product_id: string = results[0].id
  const product_title: string = results[0].name ?? results[0].title ?? ""

  // DRY RUN — simular sin ejecutar
  if (dry_run) {
    return NextResponse.json({
      ok: true, dry_run: true, item_id, catalog_product_id, product_title,
      message: `DRY RUN — haría optin de ${item_id} → ${catalog_product_id}`,
    })
  }

  // PASO 3: si está pausado, activar antes del optin
  if (itemData.status === "paused") {
    console.log(`[CATALOG-OPTIN] Activando ${item_id} (pausado) antes del optin`)
    const activateRes = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ status: "active" }),
    })
    if (!activateRes.ok) {
      const err = await activateRes.json().catch(() => ({}))
      console.error(`[CATALOG-OPTIN] No se pudo activar ${item_id}:`, JSON.stringify(err))
      // Continuar igual — ML a veces acepta el optin aunque el item esté pausado
    } else {
      // Esperar que ML propague el cambio de status
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  // PASO 4: ejecutar optin — POST /items/catalog_listings
  const optinRes = await fetch("https://api.mercadolibre.com/items/catalog_listings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ item_id, catalog_product_id }),
  })

  const optinBody = await optinRes.json().catch(() => ({}))

  if (!optinRes.ok) {
    // Loguear el body completo incluyendo el array cause[] que tiene el detalle real
    console.error(
      `[CATALOG-OPTIN] FAIL item=${item_id} product=${catalog_product_id} ` +
      `http=${optinRes.status} body=${JSON.stringify(optinBody)}`
    )
    return NextResponse.json({
      ok: false, item_id, catalog_product_id, product_title,
      status: optinRes.status,
      ml_error: optinBody, // incluye message + cause[] con detalle real
    })
  }

  console.log(`[CATALOG-OPTIN] OK item=${item_id} → catalog=${catalog_product_id} new_item=${optinBody.id}`)

  // Guardar nueva listing de catálogo en DB
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
    }, { onConflict: "ml_id" }).catch(console.error)
  }

  return NextResponse.json({ ok: true, item_id, catalog_product_id, product_title, catalog_listing: optinBody })

  } catch (e: any) {
    console.error("[CATALOG-OPTIN POST] Unhandled exception:", e?.message, e?.stack)
    return NextResponse.json({ ok: false, error: e?.message ?? "Error interno" }, { status: 500 })
  }
}
