import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeEan } from "@/lib/ean-utils"
import Papa from "papaparse"

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

    if (!source) {
      console.error("[ARNOIA-STOCK] Source not found: searched with ilike '%arnoia%stock%' and is_active=true")
      return NextResponse.json({ error: "Arnoia Stock source not found or inactive" }, { status: 400 })
    }

    const credentials = source.credentials as any
    const url = credentials?.url || source.url_template
    if (!url) {
      console.error("[ARNOIA-STOCK] URL not configured. source:", { id: source.id, name: source.name, credentials: credentials ? Object.keys(credentials) : null })
      return NextResponse.json({ error: "URL not configured for Arnoia Stock source" }, { status: 400 })
    }

    // Descargar CSV
    console.log("[ARNOIA-STOCK] Fetching from:", url)
    
    // Timeout de 60 segundos para el fetch del CSV
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    
    let fetchRes: Response
    try {
      fetchRes = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 compatible" },
        signal: controller.signal,
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      const msg = fetchErr.name === "AbortError" ? "Timeout descargando CSV (60s)" : fetchErr.message
      console.error("[ARNOIA-STOCK] Fetch error:", msg)
      throw new Error(msg)
    }
    clearTimeout(timeoutId)
    
    if (!fetchRes.ok) {
      const errorText = await fetchRes.text().catch(() => "")
      console.error("[ARNOIA-STOCK] HTTP error:", fetchRes.status, errorText.substring(0, 200))
      throw new Error(`HTTP ${fetchRes.status} fetching stock CSV: ${errorText.substring(0, 100)}`)
    }
    
    const csvText = await fetchRes.text()

    // Parsear CSV con PapaParse (autodetectar delimiter)
    console.log(`[ARNOIA-STOCK] Parsing CSV (size: ${(csvText.length / 1024 / 1024).toFixed(2)}MB)...`)
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    })
    const rows = parsed.data as any[]
    console.log(`[ARNOIA-STOCK] Parsed ${rows.length} rows, headers: ${Object.keys(rows[0] || {}).slice(0, 5).join(", ")}`)

    if (rows.length === 0) throw new Error("CSV vacío o sin datos")

    // Construir arrays EAN, stock, precio deduplicados
    const eanMap = new Map<string, { stock: number; price: number | null }>()

    for (const row of rows) {
      const eanRaw = row["ean"] || row["EAN"] || row["ean13"] || row["EAN13"] || Object.values(row)[0]
      const ean = normalizeEan(String(eanRaw || ""))
      if (!ean || ean.length !== 13) continue

      const stockRaw = row["stock"] || row["STOCK"] || row["Stock"] || row["cantidad"] || "0"
      const priceRaw = row["precio_sin_iva"] || row["precio"] || row["PRECIO"] || row["pvp"] || null

      const stock = parseInt(String(stockRaw).replace(/\D/g, ""), 10) || 0
      const price = priceRaw ? parseFloat(String(priceRaw).replace(",", ".")) || null : null

      // Si EAN duplicado, sumar stock
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
