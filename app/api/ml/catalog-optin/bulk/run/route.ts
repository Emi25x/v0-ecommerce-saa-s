import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH = 20         // publicaciones por llamada — mantiene la peticion < 15s
const RESOLVE_DELAY = 200
const OPTIN_DELAY   = 300

export async function POST(req: NextRequest) {
  const { account_id, dry_run = false, offset = 0 } = await req.json()
  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname, site_id")
    .eq("id", account_id)
    .single()

  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  // site_id viene de la tabla, fallback a MLA
  const siteId = account.site_id ?? "MLA"

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
    return NextResponse.json({ ok: true, done: true, offset, total: totalCount ?? 0, ok_count: 0, failed_count: 0, no_match_count: 0, no_ean_count: 0 })
  }

  let ok_count = 0, failed_count = 0, no_match_count = 0, no_ean_count = 0
  let firstErrorLogged = false

  for (const pub of pubs) {
    const rawEan = pub.gtin || pub.ean || pub.isbn
    if (!rawEan) { no_ean_count++; continue }

    // Normalizar notacion cientifica (ej: 9.78845E+12 → "9788450...")
    let ean = String(rawEan).trim()
    if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(ean)) {
      ean = Number(ean).toFixed(0)
    }

    // Resolver EAN contra ML Products API — igual que publish/route.ts usa product_identifier
    const searchUrl = `https://api.mercadolibre.com/products/search?status=active&site_id=${siteId}&product_identifier=${encodeURIComponent(ean)}`
    let catalog_product_id: string | null = null

    try {
      const controller = new AbortController()
      const tid = setTimeout(() => controller.abort(), 8000)
      const searchRes = await fetch(searchUrl, {
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${account.access_token}`,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(tid))

      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const results: any[] = searchData.results ?? []
        if (results.length > 0) {
          // product_identifier es búsqueda exacta — tomar el primero igual que publish
          catalog_product_id = results[0].id
        } else {
          no_match_count++
          await delay(RESOLVE_DELAY)
          continue
        }
      } else {
        if (!firstErrorLogged) {
          const body = await searchRes.text()
          console.error(`[CATALOG-OPTIN-BULK-RUN] FIRST RESOLVE ERROR status=${searchRes.status} ean=${ean} body=${body.slice(0, 200)}`)
          firstErrorLogged = true
        }
        no_match_count++
        await delay(RESOLVE_DELAY)
        continue
      }
    } catch (e: any) {
      console.error(`[CATALOG-OPTIN-BULK-RUN] RESOLVE EXCEPTION ean=${ean}`, e.message)
      no_match_count++
      await delay(RESOLVE_DELAY)
      continue
    }

    await delay(RESOLVE_DELAY)

    if (!catalog_product_id) { no_match_count++; continue }
    if (dry_run) { ok_count++; continue }

    // Optin: mismo mecanismo que publish
    try {
      const optinRes = await fetch("https://api.mercadolibre.com/items/catalog_listings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ item_id: pub.ml_item_id, catalog_product_id }),
      })
      const optinBody = await optinRes.json().catch(() => ({}))

      if (optinRes.ok) {
        ok_count++
        if (optinBody.id) {
          await supabase.from("ml_listings").upsert({
            account_id,
            ml_id: optinBody.id,
            catalog_listing: true,
            catalog_product_id,
            status: optinBody.status ?? "active",
            price: optinBody.price ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "ml_id" })
        }
      } else {
        failed_count++
        if (!firstErrorLogged) {
          console.error(`[CATALOG-OPTIN-BULK-RUN] FIRST OPTIN FAIL item=${pub.ml_item_id} status=${optinRes.status}`, optinBody)
          firstErrorLogged = true
        }
      }
    } catch (e: any) {
      failed_count++
      console.error(`[CATALOG-OPTIN-BULK-RUN] OPTIN EXCEPTION item=${pub.ml_item_id}`, e.message)
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

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
