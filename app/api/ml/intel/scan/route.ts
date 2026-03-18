/**
 * GET /api/ml/intel/scan?account_id=UUID
 *
 * Para cada EAN en ml_publications de la cuenta:
 *  - Skipea si ya hay snapshot del día (cache 24h)
 *  - Consulta /sites/MLA/search?q=<ean> (fallback por título si no hay EAN)
 *  - Calcula min/median/avg/sellers/sold_qty_proxy
 *  - Upsert en ml_market_snapshots
 *
 * NO modifica publicaciones, precios ni ninguna otra tabla.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mlFetchJson, isMlFetchError } from "@/domains/mercadolibre/api-client"

const SITE_ID = "MLA"
const BATCH_DELAY_MS = 300   // delay entre requests para no saturar ML API
const MAX_EANS_PER_RUN = 200 // máximo EANs por ejecución

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const account_id = searchParams.get("account_id")

  if (!account_id) {
    return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    // 1. Obtener access_token de la cuenta
    const { data: account, error: accErr } = await supabase
      .from("ml_accounts")
      .select("id, nickname, access_token")
      .eq("id", account_id)
      .single()

    if (accErr || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    const accessToken = account.access_token
    if (!accessToken) {
      return NextResponse.json({ error: "Cuenta sin access_token" }, { status: 400 })
    }

    // 2. Obtener EANs distintos de las publicaciones de esta cuenta
    const { data: pubs, error: pubsErr } = await supabase
      .from("ml_publications")
      .select("ean, title")
      .eq("account_id", account_id)
      .not("ean", "is", null)
      .neq("ean", "")
      .limit(MAX_EANS_PER_RUN)

    if (pubsErr) {
      return NextResponse.json({ error: pubsErr.message }, { status: 500 })
    }

    // --- DIAGNÓSTICO EAN ---
    const { count: totalProducts } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)

    const { count: productsWithEan } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account_id)
      .not("ean", "is", null)
      .neq("ean", "")

    // EANs con longitud != 13 (inválidos)
    const { data: allEanRows } = await supabase
      .from("ml_publications")
      .select("ean")
      .eq("account_id", account_id)
      .not("ean", "is", null)
      .neq("ean", "")
      .limit(2000)

    const invalidEans = (allEanRows || []).filter(r => (r.ean || "").replace(/\D/g, "").length !== 13)
    const invalidEanCount = invalidEans.length

    console.log(`[ML-INTEL-SCAN] DIAG total_publications=${totalProducts} publications_with_ean=${productsWithEan} invalid_ean_count=${invalidEanCount}`)
    if (invalidEanCount > 0) {
      console.warn(`[ML-INTEL-SCAN] WARN EANs invalidos (length!=13): ${invalidEans.slice(0, 10).map(r => JSON.stringify(r.ean)).join(", ")}`)
    }
    // --- FIN DIAGNÓSTICO ---

    if (!pubs || pubs.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No hay publicaciones con EAN",
        scanned: 0,
        diag: { total_products: totalProducts, products_with_ean: productsWithEan, invalid_ean_count: invalidEanCount },
      })
    }

    // Deduplicar EANs — normalizar notación científica antes de deduplicar
    console.log(`[ML-INTEL-SCAN] STEP candidatos raw: ${pubs.length}`)
    const eanMap = new Map<string, string>() // ean_normalizado → title
    let skippedSci = 0
    let skippedEmpty = 0
    for (const p of pubs) {
      if (!p.ean) { skippedEmpty++; continue }

      // Normalizar notación científica de Excel: 9.78845E+12 → "9788450000000"
      let ean = p.ean.trim()
      if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(ean)) {
        const normalized = Number(ean).toFixed(0)
        console.log(`[ML-INTEL-SCAN] Notacion cientifica normalizada: "${ean}" → "${normalized}"`)
        ean = normalized
        skippedSci++
      }

      if (!ean) { skippedEmpty++; continue }

      const cleaned = ean.replace(/\D/g, "")
      if (cleaned.length !== 13) {
        console.warn(`[ML-INTEL-SCAN] WARN EAN invalido: "${ean}" (${cleaned.length} digitos) titulo="${p.title?.slice(0, 40)}"`)
        // No filtrar — buscar igual por si ML lo acepta
      }
      if (!eanMap.has(ean)) eanMap.set(ean, p.title || "")
    }
    console.log(`[ML-INTEL-SCAN] STEP tras dedup: ${eanMap.size} EANs únicos (sci_normalized=${skippedSci} skipped_empty=${skippedEmpty})`)
    console.log(`[ML-INTEL-SCAN] sample EANs: ${Array.from(eanMap.keys()).slice(0, 5).join(", ")}`)
    const eans = Array.from(eanMap.entries())

    // 3. Filtrar EANs que ya tienen snapshot hoy
    const today = new Date().toISOString().slice(0, 10)
    const { data: existingSnaps } = await supabase
      .from("ml_market_snapshots")
      .select("ean")
      .eq("account_id", account_id)
      .eq("captured_day", today)

    const alreadyScanned = new Set((existingSnaps || []).map((s: any) => s.ean))
    const toScan = eans.filter(([ean]) => !alreadyScanned.has(ean))

    console.log(`[ML-INTEL-SCAN] STEP tras filtro cache: ${toScan.length} a escanear (${alreadyScanned.size} ya cacheados hoy)`)
    console.log(`[ML-INTEL-SCAN] account=${account.nickname} total_eans=${eans.length} already_cached=${alreadyScanned.size} to_scan=${toScan.length}`)

    if (toScan.length === 0 && eans.length === 0) {
      return NextResponse.json({
        ok: false,
        status: "no_candidates",
        reason: "no_publications_for_account",
        message: "No hay publicaciones con EAN para esta cuenta",
        diag: { total_products: totalProducts, products_with_ean: productsWithEan, invalid_ean_count: invalidEanCount },
      })
    }

    const diag = { total_products: totalProducts, products_with_ean: productsWithEan, invalid_ean_count: invalidEanCount }

    if (toScan.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Todos los EANs ya tienen snapshot de hoy",
        scanned: 0,
        cached: alreadyScanned.size,
        diag,
      })
    }

    // 4. Escanear cada EAN
    let scanned = 0
    let errors = 0
    const results: any[] = []

    for (const [ean, fallbackTitle] of toScan) {
      try {
        // Buscar por GTIN primero, fallback por título
        const searchUrl = `https://api.mercadolibre.com/sites/${SITE_ID}/search?q=${encodeURIComponent(ean)}&limit=50`
        const searchRes = await mlFetchJson(searchUrl, { accessToken }, { account_id, op_name: `intel-scan-ean-${ean}` })

        if (isMlFetchError(searchRes)) {
          console.warn(`[ML-INTEL-SCAN] Error buscando EAN ${ean}: ${searchRes.status}`)
          errors++
          await delay(BATCH_DELAY_MS)
          continue
        }

        const items: any[] = searchRes.results || []

        if (items.length === 0) {
          // Sin resultados — no guardar snapshot vacío
          await delay(BATCH_DELAY_MS)
          continue
        }

        // Calcular métricas
        const prices = items.map((i: any) => i.price).filter((p: any) => p > 0).sort((a: number, b: number) => a - b)
        const minPrice = prices[0] ?? null
        const avgPrice = prices.length > 0 ? prices.reduce((s: number, p: number) => s + p, 0) / prices.length : null
        const medianPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null
        const sellersCount = new Set(items.map((i: any) => i.seller?.id).filter(Boolean)).size
        const fullSellersCount = items.filter((i: any) => i.shipping?.free_shipping).length
        const freeShippingRate = items.length > 0 ? fullSellersCount / items.length : 0
        const soldQtyProxy = items.reduce((sum: number, i: any) => sum + (i.sold_quantity || 0), 0)
        const categoryId = items[0]?.category_id ?? null
        const sampleItemIds = items.slice(0, 5).map((i: any) => i.id)

        // Upsert snapshot
        const { error: upsertErr } = await supabase
          .from("ml_market_snapshots")
          .upsert({
            account_id,
            ean,
            category_id: categoryId,
            captured_at: new Date().toISOString(),
            captured_day: today,
            min_price: minPrice,
            median_price: medianPrice,
            avg_price: avgPrice ? parseFloat(avgPrice.toFixed(2)) : null,
            sellers_count: sellersCount,
            full_sellers_count: fullSellersCount,
            free_shipping_rate: parseFloat(freeShippingRate.toFixed(4)),
            sold_qty_proxy: soldQtyProxy,
            sample_item_ids: sampleItemIds,
          }, {
            onConflict: "account_id,ean,captured_day",
            ignoreDuplicates: false,
          })

        if (upsertErr) {
          console.error(`[ML-INTEL-SCAN] Upsert error EAN ${ean}:`, upsertErr.message)
          errors++
        } else {
          scanned++
          results.push({ ean, min_price: minPrice, median_price: medianPrice, sellers_count: sellersCount })
        }

      } catch (err: any) {
        console.error(`[ML-INTEL-SCAN] Exception EAN ${ean}:`, err.message)
        errors++
      }

      await delay(BATCH_DELAY_MS)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ML-INTEL-SCAN] Done: scanned=${scanned} errors=${errors} elapsed=${elapsed}s`)

    return NextResponse.json({
      ok: true,
      scanned,
      errors,
      cached: alreadyScanned.size,
      elapsed_seconds: parseFloat(elapsed),
      results,
      diag,
    })

  } catch (err: any) {
    console.error("[ML-INTEL-SCAN] Fatal:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
