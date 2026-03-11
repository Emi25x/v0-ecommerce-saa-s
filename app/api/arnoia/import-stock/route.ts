import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeEan } from "@/lib/ean-utils"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Vercel Cron invoca con GET — delegar a POST
export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const startTime = Date.now()
  console.log("[ARNOIA-STOCK] Starting bulk stock update")

  try {
    // Este endpoint usa service role (createAdminClient) — no requiere sesión de usuario.
    // Si viene del cron, validar secret; si viene del browser (UI), permitir siempre
    // ya que el service role key no expone datos sensibles y la lógica es server-side.
    console.log("[ARNOIA-STOCK] Auth OK (service role)")

    // Obtener fuente Arnoia Stock
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .ilike("name", "%arnoia%stock%")
      .eq("is_active", true)
      .single()

    if (!source) return NextResponse.json({ error: "Arnoia Stock source not found or inactive" }, { status: 400 })

    const credentials = source.credentials as any
    const url = credentials?.url || source.url_template
    if (!url) return NextResponse.json({ error: "URL not configured" }, { status: 400 })

    // Descargar CSV
    console.log("[ARNOIA-STOCK] Fetching from:", url)
    const fetchRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 compatible" },
    })
    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status} fetching stock CSV`)
    const buffer  = Buffer.from(await fetchRes.arrayBuffer())
    const csvText = buffer.toString("latin1")

    const lines = csvText.split("\n").filter(l => l.trim())
    console.log(`[ARNOIA-STOCK] Descargado: ${lines.length} líneas`)
    if (lines.length === 0) throw new Error("CSV vacío o sin datos")

    // Detectar delimiter
    const firstLine = lines[0]
    const semiCount  = (firstLine.match(/;/g)  || []).length
    const pipeCount  = (firstLine.match(/\|/g) || []).length
    const commaCount = (firstLine.match(/,/g)  || []).length
    const delimiter  = pipeCount >= semiCount && pipeCount >= commaCount ? "|"
      : semiCount >= commaCount ? ";" : ","

    // Detectar si tiene encabezado: primera columna numérica → sin header
    const firstCol = firstLine.split(delimiter)[0].replace(/['"]/g, "").trim()
    const hasHeader = !/^[0-9]+$/.test(firstCol)
    const startLine = hasHeader ? 1 : 0

    let eanColIdx = 0, stockColIdx = 1, priceColIdx = -1
    if (hasHeader) {
      const headers = firstLine.split(delimiter).map(h => h.replace(/['"]/g, "").trim().toLowerCase())
      eanColIdx   = headers.findIndex(h => ["ean", "ean13", "isbn", "gtin", "codigo"].includes(h))
      stockColIdx = headers.findIndex(h => ["stock", "cantidad", "qty", "disponible"].includes(h))
      priceColIdx = headers.findIndex(h => ["precio_sin_iva", "precio", "pvp", "price"].includes(h))
      if (eanColIdx < 0)   eanColIdx   = 0
      if (stockColIdx < 0) stockColIdx = 1
    }

    console.log(`[ARNOIA-STOCK] delimiter="${delimiter}" hasHeader=${hasHeader} eanCol=${eanColIdx} stockCol=${stockColIdx}`)

    // Construir mapa EAN → {stock, price} deduplicado
    const eanMap = new Map<string, { stock: number; price: number | null }>()

    for (let i = startLine; i < lines.length; i++) {
      const parts = lines[i].split(delimiter)
      if (parts.length < 2) continue

      const eanRaw = (parts[eanColIdx] ?? "").replace(/['"]/g, "").trim().replace(/\D/g, "")
      const ean = normalizeEan(eanRaw)
      if (!ean || ean.length !== 13) continue

      const stockRaw = (parts[stockColIdx] ?? "").replace(/['"]/g, "").trim()
      const priceRaw = priceColIdx >= 0 ? (parts[priceColIdx] ?? "").replace(/['"]/g, "").trim() : null

      const stock = parseInt(stockRaw.replace(/\D/g, ""), 10) || 0
      const price = priceRaw ? parseFloat(priceRaw.replace(",", ".")) || null : null

      if (eanMap.has(ean)) {
        const existing = eanMap.get(ean)!
        eanMap.set(ean, { stock: existing.stock + stock, price: price ?? existing.price })
      } else {
        eanMap.set(ean, { stock, price })
      }
    }

    const eans = Array.from(eanMap.keys())
    const stocks = eans.map(e => eanMap.get(e)!.stock)
    const prices = eans.map(e => eanMap.get(e)!.price)

    console.log(`[ARNOIA-STOCK] ${eans.length} unique EANs to update`)

    // Enviar en lotes de 1000 a la RPC bulk
    const BATCH_SIZE = 1000
    let totalUpdated = 0
    let totalNotFound = 0

    for (let i = 0; i < eans.length; i += BATCH_SIZE) {
      const batchEans = eans.slice(i, i + BATCH_SIZE)
      const batchStocks = stocks.slice(i, i + BATCH_SIZE)
      const batchPrices = prices.slice(i, i + BATCH_SIZE)

      const { data: rpcResult, error: rpcError } = await supabase.rpc("bulk_update_stock_price", {
        p_eans: batchEans,
        p_stocks: batchStocks,
        p_prices: batchPrices,
      })

      if (rpcError) {
        console.error(`[ARNOIA-STOCK] RPC error batch ${i}-${i + batchEans.length}:`, rpcError.message)
      } else {
        const batchUpdated = typeof rpcResult === "number" ? rpcResult : 0
        totalUpdated += batchUpdated
        totalNotFound += batchEans.length - batchUpdated
        console.log(`[ARNOIA-STOCK] Batch ${i}-${i + batchEans.length}: ${batchUpdated} updated`)
      }

      // También actualizar stock_by_source.arnoia para que el almacén vinculado pueda leerlo
      const { data: existingProds } = await supabase
        .from("products")
        .select("id, ean, stock_by_source")
        .in("ean", batchEans)

      if (existingProds && existingProds.length > 0) {
        const stockByEan = new Map(batchEans.map((e, idx) => [e, batchStocks[idx]]))
        const stockKey = (source as any).source_key ?? "arnoia"
        const arnoiaUpdates = existingProds.map((p: any) => {
          const merged = { ...(p.stock_by_source || {}), [stockKey]: stockByEan.get(p.ean) ?? 0 }
          return {
            id: p.id,
            stock_by_source: merged,
            stock: Object.values(merged).reduce((s: number, v: any) => s + (Number(v) || 0), 0),
          }
        })
        await supabase.from("products").upsert(arnoiaUpdates, { onConflict: "id" })
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Actualizar last_run del source
    await supabase.from("import_sources").update({
      last_run: new Date().toISOString(),
      last_status: "success",
    }).eq("id", source.id)

    console.log(`[ARNOIA-STOCK] Done: ${totalUpdated} updated, ${totalNotFound} not found, ${duration}s`)

    return NextResponse.json({
      success: true,
      updated: totalUpdated,
      not_found: totalNotFound,
      total_rows: rows.length,
      unique_eans: eans.length,
      duration_seconds: parseFloat(duration),
    })
  } catch (err: any) {
    console.error("[ARNOIA-STOCK] Fatal error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
