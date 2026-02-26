import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — cargar publicaciones elegibles para optin
// Verifica item a item contra ML para excluir los que ya tienen catalog_product_id
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id")
  const offset     = parseInt(searchParams.get("offset") ?? "0", 10)
  const limit      = parseInt(searchParams.get("limit")  ?? "50", 10)

  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token")
    .eq("id", account_id)
    .single()

  if (!account?.access_token) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  // Traer publicaciones activas/pausadas con EAN/ISBN/GTIN
  const { data: rawPubs, error, count } = await supabase
    .from("ml_publications")
    .select("id, ml_item_id, title, price, status, ean, isbn, gtin, catalog_listing_eligible", { count: "exact" })
    .eq("account_id", account_id)
    .in("status", ["active", "paused"])
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allPubs = rawPubs ?? []
  if (allPubs.length === 0) {
    return NextResponse.json({ ok: true, pubs: [], total: count ?? 0, total_raw: count ?? 0, filtered_catalog: 0, offset, limit })
  }

  // Verificar contra ML en batches de 20 usando multi-get
  // ML devuelve array de { code, body } donde body tiene catalog_product_id
  // Si catalog_product_id no es null/vacío, el item ya está en catálogo — excluir
  const BATCH = 20
  const alreadyCatalogInML = new Set<string>()

  for (let i = 0; i < allPubs.length; i += BATCH) {
    const batch = allPubs.slice(i, i + BATCH)
    const ids = batch.map((p: any) => p.ml_item_id).join(",")
    try {
      const mlRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${ids}&attributes=id,catalog_listing,catalog_product_id,status`,
        { headers: { "Authorization": `Bearer ${account.access_token}` } }
      )
      if (mlRes.ok) {
        const mlItems: any[] = await mlRes.json()
        for (const entry of mlItems) {
          if (entry.code !== 200) continue
          const item = entry.body
          // Excluir si tiene catalog_product_id no vacío O si catalog_listing=true
          if (
            (item?.catalog_product_id && item.catalog_product_id !== "") ||
            item?.catalog_listing === true
          ) {
            alreadyCatalogInML.add(item.id)
          }
        }
      }
    } catch (e) {
      console.error("[CATALOG-OPTIN GET] error verificando ML batch:", e)
    }
  }

  const pubs = allPubs.filter((p: any) => !alreadyCatalogInML.has(p.ml_item_id))
  const filteredOut = allPubs.length - pubs.length

  return NextResponse.json({
    ok: true,
    pubs,
    total: (count ?? 0),
    total_raw: count ?? 0,
    filtered_catalog: filteredOut,
    offset,
    limit,
  })
}

// POST — ejecutar optin sobre un item
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { account_id, item_id, catalog_product_id, dry_run = false } = body

  if (!account_id || !item_id || !catalog_product_id) {
    return NextResponse.json({ error: "account_id, item_id y catalog_product_id son requeridos" }, { status: 400 })
  }

  const { data: account, error: accErr } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (accErr || !account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  if (dry_run) {
    return NextResponse.json({
      ok: true, dry_run: true, item_id, catalog_product_id,
      message: "DRY RUN — no se ejecutó optin",
    })
  }

  const authHeaders: Record<string, string> = {
    "Authorization": `Bearer ${account.access_token}`,
    "Content-Type": "application/json",
  }

  // Verificar estado actual del item en ML
  const itemCheckRes = await fetch(
    `https://api.mercadolibre.com/items/${item_id}?attributes=id,status,catalog_listing,catalog_product_id`,
    { headers: authHeaders }
  )
  if (!itemCheckRes.ok) {
    const errBody = await itemCheckRes.json().catch(() => ({}))
    console.error(`[CATALOG-OPTIN POST] No se pudo verificar item ${item_id}:`, errBody)
    return NextResponse.json({ ok: false, item_id, status: itemCheckRes.status, ml_error: errBody }, { status: 200 })
  }

  const itemData = await itemCheckRes.json()
  console.log(`[CATALOG-OPTIN POST] item ${item_id} status=${itemData.status} catalog_listing=${itemData.catalog_listing} catalog_product_id=${itemData.catalog_product_id}`)

  // Si ya tiene catálogo, no hacer nada
  if (itemData.catalog_listing === true || (itemData.catalog_product_id && itemData.catalog_product_id !== "")) {
    return NextResponse.json({
      ok: false, item_id, catalog_product_id,
      ml_error: { message: `El item ya tiene catalog_product_id=${itemData.catalog_product_id}` },
    }, { status: 200 })
  }

  // Si está pausado, activarlo primero
  if (itemData.status === "paused") {
    console.log(`[CATALOG-OPTIN POST] Activando item pausado ${item_id}`)
    const activateRes = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ status: "active" }),
    })
    if (!activateRes.ok) {
      const activateErr = await activateRes.json().catch(() => ({}))
      console.error(`[CATALOG-OPTIN POST] No se pudo activar ${item_id}:`, activateErr)
    } else {
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
    return NextResponse.json({
      ok: false, item_id, catalog_product_id,
      status: optinRes.status,
      ml_error: optinBody,
    }, { status: 200 })
  }

  console.log(`[CATALOG-OPTIN POST] OK item=${item_id} catalog_listing_id=${optinBody.id}`)

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
