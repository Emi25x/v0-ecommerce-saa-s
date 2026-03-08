import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeEan } from "@/lib/ean-utils"
import Papa from "papaparse"

export const maxDuration = 300 // 5 minutos

// Vercel Cron invoca con GET — delegar a POST
export async function GET(request: NextRequest) {
  const isCron = request.headers.get("x-vercel-cron") === "1"
  console.log(`[AZETA-STOCK] GET - ${isCron ? "cron" : "manual"}`)
  return POST(request)
}

export async function POST(_request: NextRequest) {
  // Usa service role para saltear RLS y funcionar tanto desde cron como desde UI
  const supabase = createAdminClient()
  const startTime = Date.now()

  console.log("[AZETA-STOCK] Starting bulk stock update")

  try {
    // Obtener credenciales de AZETA
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .eq("name", "AZETA")
      .eq("is_active", true)
      .single()

    if (!source) {
      return NextResponse.json({ error: "AZETA source not configured or inactive" }, { status: 400 })
    }

    const credentials = source.credentials as { username: string; password: string }
    if (!credentials?.username || !credentials?.password) {
      return NextResponse.json({ error: "AZETA credentials missing" }, { status: 400 })
    }

    // Descargar stock CSV de AZETA
    const stockUrl = "https://www.azeta.es/stock_xml_ext/emi/stock.csv"
    console.log("[AZETA-STOCK] Fetching from:", stockUrl)

    const response = await fetch(stockUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} fetching AZETA stock CSV`)
    }

    const csvText = await response.text()

    // Parsear con PapaParse (autodetecta delimiter)
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    })
    const rows = parsed.data as any[]
    console.log(`[AZETA-STOCK] Parsed ${rows.length} rows, headers: ${Object.keys(rows[0] || {}).slice(0, 6).join(", ")}`)

    if (rows.length === 0) throw new Error("CSV vacío o sin datos")

    // Construir mapa EAN → {stock, price}
    const eanMap = new Map<string, { stock: number; price: number | null }>()

    for (const row of rows) {
      const eanRaw = row["ean"] || row["isbn"] || row["EAN"] || row["ISBN"]
      const ean = normalizeEan(String(eanRaw || ""))
      if (!ean || ean.length !== 13) continue

      const stockRaw = row["stock"] || row["STOCK"] || "0"
      const priceRaw = row["precio"] || row["PRECIO"] || null

      const stock = parseInt(String(stockRaw).replace(/\D/g, ""), 10) || 0
      const price = priceRaw ? parseFloat(String(priceRaw).replace(",", ".")) || null : null

      eanMap.set(ean, { stock, price })
    }

    console.log(`[AZETA-STOCK] ${eanMap.size} unique EANs`)

    // Batch read-modify-write para preservar el JSONB stock_by_source de otros proveedores
    // y hacer las actualizaciones en lotes (evita timeout por N+1 individual updates)
    const allEans = Array.from(eanMap.keys())
    const BATCH_SIZE = 1000
    let totalUpdated = 0
    let totalNotFound = 0

    for (let i = 0; i < allEans.length; i += BATCH_SIZE) {
      const batchEans = allEans.slice(i, i + BATCH_SIZE)

      // Leer productos existentes con su stock_by_source actual
      const { data: existing } = await supabase
        .from("products")
        .select("id, ean, stock_by_source, cost_price")
        .in("ean", batchEans)

      if (!existing || existing.length === 0) {
        totalNotFound += batchEans.length
        continue
      }

      // Construir updates: merge azeta dentro del JSONB existente
      const updates = existing.map((p: any) => {
        const { stock, price } = eanMap.get(p.ean)!
        // Merge: preserva claves de otros proveedores (arnoia, etc.)
        const mergedSource = { ...(p.stock_by_source || {}), azeta: stock }
        const update: any = { id: p.id, stock_by_source: mergedSource }
        if (price !== null) update.cost_price = price
        return update
      })

      // Upsert por id (batch update eficiente)
      const { error: upsertErr } = await supabase
        .from("products")
        .upsert(updates, { onConflict: "id" })

      if (upsertErr) {
        console.error(`[AZETA-STOCK] Batch ${i}-${i + batchEans.length} upsert error:`, upsertErr.message)
      } else {
        totalUpdated += updates.length
        totalNotFound += batchEans.length - updates.length
      }

      console.log(`[AZETA-STOCK] Batch ${i}-${i + batchEans.length}: ${updates.length} updated`)
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Actualizar estado del source
    await supabase
      .from("import_sources")
      .update({ last_run: new Date().toISOString(), last_status: "success" })
      .eq("id", source.id)

    console.log(`[AZETA-STOCK] Done: ${totalUpdated} updated, ${totalNotFound} not found, ${duration}s`)

    return NextResponse.json({
      success: true,
      stats: {
        processed: allEans.length,
        updated: totalUpdated,
        not_found: totalNotFound,
        errors: 0,
        duration_seconds: parseFloat(duration),
      },
    })
  } catch (error: any) {
    console.error("[AZETA-STOCK] Fatal error:", error.message)
    return NextResponse.json({ error: error.message || "Stock update failed" }, { status: 500 })
  }
}
