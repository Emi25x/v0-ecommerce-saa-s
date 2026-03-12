/**
 * runCatalogImport — lógica central de importación de catálogo AZETA.
 *
 * Flujo completo en un solo paso (diseñado para cron/server):
 *   1. Resuelve la URL desde import_sources (source_id | source_name | fallback "Azeta Total")
 *   2. Descarga el ZIP/CSV desde AZETA
 *   3. Extrae y parsea el CSV (delimiter auto-detectado)
 *   4. Upsert en tabla products (batches de 500)
 *
 * Se llama directamente desde /api/azeta/import-catalog (cron).
 * /api/azeta/run queda como wrapper @deprecated que también llama esta función.
 *
 * Para importaciones desde la UI (resumables con progreso) usar:
 *   POST /api/azeta/download  → obtiene blob_url
 *   POST /api/azeta/process   → procesa en chunks
 */

import { createAdminClient } from "@/lib/supabase/admin"

// URL de fallback — solo si no está configurado en import_sources
const AZETA_TOTAL_URL =
  "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

export interface CatalogImportResult {
  success:         boolean
  created?:        number
  updated?:        number
  errors?:         number
  total_rows?:     number
  elapsed_seconds?: number
  error?:          string
}

export async function runCatalogImport(opts?: {
  source_id?:   string
  source_name?: string
}): Promise<CatalogImportResult> {
  const startTime = Date.now()
  console.log("[AZETA][RUN] === Inicio importacion catalogo ===")

  function normalizeEan(raw: string): string {
    if (!raw) return ""
    let s = String(raw).trim()
    if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(s)) s = Number(s).toFixed(0)
    s = s.replace(/[^0-9]/g, "")
    if (!s) return ""
    if (s.length === 10) s = "978" + s
    return s.padStart(13, "0")
  }

  async function extractCSVFromZip(buf: Uint8Array): Promise<string> {
    let off = 0
    while (off < buf.length - 30) {
      if (
        buf[off] === 0x50 && buf[off + 1] === 0x4b &&
        buf[off + 2] === 0x03 && buf[off + 3] === 0x04
      ) {
        const method          = buf[off + 8]  | (buf[off + 9]  << 8)
        const compressedSize  = (buf[off + 18] | (buf[off + 19] << 8) | (buf[off + 20] << 16) | (buf[off + 21] << 24)) >>> 0
        const fileNameLen     = buf[off + 26] | (buf[off + 27] << 8)
        const extraLen        = buf[off + 28] | (buf[off + 29] << 8)
        const fileName        = new TextDecoder().decode(buf.subarray(off + 30, off + 30 + fileNameLen))
        console.log(`[AZETA][ZIP] entry="${fileName}" method=${method} size=${compressedSize}`)

        if (/\.(csv|txt)$/i.test(fileName)) {
          const dataStart  = off + 30 + fileNameLen + extraLen
          const compressed = buf.subarray(dataStart, dataStart + compressedSize)
          let decompressed: Uint8Array
          if (method === 0) {
            decompressed = compressed
          } else if (method === 8) {
            const { inflateRawSync } = await import("zlib")
            decompressed = inflateRawSync(Buffer.from(compressed))
          } else {
            throw new Error(`ZIP method ${method} not supported`)
          }
          return new TextDecoder("latin1").decode(decompressed)
        }
        off += 30 + fileNameLen + extraLen + compressedSize
        continue
      }
      off++
    }
    throw new Error("No se encontro CSV/TXT en el ZIP")
  }

  const supabase = createAdminClient()
  let url = AZETA_TOTAL_URL

  // Resolver fuente desde import_sources
  {
    let q = supabase.from("import_sources").select("url_template, name")
    if (opts?.source_id)        q = (q as any).eq("id", opts.source_id)
    else if (opts?.source_name) q = (q as any).ilike("name", opts.source_name)
    else                        q = (q as any).ilike("name", "azeta%total%")
    const { data: src } = await (q as any).limit(1).maybeSingle()
    if (src?.url_template) {
      url = src.url_template
      console.log(`[AZETA][RUN] Fuente: "${src.name}" → ${url}`)
    } else {
      console.warn("[AZETA][RUN] Fuente no encontrada en import_sources, usando URL hardcodeada")
    }
  }

  try {
    console.log(`[AZETA][FETCH] GET ${url}`)
    const res = await fetch(url, { method: "GET" })
    console.log(`[AZETA][FETCH] status=${res.status} content-type=${res.headers.get("content-type")}`)

    if (!res.ok) {
      const preview = await res.text().then(t => t.slice(0, 200)).catch(() => "")
      return { success: false, error: `Error ${res.status} servidor AZETA — ${preview}` }
    }

    const chunks: Uint8Array[] = []
    const reader = res.body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const fileBuf  = new Uint8Array(totalLen)
    let pos = 0
    for (const c of chunks) { fileBuf.set(c, pos); pos += c.length }
    console.log(`[AZETA] Descargado: ${(fileBuf.length / 1024 / 1024).toFixed(1)}MB en ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

    const isZip = fileBuf[0] === 0x50 && fileBuf[1] === 0x4b
    console.log(`[AZETA] Formato: ${isZip ? "ZIP" : "CSV"}`)

    let csvText: string
    if (isZip) {
      csvText = await extractCSVFromZip(fileBuf)
    } else {
      csvText = new TextDecoder("latin1").decode(fileBuf)
    }
    console.log(`[AZETA] CSV: ${(csvText.length / 1024 / 1024).toFixed(1)}MB`)

    const firstLine = csvText.substring(0, csvText.indexOf("\n")).trim()
    const pipeCount = (firstLine.match(/\|/g) || []).length
    const semiCount = (firstLine.match(/;/g)  || []).length
    const delimiter = pipeCount >= semiCount ? "|" : ";"
    const rawHeaders = firstLine.split(delimiter).map(h => h.trim().replace(/['"]/g, "").toLowerCase())
    console.log(`[AZETA][CSV] delimiter="${delimiter}" headers=${rawHeaders.slice(0, 10).join(",")}`)

    const firstColNumeric = /^[0-9eE.+\-]+$/.test(rawHeaders[0])
    const headers  = firstColNumeric ? [] : rawHeaders
    const hasHeader = headers.length > 0

    const colIdx = {
      ean:       hasHeader ? headers.findIndex(h => ["ean", "isbn", "gtin"].includes(h)) : 0,
      titulo:    hasHeader ? headers.findIndex(h => ["titulo", "title"].includes(h)) : -1,
      autor:     hasHeader ? headers.findIndex(h => ["autor", "author"].includes(h)) : -1,
      editorial: hasHeader ? headers.findIndex(h => ["editorial", "publisher"].includes(h)) : -1,
      pvp:       hasHeader ? headers.findIndex(h => ["pvp", "precio", "precio_sin_iva", "precio s/iva"].includes(h)) : -1,
      idioma:    hasHeader ? headers.findIndex(h => ["idioma", "language"].includes(h)) : -1,
      sinopsis:  hasHeader ? headers.findIndex(h => h.includes("sinopsis") || h === "descripcion") : -1,
      url:       hasHeader ? headers.findIndex(h => ["url", "imagen", "portada"].includes(h)) : -1,
      ano:       hasHeader ? headers.findIndex(h => h.includes("ano_edicion") || h.includes("year")) : -1,
      codigo:    hasHeader ? headers.findIndex(h => h === "codigo_interno") : -1,
    }

    if (colIdx.ean < 0) {
      return { success: false, error: `Columna EAN no encontrada. Headers: ${headers.slice(0, 10).join(",")}` }
    }

    // Leer discount rate desde import_sources
    const { data: azetaSource } = await supabase
      .from("import_sources")
      .select("default_discount_rate")
      .ilike("name", "azeta%")
      .limit(1)
      .maybeSingle()
    const discountRate: number = (azetaSource as any)?.default_discount_rate ?? null
    if (discountRate === null) {
      console.warn("[AZETA][RUN] default_discount_rate no configurado — cost_price = PVP (sin descuento)")
    } else {
      console.log(`[AZETA][RUN] discount_rate=${discountRate} → cost_price = PVP * ${(1 - discountRate).toFixed(4)}`)
    }

    const lines = csvText.split("\n")
    const productMap = new Map<string, any>()
    let discarded = 0

    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = line.split(delimiter)
      if (cols.length <= colIdx.ean) continue
      const ean = normalizeEan(cols[colIdx.ean]?.replace(/['"]/g, "").trim())
      if (!ean || ean.length !== 13) { discarded++; continue }
      const col = (ci: number) => ci >= 0 && cols[ci] ? cols[ci].replace(/['"]/g, "").trim() || null : null
      const priceStr = col(colIdx.pvp)
      const pvpRaw   = priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null
      const costPrice = pvpRaw != null
        ? (discountRate != null ? Math.round(pvpRaw * (1 - discountRate) * 10000) / 10000 : pvpRaw)
        : null
      productMap.set(ean, {
        sku: ean, ean,
        title:         col(colIdx.titulo),
        author:        col(colIdx.autor),
        brand:         col(colIdx.editorial),
        pvp_editorial: pvpRaw,
        cost_price:    costPrice,
        language:      col(colIdx.idioma),
        description:   col(colIdx.sinopsis),
        image_url:     col(colIdx.url),
        year_edition:  col(colIdx.ano),
        internal_code: col(colIdx.codigo),
      })
    }

    const products = Array.from(productMap.values())
    console.log(`[AZETA][IMPORT] validos=${products.length} descartados=${discarded}`)

    const allEans = products.map(p => p.ean)

    // Fetch existing ean→sku mapping in chunks so we can:
    //   1. preserve existing SKUs (avoids UNIQUE constraint violations on products.sku)
    //   2. distinguish created vs updated rows
    const eanToSku = new Map<string, string>()
    for (let i = 0; i < allEans.length; i += 5000) {
      const { data } = await supabase.from("products").select("ean, sku").in("ean", allEans.slice(i, i + 5000))
      ;(data || []).forEach((r: any) => { if (r.ean) eanToSku.set(r.ean, r.sku) })
    }

    let created = 0, updated = 0, errors = 0
    for (let i = 0; i < products.length; i += 500) {
      const batch = products.slice(i, i + 500).map(p => ({
        ...p,
        // Use existing SKU to avoid UNIQUE violation; fall back to EAN for new products
        sku: eanToSku.get(p.ean) ?? p.ean,
      }))
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "ean" })
      if (error) { console.error(`[AZETA][UPSERT] error: ${error.message}`); errors += batch.length }
      else { for (const p of batch) eanToSku.has(p.ean) ? updated++ : created++ }
      if (i % 10000 === 0) console.log(`[AZETA][UPSERT] ${i + batch.length}/${products.length}`)
    }

    const elapsed = ((Date.now() - startTime) / 1000)
    console.log(`[AZETA] Completado: creados=${created} actualizados=${updated} errores=${errors} en ${elapsed.toFixed(1)}s`)
    return { success: true, created, updated, errors, total_rows: products.length, elapsed_seconds: parseFloat(elapsed.toFixed(1)) }

  } catch (err: any) {
    console.error("[AZETA][RUN] Error fatal:", err.message)
    return { success: false, error: err.message }
  }
}
