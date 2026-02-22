import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeEan } from "@/lib/ean-utils"

export const maxDuration = 300

/**
 * POST /api/azeta/update-stock
 * Actualiza SOLO stock desde archivo AZETA stock (sin header)
 * Formato: EAN;Stock (ej: 9788408273264;5)
 * Actualiza stock_by_source.azeta y recalcula stock_total automáticamente
 */
export async function POST(request: Request) {
  const startTime = Date.now()
  
  try {
    // Verificar CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader.replace('Bearer ', '') !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`[v0][AZETA/STOCK] Iniciando actualización de stock AZETA...`)
    
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
    const response = await fetch(source.url_template)
    if (!response.ok) {
      return NextResponse.json({ error: `Error descargando: ${response.status}` }, { status: 500 })
    }

    const csvText = await response.text()
    const lines = csvText.split("\n").filter(l => l.trim())
    
    console.log(`[v0][AZETA/STOCK] Descargado: ${lines.length} líneas`)

    // 3. Procesar líneas (EAN;Stock, sin header)
    const updates: Array<{ ean: string, stock: number }> = []
    let skipped = 0

    for (const line of lines) {
      const parts = line.trim().split(";")
      if (parts.length !== 2) {
        skipped++
        continue
      }

      const eanRaw = parts[0].trim()
      const stockRaw = parts[1].trim()
      
      const ean = normalizeEan(eanRaw)
      const stock = parseInt(stockRaw, 10)

      if (!ean || isNaN(stock) || stock < 0) {
        skipped++
        continue
      }

      updates.push({ ean, stock })
    }

    console.log(`[v0][AZETA/STOCK] ${updates.length} válidas, ${skipped} omitidas`)

    // 4. Actualizar stock_by_source en batches
    const BATCH_SIZE = 1000
    let updated = 0
    let notFound = 0

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE)
      
      for (const { ean, stock } of batch) {
        // Obtener producto actual
        const { data: product } = await supabase
          .from("products")
          .select("stock_by_source")
          .eq("ean", ean)
          .single()

        if (!product) {
          notFound++
          continue
        }

        // Actualizar stock_by_source.azeta
        const currentStock = product.stock_by_source || {}
        const newStock = { ...currentStock, azeta: stock }

        const { error } = await supabase
          .from("products")
          .update({ stock_by_source: newStock })
          .eq("ean", ean)

        if (!error) {
          updated++
        }
      }

      console.log(`[v0][AZETA/STOCK] Progreso: ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}`)
    }

    const elapsed = Date.now() - startTime
    console.log(`[v0][AZETA/STOCK] Completado en ${elapsed}ms: ${updated} actualizados, ${notFound} no encontrados`)

    return NextResponse.json({
      ok: true,
      processed: updates.length,
      updated,
      not_found: notFound,
      skipped,
      elapsed_ms: elapsed
    })

  } catch (error: any) {
    console.error("[v0][AZETA/STOCK] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
