/**
 * @deprecated /api/import-azeta-total-now
 *
 * Trigger manual alternativo con lógica propia y column mapping manual.
 * NO usar — existe solo para referencia histórica.
 *
 * Rutas oficiales de reemplazo:
 *   - Cron catálogo completo → POST /api/azeta/import-catalog
 *   - Importación manual UI  → POST /api/azeta/download + POST /api/azeta/process
 */

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { normalizeEan } from "@/lib/ean-utils"

export const maxDuration = 300 // 5 minutos para catálogo grande

export async function GET() {
  console.warn(
    "[DEPRECATED] GET /api/import-azeta-total-now — " +
    "usar POST /api/azeta/import-catalog (cron) o POST /api/azeta/download + /api/azeta/process (UI)"
  )
  console.log("[v0] ==========================================")
  console.log("[v0] IMPORT AZETA TOTAL NOW - ENDPOINT CALLED")
  console.log("[v0] ==========================================")

  try {
    const supabase = await createClient()

    // Buscar la fuente Azeta Total
    const { data: sources } = await supabase
      .from("import_sources")
      .select("*")
      .ilike("name", "%azeta%total%")
      .limit(1)

    if (!sources || sources.length === 0) {
      return NextResponse.json({ error: "Fuente Azeta Total no encontrada" }, { status: 404 })
    }

    const source = sources[0]
    console.log("[v0] Fuente encontrada:", source.name)
    console.log("[v0] URL:", source.url_template)

    // Descargar CSV (puede ser ZIP, lo manejamos como texto primero)
    console.log("[v0] Descargando archivo...")
    const response = await fetch(source.url_template)
    if (!response.ok) {
      throw new Error(`Error descargando archivo: ${response.statusText}`)
    }

    const csvText = await response.text()
    const lines = csvText.split("\n").filter((l) => l.trim())
    console.log("[v0] Archivo descargado:", lines.length, "líneas")

    // HARDCODED: AZETA Total usa PIPE "|" como separador
    const separator = "|"
    console.log("[v0] Separador HARDCODED para AZETA Total:", separator)

    // Parsear headers
    const firstLine = lines[0]
    const headers = firstLine.split(separator).map((h) => h.trim().replace(/^["']|["']$/g, ""))
    console.log("[v0] Headers detectados:", headers.length)
    console.log("[v0] Primeros 10 headers:", headers.slice(0, 10).join(", "))

    // Crear historial
    const { data: history } = await supabase
      .from("import_history")
      .insert({
        source_id: source.id,
        status: "running",
        started_at: new Date().toISOString(),
        products_imported: 0,
        products_updated: 0,
        products_failed: 0,
      })
      .select()
      .single()

    let imported = 0
    let updated = 0
    let failed = 0

    // Procesar productos en batches
    const BATCH_SIZE = 100
    const products = []

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(separator).map((v) => v.trim().replace(/^["']|["']$/g, ""))

        const product: any = {}

        // Mapear columnas según column_mapping del source
        Object.entries(source.column_mapping || {}).forEach(([dbField, csvField]) => {
          const index = headers.findIndex(h => h.toLowerCase() === (csvField as string).toLowerCase())
          if (index !== -1 && values[index]) {
            const value = values[index]
            
            if (dbField === "ean" || dbField === "isbn") {
              // Normalizar EAN/ISBN
              const normalized = normalizeEan(value)
              if (normalized && normalized.length === 13) {
                product.ean = normalized
              }
            } else if (dbField === "price" || dbField === "stock" || dbField === "cost_price") {
              const num = Number.parseFloat(value.replace(/,/g, "."))
              if (!isNaN(num)) {
                product[dbField] = num
              }
            } else if (dbField === "stock_by_source") {
              // Stock por proveedor
              const stockVal = Number.parseInt(value) || 0
              product.stock_by_source = { azeta: stockVal }
            } else {
              product[dbField] = value
            }
          }
        })

        // Validar que tenga EAN
        if (!product.ean) {
          failed++
          continue
        }

        // Agregar source y timestamp
        product.source = "azeta"
        product.last_import = new Date().toISOString()

        products.push(product)

        // Procesar batch
        if (products.length >= BATCH_SIZE) {
          const { error: upsertError } = await supabase
            .from("products")
            .upsert(products, { onConflict: "ean" })

          if (upsertError) {
            console.error("[v0] Error en upsert:", upsertError.message)
            failed += products.length
          } else {
            imported += products.length
          }

          products.length = 0 // Clear batch
        }

        if (i % 1000 === 0) {
          console.log(`[v0] Progreso: ${i}/${lines.length - 1}`)
        }
      } catch (error: any) {
        console.error("[v0] Error en línea", i, ":", error.message)
        failed++
      }
    }

    // Procesar batch final
    if (products.length > 0) {
      const { error: upsertError } = await supabase
        .from("products")
        .upsert(products, { onConflict: "ean" })

      if (upsertError) {
        console.error("[v0] Error en upsert final:", upsertError.message)
        failed += products.length
      } else {
        imported += products.length
      }
    }

    // Actualizar historial
    await supabase
      .from("import_history")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        products_imported: imported,
        products_updated: updated,
        products_failed: failed,
      })
      .eq("id", history?.id)

    console.log("[v0] ==========================================")
    console.log("[v0] IMPORTACIÓN COMPLETADA")
    console.log("[v0] Importados:", imported)
    console.log("[v0] Actualizados:", updated)
    console.log("[v0] Fallidos:", failed)
    console.log("[v0] ==========================================")

    return NextResponse.json({
      success: true,
      imported,
      updated,
      failed,
      total: lines.length - 1,
    })
  } catch (error: any) {
    console.error("[v0] ERROR:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
