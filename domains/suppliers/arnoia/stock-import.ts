/**
 * runArnoiaStockImport
 *
 * Standalone stock-update import for Arnoia Stock.
 * Extracted from app/api/arnoia/import-stock/route.ts so callers can invoke
 * it as a direct function instead of an HTTP self-call (which fails in
 * serverless environments with "fetch failed").
 *
 * Strategy:
 *  - Look up the active Arnoia Stock import source
 *  - Download the pipe-delimited CSV (latin1 encoding)
 *  - Build an EAN → {stock, price} map
 *  - Push updates via bulk_update_stock_price RPC in batches of 1000
 *  - Also write stock_by_source[source_key] so warehouse filters work
 */

import { createAdminClient } from "@/lib/db/admin"
import { normalizeEan } from "@/domains/inventory/ean-utils"
import { detectDelimiter } from "@/lib/import/csv-helpers"
import { startRun } from "@/lib/process-runs"

export interface ArnoiaStockImportResult {
  success: boolean
  updated: number
  not_found: number
  zeroed?: number
  total_rows: number
  unique_eans: number
  duration_seconds: number
  error?: string
}

export async function runArnoiaStockImport(): Promise<ArnoiaStockImportResult> {
  const supabase = createAdminClient()
  const startTime = Date.now()
  const run = await startRun(supabase, "arnoia_stock", "Arnoia Stock Diario")
  console.log("[ARNOIA-STOCK] Starting bulk stock update")

  try {
    // Obtener fuente Arnoia Stock
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .ilike("name", "%arnoia%stock%")
      .eq("is_active", true)
      .single()

    if (!source) {
      return {
        success: false,
        updated: 0,
        not_found: 0,
        total_rows: 0,
        unique_eans: 0,
        duration_seconds: 0,
        error: "Arnoia Stock source not found or inactive",
      }
    }

    const credentials = source.credentials as any
    const url = credentials?.url || source.url_template
    if (!url) {
      return {
        success: false,
        updated: 0,
        not_found: 0,
        total_rows: 0,
        unique_eans: 0,
        duration_seconds: 0,
        error: "URL not configured",
      }
    }

    // Descargar CSV
    console.log("[ARNOIA-STOCK] Fetching from:", url)
    const fetchRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 compatible" } })
    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status} fetching stock CSV`)
    const buffer = Buffer.from(await fetchRes.arrayBuffer())
    const csvText = buffer.toString("latin1")

    const lines = csvText.split("\n").filter((l) => l.trim())
    console.log(`[ARNOIA-STOCK] Descargado: ${lines.length} líneas`)
    if (lines.length === 0) throw new Error("CSV vacío o sin datos")

    // Detectar delimiter
    const firstLine = lines[0]
    const delimiter = detectDelimiter(firstLine)

    // Detectar si tiene encabezado: primera columna numérica → sin header
    const firstCol = firstLine.split(delimiter)[0].replace(/['"]/g, "").trim()
    const hasHeader = !/^[0-9]+$/.test(firstCol)
    const startLine = hasHeader ? 1 : 0

    let eanColIdx = 0,
      stockColIdx = 1,
      priceColIdx = -1
    if (hasHeader) {
      const headers = firstLine.split(delimiter).map((h) => h.replace(/['"]/g, "").trim().toLowerCase())
      eanColIdx = headers.findIndex((h) => ["ean", "ean13", "isbn", "gtin", "codigo"].includes(h))
      stockColIdx = headers.findIndex((h) => ["stock", "cantidad", "qty", "disponible"].includes(h))
      priceColIdx = headers.findIndex((h) => ["precio_sin_iva", "precio", "pvp", "price"].includes(h))
      if (eanColIdx < 0) eanColIdx = 0
      if (stockColIdx < 0) stockColIdx = 1
    }

    console.log(
      `[ARNOIA-STOCK] delimiter="${delimiter}" hasHeader=${hasHeader} eanCol=${eanColIdx} stockCol=${stockColIdx}`,
    )

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
    const stocks = eans.map((e) => eanMap.get(e)!.stock)
    const prices = eans.map((e) => eanMap.get(e)!.price)

    console.log(`[ARNOIA-STOCK] ${eans.length} unique EANs to update`)

    const BATCH_SIZE = 1000
    let totalUpdated = 0
    let totalNotFound = 0
    const stockKey = (source as any).source_key ?? "arnoia"

    for (let i = 0; i < eans.length; i += BATCH_SIZE) {
      const batchEans = eans.slice(i, i + BATCH_SIZE)
      const batchStocks = stocks.slice(i, i + BATCH_SIZE)
      const batchPrices = prices.slice(i, i + BATCH_SIZE)

      // RPC actualiza stock_by_source[source_key] + trigger recalcula products.stock
      const { data: rpcResult, error: rpcError } = await supabase.rpc("bulk_update_stock_price", {
        p_eans: batchEans,
        p_stocks: batchStocks,
        p_prices: batchPrices,
        p_source_key: stockKey,
      })

      if (rpcError) {
        console.error(`[ARNOIA-STOCK] RPC error batch ${i}-${i + batchEans.length}:`, rpcError.message)
      } else {
        const batchUpdated = typeof rpcResult === "number" ? rpcResult : 0
        totalUpdated += batchUpdated
        totalNotFound += batchEans.length - batchUpdated
        console.log(
          `[ARNOIA-STOCK] Batch ${i}-${i + batchEans.length}: ${batchUpdated} updated (source_key=${stockKey})`,
        )
      }

      // Checkpoint: update process_runs so progress is visible mid-run.
      // If the function times out, we know how far it got.
      await run.checkpoint({
        rows_processed: Math.min(i + BATCH_SIZE, eans.length),
        rows_updated: totalUpdated,
        rows_failed: totalNotFound,
        log_json: { checkpoint: true, batch_offset: i + BATCH_SIZE, total_eans: eans.length, zeroed: 0 },
      })
    }

    // ── Zero-out: poner stock_by_source[source_key] = 0 en productos que
    // NO están en el archivo (ya no disponibles en Arnoia este día).
    // Preserva stock de otros proveedores (Azeta, Libral, etc.)
    let zeroed = 0
    const { data: zeroResult, error: zeroError } = await supabase.rpc("zero_source_stock_not_in_list", {
      p_eans: eans,
      p_source_key: stockKey,
    })
    if (zeroError) {
      // Si la función no existe aún, intentar con la genérica
      console.warn(`[ARNOIA-STOCK] zero_source_stock_not_in_list error: ${zeroError.message}`)
      // Fallback: query manual
      const { data: toZero } = await supabase
        .from("products")
        .select("id, ean, stock_by_source")
        .not("stock_by_source", "is", null)
        .not("ean", "is", null)

      if (toZero) {
        const toUpdate = toZero.filter((p: any) => {
          const sbs = p.stock_by_source || {}
          const currentStock = sbs[stockKey]
          return currentStock != null && currentStock > 0 && !eans.includes(p.ean)
        })

        if (toUpdate.length > 0) {
          // Update in batches
          for (let i = 0; i < toUpdate.length; i += 500) {
            const batch = toUpdate.slice(i, i + 500)
            for (const p of batch) {
              const newSbs = { ...p.stock_by_source, [stockKey]: 0 }
              await supabase.from("products").update({ stock_by_source: newSbs }).eq("id", p.id)
            }
          }
          zeroed = toUpdate.length
          console.log(`[ARNOIA-STOCK] Zeroed ${zeroed} products not in file (fallback method)`)
        }
      }
    } else {
      zeroed = zeroResult?.zeroed ?? 0
      console.log(`[ARNOIA-STOCK] Zeroed ${zeroed} products not in file`)
    }

    const duration = (Date.now() - startTime) / 1000

    // Actualizar last_run del source
    await supabase
      .from("import_sources")
      .update({
        last_run: new Date().toISOString(),
        last_status: "success",
      })
      .eq("id", source.id)

    console.log(
      `[ARNOIA-STOCK] Done: ${totalUpdated} updated, ${totalNotFound} not found, ${zeroed} zeroed, ${duration.toFixed(2)}s`,
    )

    await run.complete({
      rows_processed: eans.length,
      rows_updated: totalUpdated,
      rows_failed: totalNotFound,
      log_json: { zeroed, total_rows: lines.length, unique_eans: eans.length },
    })

    return {
      success: true,
      updated: totalUpdated,
      not_found: totalNotFound,
      zeroed,
      total_rows: lines.length,
      unique_eans: eans.length,
      duration_seconds: parseFloat(duration.toFixed(2)),
    }
  } catch (err: any) {
    console.error("[ARNOIA-STOCK] Fatal error:", err.message)
    await run.fail(err)
    return {
      success: false,
      updated: 0,
      not_found: 0,
      total_rows: 0,
      unique_eans: 0,
      duration_seconds: 0,
      error: err.message,
    }
  }
}
