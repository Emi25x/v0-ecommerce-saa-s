/**
 * runAzetaStockUpdate — lógica central de actualización de stock AZETA.
 *
 * Actualiza SOLO stock_by_source.azeta via RPC bulk_update_azeta_stock.
 * NO toca stock de otros proveedores (Arnoia, etc.).
 *
 * Recibe el source object (ya cargado desde import_sources) para evitar
 * una consulta extra cuando se llama desde import-schedules.
 *
 * También se puede llamar con source=undefined y se resolverá por nombre.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export interface StockUpdateResult {
  success:      boolean
  processed?:   number
  updated?:     number
  not_found?:   number
  zeroed?:      number   // productos puestos a stock_by_source.azeta=0 por no estar en el archivo
  skipped?:     number
  elapsed_ms?:  number
  error?:       string
}

export async function runAzetaStockUpdate(
  source?: { id: string; url_template: string; name: string } | null
): Promise<StockUpdateResult> {
  const startTime = Date.now()
  const supabase  = createAdminClient()

  // Resolver fuente si no viene como parámetro
  let src = source
  if (!src) {
    const { data } = await supabase
      .from("import_sources")
      .select("id, url_template, name")
      .ilike("name", "%azeta%stock%")
      .single()
    src = data as typeof src
  }

  if (!src?.url_template) {
    return { success: false, error: "Fuente Azeta Stock no encontrada en import_sources" }
  }

  console.log(`[AZETA][STOCK] Descargando desde: ${src.url_template}`)
  const response = await fetch(src.url_template, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; EcommerceBot/1.0)" },
  })

  if (!response.ok) {
    return { success: false, error: `Error descargando: ${response.status} ${response.statusText}` }
  }

  const buffer  = Buffer.from(await response.arrayBuffer())
  const csvText = buffer.toString("latin1")
  const lines   = csvText.split("\n").filter(l => l.trim())
  console.log(`[AZETA][STOCK] Descargado: ${lines.length} líneas`)

  // Parsear (sin header: col0=EAN, col1=cantidad)
  // EAN siempre como string — nunca Number() para evitar notación científica
  const validUpdates: Array<{ ean: string; stock: number }> = []
  let skipped = 0

  for (const line of lines) {
    const parts = line.trim().split(";")
    if (parts.length < 2) { skipped++; continue }

    const eanRaw = parts[0].trim().replace(/\D/g, "")
    if (!eanRaw || eanRaw.length < 8 || eanRaw.length > 14) { skipped++; continue }

    const qty = parseInt(parts[1].trim(), 10)
    if (isNaN(qty) || qty < 0) { skipped++; continue }

    validUpdates.push({ ean: eanRaw, stock: Math.min(qty, 9999) })
  }

  console.log(`[AZETA][STOCK] Válidos: ${validUpdates.length}, omitidos: ${skipped}`)

  // Actualizar en bulk (preserva stock de otros proveedores)
  const BATCH = 500
  let updated  = 0
  let notFound = 0

  for (let i = 0; i < validUpdates.length; i += BATCH) {
    const batch = validUpdates.slice(i, i + BATCH)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("bulk_update_azeta_stock", {
      p_eans:   batch.map(r => r.ean),
      p_stocks: batch.map(r => r.stock),
    })
    if (rpcError) {
      console.error(`[AZETA][STOCK] RPC error batch ${i}:`, rpcError.message)
    } else {
      updated  += rpcResult?.updated  ?? 0
      notFound += rpcResult?.not_found ?? 0
    }
    if ((i + BATCH) % 5000 === 0) console.log(`[AZETA][STOCK] Progreso: ${i + BATCH}/${validUpdates.length}`)
  }

  // Poner stock_by_source.azeta = 0 en productos que NO están en el archivo
  // (productos que Azeta ya no tiene disponibles en este run)
  // Solo afecta el campo "azeta" del JSONB — preserva arnoia y otros proveedores
  let zeroed = 0
  const allEans = validUpdates.map(u => u.ean)
  const { data: zeroResult, error: zeroError } = await supabase.rpc(
    "zero_azeta_stock_not_in_list",
    { p_eans: allEans }
  )
  if (zeroError) {
    console.error(`[AZETA][STOCK] Error zeroing: ${zeroError.message}`)
  } else {
    zeroed = zeroResult?.zeroed ?? 0
    console.log(`[AZETA][STOCK] Puestos a 0: ${zeroed} productos no presentes en el archivo`)
  }

  // Actualizar estado del source en DB
  await supabase
    .from("import_sources")
    .update({ last_run: new Date().toISOString(), last_status: "success" })
    .eq("id", src.id)

  const elapsed = Date.now() - startTime
  console.log(`[AZETA][STOCK] Completado en ${elapsed}ms: ${updated} actualizados, ${notFound} no encontrados, ${zeroed} puestos a 0`)

  return {
    success:    true,
    processed:  validUpdates.length,
    updated,
    not_found:  notFound,
    zeroed,
    skipped,
    elapsed_ms: elapsed,
  }
}
