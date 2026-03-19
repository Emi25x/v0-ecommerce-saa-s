import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import {
  normalizeEanForCatalog,
  resolveCatalogProductId,
  optinItemToCatalog,
} from "@/domains/mercadolibre/catalog-optin"
const BATCH = 20
const RESOLVE_DELAY = 200
const OPTIN_DELAY = 300

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const { account_id, dry_run = false, offset = 0 } = await req.json()
  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const { data: account, error: accountError } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!account) {
    console.error("[CATALOG-OPTIN-BULK] Cuenta no encontrada:", account_id, accountError?.message)
    return NextResponse.json({ error: "Cuenta no encontrada", detail: accountError?.message }, { status: 404 })
  }

  const siteId = "MLA"

  // Obtener el total de publicaciones de esta cuenta (para el progreso)
  const { count: totalCount } = await supabase
    .from("ml_publications")
    .select("*", { count: "exact", head: true })
    .eq("account_id", account_id)
    .in("status", ["active", "paused"])
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")

  const { data: pubs } = await supabase
    .from("ml_publications")
    .select("id, ml_item_id, title, ean, isbn, gtin")
    .eq("account_id", account_id)
    .in("status", ["active", "paused"])
    .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
    .range(offset, offset + BATCH - 1)
    .order("created_at", { ascending: false })

  if (!pubs || pubs.length === 0) {
    return NextResponse.json({
      ok: true,
      done: true,
      offset,
      total: totalCount ?? 0,
      ok_count: 0,
      failed_count: 0,
      no_match_count: 0,
      no_ean_count: 0,
    })
  }

  let ok_count = 0,
    failed_count = 0,
    no_match_count = 0,
    no_ean_count = 0
  let firstErrorLogged = false

  for (const pub of pubs) {
    const rawEan = pub.gtin || pub.ean || pub.isbn
    if (!rawEan) {
      no_ean_count++
      continue
    }

    const ean = normalizeEanForCatalog(String(rawEan))

    // Resolver EAN contra ML Products API
    const catalog_product_id = await resolveCatalogProductId({
      ean,
      accessToken: account.access_token,
      siteId,
    })

    if (!catalog_product_id) {
      no_match_count++
      await delay(RESOLVE_DELAY)
      continue
    }

    await delay(RESOLVE_DELAY)

    if (dry_run) {
      ok_count++
      continue
    }

    // Optin al catálogo
    const optinResult = await optinItemToCatalog({
      itemId: pub.ml_item_id,
      catalogProductId: catalog_product_id,
      accessToken: account.access_token,
    })

    if (optinResult.ok) {
      ok_count++
      if (optinResult.data?.id) {
        await supabase.from("ml_listings").upsert(
          {
            account_id,
            ml_id: optinResult.data.id,
            catalog_listing: true,
            catalog_product_id,
            status: optinResult.data.status ?? "active",
            price: optinResult.data.price ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ml_id" },
        )
      }
    } else {
      failed_count++
      if (!firstErrorLogged) {
        console.error(`[CATALOG-OPTIN-BULK-RUN] FIRST OPTIN FAIL item=${pub.ml_item_id}`, optinResult.error)
        firstErrorLogged = true
      }
    }

    await delay(OPTIN_DELAY)
  }

  const newOffset = offset + pubs.length
  const done = pubs.length < BATCH

  return NextResponse.json({
    ok: true,
    done,
    offset: newOffset,
    total: totalCount ?? 0,
    batch_size: pubs.length,
    ok_count,
    failed_count,
    no_match_count,
    no_ean_count,
    dry_run,
  })
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
