import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { del } from "@vercel/blob"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Column mapping Azeta Total (soporta pipe y punto y coma)
const COL_MAP: Record<string, string[]> = {
  ean:           ["ean", "isbn", "gtin"],
  title:         ["titulo", "title"],
  author:        ["autor", "author"],
  brand:         ["editorial", "publisher"],
  pvp:           ["pvp", "precio", "precio_sin_iva", "precio s/iva"],
  language:      ["idioma", "language"],
  description:   ["sinopsis", "descripcion"],
  image_url:     ["url", "imagen", "portada"],
  year_edition:  ["ano_edicion", "year"],
  internal_code: ["codigo_interno"],
}

function normalizeEan(raw: string): string {
  if (!raw) return ""
  let s = String(raw).trim().replace(/['"]/g, "")
  if (/^[0-9]+\.?[0-9]*[eE][+\-]?[0-9]+$/.test(s)) s = Math.round(Number(s)).toString()
  s = s.replace(/[^0-9]/g, "")
  if (!s) return ""
  if (s.length === 10) s = "978" + s
  return s.length <= 13 ? s.padStart(13, "0") : s
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "azeta-process-v3" })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { blob_url, byte_start = 0, header_line, cleanup = false, source_id } = body

  if (!blob_url) return NextResponse.json({ error: "blob_url requerido" }, { status: 400 })

  // Cleanup: borrar blob al terminar
  if (cleanup) {
    try { await del(blob_url) } catch {}
    return NextResponse.json({ ok: true, cleaned: true })
  }

  const startTime = Date.now()
  const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB por llamada

  // Leer discount rate desde import_sources (una sola vez por llamada, cacheado en caller)
  const supabase = createAdminClient()
  let discountRate: number | null = null
  if (source_id) {
    const { data: src } = await supabase
      .from("import_sources")
      .select("default_discount_rate")
      .eq("id", source_id)
      .maybeSingle()
    discountRate = (src as any)?.default_discount_rate ?? null
  } else {
    const { data: src } = await supabase
      .from("import_sources")
      .select("default_discount_rate")
      .ilike("name", "azeta%")
      .limit(1)
      .maybeSingle()
    discountRate = (src as any)?.default_discount_rate ?? null
  }

  try {
    // Fetch parcial con Range bytes
    const rangeEnd = byte_start + CHUNK_SIZE - 1
    console.log(`[AZETA-PROC] Range bytes=${byte_start}-${rangeEnd}`)

    const fetchRes = await fetch(blob_url, {
      headers: { Range: `bytes=${byte_start}-${rangeEnd}` },
    })

    console.log(`[AZETA-PROC] fetch status=${fetchRes.status} content-range=${fetchRes.headers.get("content-range")}`)

    if (!fetchRes.ok && fetchRes.status !== 416) {
      const errBody = await fetchRes.text().catch(() => "")
      throw new Error(`Blob no accesible (HTTP ${fetchRes.status}): ${errBody.slice(0, 120)}`)
    }
    // 416 = Range Not Satisfiable → archivo más pequeño que el range pedido → done
    if (fetchRes.status === 416) {
      return NextResponse.json({ ok: true, done: true, rows_processed: 0, created: 0, updated: 0, errors: 0, discarded: 0, elapsed_seconds: 0 })
    }

    const chunkText = await fetchRes.text()
    const contentRange = fetchRes.headers.get("content-range") || ""

    // Detectar si hay mas datos
    let totalBytes: number | null = null
    const crMatch = contentRange.match(/\/(\d+)$/)
    if (crMatch) totalBytes = parseInt(crMatch[1])
    const isLastChunk = fetchRes.status === 200 || (totalBytes !== null && rangeEnd >= totalBytes - 1)

    // Parsear lineas del chunk
    let lines = chunkText.split("\n")

    // Auto-detectar delimitador desde la primera linea disponible
    const sampleLine = lines[0] || ""
    const pipeCount = (sampleLine.match(/\|/g) || []).length
    const semiCount = (sampleLine.match(/;/g)  || []).length
    const delimiter = pipeCount >= semiCount ? "|" : ";"

    // En el primer chunk: primera linea es el header
    let headerCols: string[]
    if (byte_start === 0) {
      headerCols = lines[0].split(delimiter).map(h => h.replace(/['"]/g, "").trim().toLowerCase())
      lines = lines.slice(1) // sacar el header
    } else {
      // El header viene en el body
      if (!header_line) return NextResponse.json({ error: "header_line requerido para offset > 0" }, { status: 400 })
      headerCols = header_line.split(delimiter).map((h: string) => h.replace(/['"]/g, "").trim().toLowerCase())
      lines = lines.slice(1) // descartar primera linea (incompleta)
    }

    // La ultima linea puede estar incompleta — calcular el byte donde termina la penultima \n
    const lastNewlineIdx = chunkText.lastIndexOf("\n")
    const next_byte_start = byte_start + Buffer.byteLength(chunkText.substring(0, lastNewlineIdx + 1), "utf8")
    lines = lines.slice(0, lines.length - 1) // sacar la ultima linea (incompleta)

    console.log(`[AZETA-PROC] delimiter="${delimiter}" header=${headerCols.slice(0,5).join(",")} lineas_en_chunk=${lines.length}`)

    // Resolver indices de columnas
    const idx: Record<string, number> = {}
    for (const [field, aliases] of Object.entries(COL_MAP)) {
      idx[field] = headerCols.findIndex(h => aliases.includes(h))
    }

    // Si no tiene header reconocible, asumir primera columna = EAN (formato sin headers)
    const eanIdx = idx.ean >= 0 ? idx.ean : 0
    if (byte_start === 0 && idx.ean < 0) {
      console.warn("[AZETA-PROC] EAN no encontrado en headers, usando columna 0")
    }

    // Construir productos
    const products: any[] = []
    let discarded = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const cols = trimmed.split(delimiter)
      const rawEan = cols[eanIdx]?.replace(/['"]/g, "").trim() || ""
      const ean = normalizeEan(rawEan)
      if (!ean || ean.length !== 13) { discarded++; continue }

      const col = (ci: number) => ci >= 0 && cols[ci] ? cols[ci].replace(/['"]/g, "").trim() || null : null

      const priceStr = col(idx.pvp)
      const pvpRaw   = priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null
      const costPrice = pvpRaw != null
        ? (discountRate != null ? Math.round(pvpRaw * (1 - discountRate) * 10000) / 10000 : pvpRaw)
        : null

      products.push({
        sku: ean, ean,
        title:         col(idx.title),
        author:        col(idx.author),
        brand:         col(idx.brand),
        pvp_editorial: pvpRaw,
        cost_price:    costPrice,
        language:      col(idx.language),
        description:   col(idx.description),
        image_url:     col(idx.image_url),
        year_edition:  col(idx.year_edition),
        internal_code: col(idx.internal_code),
      })
    }

    console.log(`[AZETA-PROC] validos=${products.length} descartados=${discarded}`)

    // Pre-fetch EANs existentes para distinguir created vs updated
    const batchEans = products.map(p => p.ean)
    const eanToSku = new Map<string, string>()
    for (let i = 0; i < batchEans.length; i += 2000) {
      const { data } = await supabase.from("products").select("ean, sku").in("ean", batchEans.slice(i, i + 2000))
      ;(data || []).forEach((r: any) => { if (r.ean) eanToSku.set(r.ean, r.sku) })
    }

    let created = 0, updated = 0, errors = 0
    for (let i = 0; i < products.length; i += 2000) {
      const batch = products.slice(i, i + 2000).map(p => ({
        ...p,
        sku: eanToSku.get(p.ean) ?? p.ean,
      }))
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })
      if (error) { console.error(`[AZETA-PROC] upsert error: ${error.message}`); errors += batch.length }
      else { for (const p of batch) eanToSku.has(p.ean) ? updated++ : created++ }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[AZETA-PROC] done=${isLastChunk} created=${created} updated=${updated} en ${elapsed}s`)

    return NextResponse.json({
      ok: true,
      done: isLastChunk,
      next_byte_start: isLastChunk ? null : next_byte_start,
      header_line: headerCols.join(delimiter),
      rows_processed: products.length + discarded,
      created, updated, errors, discarded,
      elapsed_seconds: parseFloat(elapsed),
    })
  } catch (err: any) {
    console.error("[AZETA-PROC] Error fatal:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
