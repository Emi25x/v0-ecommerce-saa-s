import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — cargar publicaciones elegibles para optin
// elegibles = catalog_listing_eligible=true y sin catalog_listing en ml_listings
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id")
  const offset     = parseInt(searchParams.get("offset") ?? "0", 10)
  const limit      = parseInt(searchParams.get("limit")  ?? "200", 10)

  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  // Obtener ml_item_ids que ya tienen publicación de catálogo vinculada en listing_relationships
  // (original_listing_id apunta a la pub tradicional, catalog_listing_id a la de catálogo)
  const { data: alreadyLinked } = await supabase
    .from("listing_relationships")
    .select("original_listing_id")

  const linkedIds = new Set((alreadyLinked ?? []).map((r: any) => r.original_listing_id))

  // También excluir ml_item_ids que en ml_listings tienen catalog_listing=true
  // (se guardan como ml_id en ml_listings — son las publicaciones de catálogo ya registradas)
  const { data: catalogListings } = await supabase
    .from("ml_listings")
    .select("ml_id")
    .eq("account_id", account_id)
    .eq("catalog_listing", true)

  const catalogMlIds = new Set((catalogListings ?? []).map((r: any) => r.ml_id))

  // Traer publicaciones activas/pausadas con identificador (sin filtrar aún las ya vinculadas)
  // Filtramos post-query para evitar problemas con NOT IN vacío en Supabase
  let query = supabase
    .from("ml_publications")
    .select("id, ml_item_id, title, price, status, ean, isbn, gtin, catalog_listing_eligible", { count: "exact" })
    .eq("account_id", account_id)
    .in("status", ["active", "paused"])
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
    .order("created_at", { ascending: false })

  // Si hay IDs ya vinculados, excluirlos con NOT IN (Supabase acepta array en .not)
  if (linkedIds.size > 0) {
    query = query.not("id", "in", `(${[...linkedIds].join(",")})`)
  }
  if (catalogMlIds.size > 0) {
    query = query.not("ml_item_id", "in", `(${[...catalogMlIds].map(id => `"${id}"`).join(",")})`)
  }

  const { data: pubs, error, count } = await query.range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, pubs: pubs ?? [], total: count ?? 0, offset, limit })
}

// POST — ejecutar optin sobre un item
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { account_id, item_id, catalog_product_id, dry_run = false } = body

  if (!account_id || !item_id || !catalog_product_id) {
    return NextResponse.json({ error: "account_id, item_id y catalog_product_id son requeridos" }, { status: 400 })
  }

  // Obtener access token
  const { data: account, error: accErr } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (accErr || !account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  if (dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      item_id,
      catalog_product_id,
      message: "DRY RUN — no se ejecutó optin",
    })
  }

  const authHeaders = {
    "Authorization": `Bearer ${account.access_token}`,
    "Content-Type": "application/json",
  }

  // ML requiere que el item esté ACTIVE para hacer optin — si está paused, activarlo primero
  const itemRes = await fetch(`https://api.mercadolibre.com/items/${item_id}?attributes=id,status`, {
    headers: authHeaders,
  })
  if (itemRes.ok) {
    const itemData = await itemRes.json()
    if (itemData.status === "paused") {
      console.log(`[CATALOG-OPTIN] Activando item pausado ${item_id} antes del optin`)
      await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ status: "active" }),
      })
      // Pequeña pausa para que ML propague el cambio
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  // Mismo mecanismo exacto que publish/route.ts línea 1021
  const optinRes = await fetch("https://api.mercadolibre.com/items/catalog_listings", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ item_id, catalog_product_id }),
  })

  const optinBody = await optinRes.json().catch(() => ({}))

  if (!optinRes.ok) {
    console.error(`[CATALOG-OPTIN] FAIL item=${item_id} product=${catalog_product_id} status=${optinRes.status} body=${JSON.stringify(optinBody)}`)
    return NextResponse.json({
      ok: false,
      item_id,
      catalog_product_id,
      status: optinRes.status,
      ml_error: optinBody,
    }, { status: 200 }) // 200 para que la UI lo reciba siempre
  }

  console.log(`[CATALOG-OPTIN] OK item=${item_id} catalog_listing_id=${optinBody.id}`)

  // Guardar catalog_listing_id en ml_listings si viene
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
    }, { onConflict: "ml_id" }).select()
  }

  return NextResponse.json({ ok: true, item_id, catalog_listing: optinBody })
}
