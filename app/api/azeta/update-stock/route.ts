import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 300

// Vercel Cron invoca con GET — delegar a POST
export async function GET(request: Request) {
  const isCron = (request as any).headers?.get?.("x-vercel-cron") === "1"
  console.log(`[CRON] azeta/update-stock GET - ${isCron ? "accepted" : "forwarded to POST"}`)
  return POST(request)
}

/**
 * POST /api/azeta/update-stock
 * Actualiza SOLO stock desde archivo AZETA stock (sin header)
 * Formato: col0=EAN (string), col1=cantidad
 * EAN NUNCA debe parsearse como número (evita notación científica)
 * Actualiza stock_by_source.azeta via bulk RPC y recalcula stock_total automáticamente
 */
export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    // Verificar CRON_SECRET
    const authHeader = (request as any).headers?.get?.("authorization") ?? ""
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader.replace("Bearer ", "") !== cronSecret) {
      // Permitir si viene de Vercel Cron
      const isCron = (request as any).headers?.get?.("x-vercel-cron") === "1"
      if (!isCron) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    console.log(`[v0][AZETA/UPDATE-STOCK] Iniciando actualización de stock AZETA...`)

    const supabase = createAdminClient()

    // 1. Obtener fuente "AZETA Stock"
    const { data: source } = await supabase
      .from("import_sources")
      .select("*")
      .ilike("name", "%azeta%stock%")
      .single()

    if (!source) {
      return NextResponse.json({ error: "Fuente AZETA Stock no encontrada" }, { status: 404 })
    }

    // 2. Descargar archivo stock
    console.log(`[v0][AZETA/UPDATE-STOCK] Descargando desde: ${source.url_template}`)
    const response = await fetch(source.url_template, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EcommerceBot/1.0)" }
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Error descargando: ${response.status} ${response.statusText}` }, { status: 500 })
    }

    // Leer como buffer y decodificar como latin1 para evitar corrupción de caracteres
    const buffer = Buffer.from(await response.arrayBuffer())
    const csvText = buffer.toString("latin1")
    const lines = csvText.split("\n").filter(l => l.trim())

    console.log(`[v0][AZETA/UPDATE-STOCK] Descargado: ${lines.length} líneas`)

    // 3. Parsear líneas (sin header: col0=EAN, col1=cantidad)
    // EAN SIEMPRE como string — nunca usar Number() o parseInt() sobre el EAN
    const validUpdates: Array<{ ean: string; stock: number }> = []
    let skipped = 0

    for (const line of lines) {
      const parts = line.trim().split(";")
      if (parts.length < 2) { skipped++; continue }

      // EAN: quitar todo lo que no sea dígito, mantener como string
      const eanRaw = parts[0].trim().replace(/\D/g, "")
      if (!eanRaw || eanRaw.length < 8 || eanRaw.length > 14) { skipped++; continue }
      const ean = eanRaw

      const qty = parseInt(parts[1].trim(), 10)
      if (isNaN(qty) || qty < 0) { skipped++; continue }

      validUpdates.push({ ean, stock: Math.min(qty, 9999) })
    }

    console.log(`[v0][AZETA/UPDATE-STOCK] Válidos: ${validUpdates.length}, omitidos: ${skipped}`)
    if (validUpdates.length > 0) {
      console.log(`[v0][AZETA/UPDATE-STOCK] Sample EAN="${validUpdates[0].ean}" stock=${validUpdates[0].stock}`)
    }

    // 4. Actualizar en bulk usando RPC (una query por batch en lugar de una por EAN)
    const BATCH = 500
    let updated = 0
    let notFound = 0

    for (let i = 0; i < validUpdates.length; i += BATCH) {
      const batch = validUpdates.slice(i, i + BATCH)
      const eans = batch.map(r => r.ean)
      const stocks = batch.map(r => r.stock)

      const { data: rpcResult, error: rpcError } = await supabase.rpc("bulk_update_azeta_stock", {
        p_eans: eans,
        p_stocks: stocks,
      })

      if (rpcError) {
        console.error(`[v0][AZETA/UPDATE-STOCK] RPC error batch ${i}:`, rpcError.message)
      } else {
        updated += rpcResult?.updated ?? 0
        notFound += rpcResult?.not_found ?? 0
      }

      if ((i + BATCH) % 5000 === 0) {
        console.log(`[v0][AZETA/UPDATE-STOCK] Progreso: ${i + BATCH}/${validUpdates.length}`)
      }
    }

    // 5. Actualizar estado del source
    await supabase
      .from("import_sources")
      .update({ last_run: new Date().toISOString(), last_status: "success" })
      .eq("id", source.id)

    const elapsed = Date.now() - startTime
    console.log(`[v0][AZETA/UPDATE-STOCK] Completado en ${elapsed}ms: ${updated} actualizados, ${notFound} no encontrados, ${skipped} omitidos`)

    return NextResponse.json({
      ok: true,
      processed: validUpdates.length,
      updated,
      not_found: notFound,
      skipped,
      elapsed_ms: elapsed,
    })

  } catch (error: any) {
    console.error("[v0][AZETA/UPDATE-STOCK] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
