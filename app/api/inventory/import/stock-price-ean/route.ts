/**
 * Importador especializado para fuentes TXT/CSV de stock+precio identificadas por EAN.
 * - Busca productos por EAN (products.ean) en lugar de SKU
 * - Escribe en stock_by_source usando el source_key de la fuente
 * - No sobreescribe stock de otras fuentes
 * - Compatible con fuentes vinculadas a una cuenta ML específica (ml_account_id)
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function detectSeparator(line: string): string {
  const counts = {
    "|":  (line.match(/\|/g)  || []).length,
    ";":  (line.match(/;/g)   || []).length,
    "\t": (line.match(/\t/g)  || []).length,
    ",":  (line.match(/,/g)   || []).length,
  }
  const max = Math.max(...Object.values(counts))
  return Object.entries(counts).find(([, v]) => v === max)![0]
}

function parseCSVLine(line: string, sep: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === sep && !inQuotes) { result.push(current.trim().replace(/^["']|["']$/g, "")); current = "" }
    else { current += ch }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ""))
  return result
}

function toNum(v: string): number | null {
  if (!v) return null
  const n = parseFloat(v.trim().replace(",", "."))
  return isNaN(n) ? null : n
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const body = await request.json()
  const { sourceId } = body as { sourceId: string }

  if (!sourceId) return NextResponse.json({ error: "sourceId requerido" }, { status: 400 })

  // ── Cargar configuración de fuente ───────────────────────────────────────
  const { data: source, error: srcErr } = await supabase
    .from("import_sources")
    .select("id, name, url_template, column_mapping, csv_separator, credentials, auth_type")
    .eq("id", sourceId)
    .single()

  if (srcErr || !source) {
    return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
  }

  // Use source.id as the stock_by_source key (unique, never clashes between sources)
  const sourceKey = source.id
  const mapping: Record<string, string> = source.column_mapping || {}

  // Necesitamos al menos la columna de EAN
  const eanColName   = mapping.ean
  const stockColName = mapping.stock
  const priceColName = mapping.price

  if (!eanColName) {
    return NextResponse.json({ error: "column_mapping debe incluir el campo 'ean'" }, { status: 400 })
  }

  // ── Descargar archivo ─────────────────────────────────────────────────────
  const fetchHeaders: Record<string, string> = {}
  if (source.auth_type === "basic_auth" && source.credentials?.username) {
    const b64 = Buffer.from(`${source.credentials.username}:${source.credentials.password}`).toString("base64")
    fetchHeaders["Authorization"] = `Basic ${b64}`
  } else if (source.auth_type === "bearer_token" && source.credentials?.token) {
    fetchHeaders["Authorization"] = `Bearer ${source.credentials.token}`
  }

  const resp = await fetch(source.url_template, { headers: fetchHeaders })
  if (!resp.ok) {
    return NextResponse.json(
      { error: `Error al descargar archivo: HTTP ${resp.status} ${resp.statusText}` },
      { status: 500 }
    )
  }

  const text  = await resp.text()
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return NextResponse.json({ error: "Archivo vacío o sin datos" }, { status: 400 })
  }

  const sep     = source.csv_separator || detectSeparator(lines[0])
  const headers = parseCSVLine(lines[0], sep)
  const data    = lines.slice(1)

  const eanIdx   = headers.indexOf(eanColName)
  const stockIdx = stockColName ? headers.indexOf(stockColName) : -1
  const priceIdx = priceColName ? headers.indexOf(priceColName) : -1

  if (eanIdx === -1) {
    return NextResponse.json(
      { error: `Columna EAN "${eanColName}" no encontrada. Columnas disponibles: ${headers.join(", ")}` },
      { status: 400 }
    )
  }

  // ── Crear registro de historial ───────────────────────────────────────────
  const { data: histRecord } = await supabase
    .from("import_history")
    .insert({ source_id: sourceId, status: "running", started_at: new Date().toISOString() })
    .select()
    .single()

  // ── Procesar filas en lotes ───────────────────────────────────────────────
  let updated = 0, notFound = 0, failed = 0
  const BATCH = 500

  // Extraer todos los EAN del archivo de una vez para hacer bulk query
  const rows: { ean: string; stock: number | null; price: number | null }[] = []
  for (const line of data) {
    const vals = parseCSVLine(line, sep)
    const ean  = vals[eanIdx]?.trim()
    if (!ean || ean.length < 8) continue
    rows.push({
      ean,
      stock: stockIdx >= 0 ? toNum(vals[stockIdx]) : null,
      price: priceIdx >= 0 ? toNum(vals[priceIdx]) : null,
    })
  }

  // Procesar en lotes para evitar timeouts
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const batchEans = batch.map(r => r.ean)

    // Buscar productos por EAN
    const { data: products } = await supabase
      .from("products")
      .select("id, ean, stock_by_source")
      .in("ean", batchEans)

    if (!products?.length) {
      notFound += batch.length
      continue
    }

    const prodByEan: Record<string, { id: string; stock_by_source: Record<string, number> }> = {}
    for (const p of products) {
      if (p.ean) prodByEan[p.ean] = { id: p.id, stock_by_source: p.stock_by_source || {} }
    }

    for (const row of batch) {
      const prod = prodByEan[row.ean]
      if (!prod) { notFound++; continue }

      const patch: Record<string, any> = {}

      if (row.stock !== null) {
        // Actualizar solo la clave de esta fuente en stock_by_source
        patch.stock_by_source = { ...prod.stock_by_source, [sourceKey]: row.stock }
      }
      if (row.price !== null) {
        patch.price = row.price
      }

      if (Object.keys(patch).length === 0) continue

      const { error: upErr } = await supabase
        .from("products")
        .update(patch)
        .eq("id", prod.id)

      if (upErr) { failed++; console.error("[stock-price-ean] update error:", upErr.message) }
      else        { updated++ }
    }
  }

  // ── Cerrar historial ──────────────────────────────────────────────────────
  if (histRecord) {
    await supabase.from("import_history").update({
      status: failed > 0 && updated === 0 ? "error" : failed > 0 ? "partial" : "success",
      products_updated:  updated,
      products_failed:   failed,
      products_imported: notFound,  // reused as "not found"
      completed_at: new Date().toISOString(),
    }).eq("id", histRecord.id)
  }

  // ── Actualizar last_import_at ─────────────────────────────────────────────
  await supabase
    .from("import_sources")
    .update({ last_import_at: new Date().toISOString() })
    .eq("id", sourceId)

  return NextResponse.json({
    success: true,
    source_key: sourceKey,
    total_rows: rows.length,
    updated,
    not_found: notFound,
    failed,
  })
}
