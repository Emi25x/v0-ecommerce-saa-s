import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { mlFetchJson } from "@/domains/mercadolibre/api-client"

const SITE_ID = "MLA"
const BATCH_DELAY_MS = 300

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { account_id, products } = body

  // --- SCAN INPUT LOG ---
  console.log("SCAN INPUT", {
    products_received: products?.length,
    sample: products?.slice(0, 3),
  })

  if (!account_id) {
    return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
  }

  if (!products || products.length === 0) {
    console.log("SCAN INPUT: products.length === 0 — abortando sin análisis")
    return NextResponse.json({
      ok: false,
      status: "no_products",
      message: "No se recibieron productos para analizar",
    })
  }

  const supabase = createAdminClient()
  const startTime = Date.now()

  try {
    // Obtener access_token de la cuenta
    const { data: account, error: accErr } = await supabase
      .from("ml_accounts")
      .select("id, nickname, access_token")
      .eq("id", account_id)
      .single()

    if (accErr || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    const results: any[] = []
    let errors = 0

    for (const product of products) {
      const ean = (product.ean || "").replace(/\D/g, "").padStart(13, "0")
      if (!ean || ean.length !== 13) {
        console.warn(`[ANALYTICS-SCAN] EAN invalido ignorado: "${product.ean}" producto_id=${product.id}`)
        continue
      }

      try {
        const searchData = await mlFetchJson(
          `https://api.mercadolibre.com/sites/${SITE_ID}/search?q=${ean}&limit=20`,
          { accessToken: account.access_token },
          { account_id: account.id, op_name: "daily_scan_search" },
        )

        const items: any[] = searchData?.results || []
        if (items.length === 0) {
          results.push({ ean, found: 0 })
          continue
        }

        const prices = items.map((i: any) => Number(i.price)).filter((p: number) => p > 0).sort((a: number, b: number) => a - b)
        const min_price = prices[0] ?? null
        const avg_price = prices.length ? prices.reduce((s: number, p: number) => s + p, 0) / prices.length : null
        const median_price = prices.length ? prices[Math.floor(prices.length / 2)] : null
        const sellers_count = new Set(items.map((i: any) => i.seller?.id).filter(Boolean)).size
        const sold_qty_proxy = items.reduce((s: number, i: any) => s + (i.sold_quantity || 0), 0)

        await supabase.from("ml_market_snapshots").upsert({
          account_id,
          ean,
          title: product.title || items[0]?.title || "",
          min_price,
          avg_price,
          median_price,
          sellers_count,
          sold_qty_proxy,
          total_results: items.length,
          sample_item_ids: items.slice(0, 5).map((i: any) => i.id),
          captured_at: new Date().toISOString(),
          captured_day: new Date().toISOString().slice(0, 10),
        }, {
          onConflict: "account_id,ean,captured_day",
          ignoreDuplicates: false,
        })

        results.push({ ean, found: items.length, min_price, median_price, sellers_count })
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      } catch (err: any) {
        console.error(`[ANALYTICS-SCAN] Error EAN ${ean}:`, err.message)
        errors++
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ANALYTICS-SCAN] Completado: ${results.length} EANs, ${errors} errores en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      status: "completed",
      scanned: results.length,
      errors,
      elapsed_seconds: parseFloat(elapsed),
      results,
    })
  } catch (err: any) {
    console.error("[ANALYTICS-SCAN] Error general:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
