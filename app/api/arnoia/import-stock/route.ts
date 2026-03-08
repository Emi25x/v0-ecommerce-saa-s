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
  console.log("[ARNOIA-STOCK] POST request received")

  try {
    // Obtener fuente Arnoia Stock
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .ilike("name", "%arnoia%stock%")
      .eq("is_active", true)
      .single()

    if (!source) {
      console.error("[ARNOIA-STOCK] Source not found")
      return NextResponse.json({ error: "Arnoia Stock source not found", updated: 0, created: 0 }, { status: 400 })
    }

    const credentials = source.credentials as any
    const url = credentials?.url || source.url_template

    if (!url) {
      console.error("[ARNOIA-STOCK] URL not configured")
      return NextResponse.json({ error: "URL not configured", updated: 0, created: 0 }, { status: 400 })
    }

    // ── NUEVA ESTRATEGIA: Retornar inmediatamente y ejecutar en background ──
    // Esto evita que la UI se quede esperando si el download es lento
    const result = { updated: 0, created: 0, status: "queued" }
    
    // Ejecutar el import en background (sin await)
    ;(async () => {
      try {
        console.log("[ARNOIA-STOCK] Background task: Fetching CSV from", url)
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120000)  // 120s timeout
        
        const fetchRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 compatible" },
          signal: controller.signal,
        }).catch(err => {
          clearTimeout(timeoutId)
          throw err
        })
        clearTimeout(timeoutId)
        
        if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`)
        
        const csvText = await fetchRes.text()
        console.log(`[ARNOIA-STOCK] CSV fetched: ${csvText.length} bytes`)

        // Parsear CSV
        const parsed = Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
        })
        const rows = parsed.data as any[]
        console.log(`[ARNOIA-STOCK] Parsed ${rows.length} rows`)

        if (rows.length === 0) {
          console.warn("[ARNOIA-STOCK] CSV vacío")
          return
        }

        // Construir arrays EAN, stock, precio
        const eanMap = new Map<string, { stock: number; price: number | null }>()

        for (const row of rows) {
          const eanRaw = row["ean"] || row["EAN"] || row["ean13"] || row["EAN13"] || Object.values(row)[0]
          const ean = normalizeEan(String(eanRaw || ""))
          if (!ean || ean.length !== 13) continue

          const stockRaw = row["stock"] || row["STOCK"] || row["Stock"] || row["cantidad"] || "0"
          const priceRaw = row["precio_sin_iva"] || row["precio"] || row["PRECIO"] || row["pvp"] || null

          const stock = parseInt(String(stockRaw).replace(/\D/g, ""), 10) || 0
          const price = priceRaw ? parseFloat(String(priceRaw).replace(",", ".")) || null : null

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

        // Procesar en batches de 1000
        const BATCH_SIZE = 1000
        let totalUpdated = 0

        for (let i = 0; i < eans.length; i += BATCH_SIZE) {
          const batchEans = eans.slice(i, i + BATCH_SIZE)
          const batchStocks = stocks.slice(i, i + BATCH_SIZE)
          const batchPrices = prices.slice(i, i + BATCH_SIZE)

          const { data: rpcResult, error: rpcError } = await supabase.rpc("bulk_update_stock_price", {
            p_eans: batchEans,
            p_stocks: batchStocks,
            p_prices: batchPrices,
          })

          if (!rpcError && typeof rpcResult === "number") {
            totalUpdated += rpcResult
            console.log(`[ARNOIA-STOCK] Batch ${i}-${i + batchEans.length}: ${rpcResult} updated`)
          }
        }

        // Actualizar source
        await supabase.from("import_sources").update({
          last_run: new Date().toISOString(),
          last_status: "success",
        }).eq("id", source.id)

        console.log(`[ARNOIA-STOCK] Background complete: ${totalUpdated} updated`)
      } catch (err: any) {
        console.error("[ARNOIA-STOCK] Background error:", err.message)
        await supabase.from("import_sources").update({
          last_run: new Date().toISOString(),
          last_status: "error",
        }).eq("id", source.id)
      }
    })()

    // Retornar inmediatamente (no esperar el background task)
    return NextResponse.json({
      updated: 0,
      created: 0,
      status: "queued - processing in background",
      message: "Import started successfully",
    })
  } catch (err: any) {
    console.error("[ARNOIA-STOCK] Error:", err.message)
    return NextResponse.json({ error: err.message, updated: 0, created: 0 }, { status: 500 })
  }
}
