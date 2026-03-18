import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
const BATCH = 50
const RESOLVE_DELAY = 150  // ms entre resoluciones
const OPTIN_DELAY   = 300  // ms entre optins

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const { account_id, dry_run = false } = await req.json()
  if (!account_id) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

  const { data: account } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id, nickname")
    .eq("id", account_id)
    .single()

  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const startTime = Date.now()
  let ok_count = 0, failed_count = 0, no_match_count = 0, no_ean_count = 0
  let offset = 0

  while (true) {
    const { data: pubs } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title, ean, isbn, gtin")
      .eq("account_id", account_id)
      .in("status", ["active", "paused"])
      .or("ean.not.is.null,isbn.not.is.null,gtin.not.is.null")
      .range(offset, offset + BATCH - 1)
      .order("created_at", { ascending: false })

    if (!pubs || pubs.length === 0) break

    for (const pub of pubs) {
      const rawEan = pub.gtin || pub.ean || pub.isbn
      if (!rawEan) { no_ean_count++; continue }

      // Normalizar notación científica
      let ean = String(rawEan).trim()
      if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(ean)) {
        ean = Number(ean).toFixed(0)
      }

      // Resolver EAN → catalog_product_id
      const siteId = account.nickname?.startsWith("MLB") ? "MLB" : "MLA"
      const searchUrl = `https://api.mercadolibre.com/products/search?site_id=${siteId}&q=GTIN:${encodeURIComponent(ean)}`
      let catalog_product_id: string | null = null

      try {
        const searchRes = await fetch(searchUrl, { headers: { "Accept": "application/json" } })
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          const results: any[] = searchData.results ?? []
          if (results.length === 1) {
            catalog_product_id = results[0].id
          }
          // Ambiguo (>1) o not_found (0) → skip
          if (results.length !== 1) { no_match_count++; await delay(RESOLVE_DELAY); continue }
        } else {
          no_match_count++; await delay(RESOLVE_DELAY); continue
        }
      } catch {
        no_match_count++; await delay(RESOLVE_DELAY); continue
      }

      await delay(RESOLVE_DELAY)
      if (!catalog_product_id) { no_match_count++; continue }

      if (dry_run) { ok_count++; continue }

      // Optin
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
          console.error(`[CATALOG-OPTIN-BULK] FAIL item=${pub.ml_item_id} status=${optinRes.status}`, optinBody)
        }
      } catch (e: any) {
        failed_count++
        console.error(`[CATALOG-OPTIN-BULK] EXCEPTION item=${pub.ml_item_id}`, e.message)
      }

      await delay(OPTIN_DELAY)
    }

    if (pubs.length < BATCH) break
    offset += BATCH
  }

  const elapsed_seconds = parseFloat(((Date.now() - startTime) / 1000).toFixed(1))
  console.log(`[CATALOG-OPTIN-BULK] done dry_run=${dry_run} ok=${ok_count} failed=${failed_count} no_match=${no_match_count} elapsed=${elapsed_seconds}s`)

  return NextResponse.json({ ok: true, ok_count, failed_count, no_match_count, no_ean_count, elapsed_seconds, dry_run })
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
