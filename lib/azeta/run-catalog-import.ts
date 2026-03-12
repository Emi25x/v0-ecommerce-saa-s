/**
 * runCatalogImport — lógica central de importación de catálogo AZETA.
 *
 * Flujo completo en un solo paso (diseñado para cron/server):
 *   1. Resuelve la URL desde import_sources (source_id | source_name | fallback "Azeta Total")
 *   2. Descarga el ZIP/CSV desde AZETA
 *   3. Extrae y parsea el CSV línea a línea con fflate (streaming, sin cargar el CSV completo)
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
  success:          boolean
  created?:         number
  updated?:         number
  errors?:          number
  total_rows?:      number
  elapsed_seconds?: number
  error?:           string
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

    // Descargar el archivo comprimido completo (230MB como Uint8Array — manejable)
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

    // ── Procesamiento línea a línea (sin construir el CSV completo en memoria) ──
    const productMap = new Map<string, any>()
    let discarded = 0

    // Estado del parser CSV (se actualiza en el primer renglón)
    let headerProcessed = false
    let hasHeader       = false
    let delimiter       = "|"
    let colIdx = {
      ean: 0, titulo: -1, autor: -1, editorial: -1,
      pvp: -1, idioma: -1, sinopsis: -1, url: -1, ano: -1, codigo: -1,
    }

    function processLine(rawLine: string): void {
      const line = rawLine.trim()
      if (!line) return

      if (!headerProcessed) {
        // Auto-detección de delimitador a partir de la primera línea
        const pipeCount = (line.match(/\|/g) || []).length
        const semiCount = (line.match(/;/g)  || []).length
        delimiter = pipeCount >= semiCount ? "|" : ";"

        const rawHeaders = line.split(delimiter).map(h => h.trim().replace(/['"]/g, "").toLowerCase())
        const firstColNumeric = /^[0-9eE.+\-]+$/.test(rawHeaders[0])

        if (!firstColNumeric) {
          hasHeader = true
          colIdx = {
            ean:       rawHeaders.findIndex(h => ["ean", "isbn", "gtin"].includes(h)),
            titulo:    rawHeaders.findIndex(h => ["titulo", "title"].includes(h)),
            autor:     rawHeaders.findIndex(h => ["autor", "author"].includes(h)),
            editorial: rawHeaders.findIndex(h => ["editorial", "publisher"].includes(h)),
            pvp:       rawHeaders.findIndex(h => ["pvp", "precio", "precio_sin_iva", "precio s/iva"].includes(h)),
            idioma:    rawHeaders.findIndex(h => ["idioma", "language"].includes(h)),
            sinopsis:  rawHeaders.findIndex(h => h.includes("sinopsis") || h === "descripcion"),
            url:       rawHeaders.findIndex(h => ["url", "imagen", "portada"].includes(h)),
            ano:       rawHeaders.findIndex(h => h.includes("ano_edicion") || h.includes("year")),
            codigo:    rawHeaders.findIndex(h => h === "codigo_interno"),
          }
        }
        headerProcessed = true
        if (hasHeader) return // saltar fila de encabezado
      }

      const cols = line.split(delimiter)
      // Para archivos sin header, colIdx.ean = 0 (primera columna)
      const eanCol = colIdx.ean >= 0 ? colIdx.ean : 0
      if (cols.length <= eanCol) return
      const ean = normalizeEan(cols[eanCol]?.replace(/['"]/g, "").trim())
      if (!ean || ean.length !== 13) { discarded++; return }
      const col = (ci: number) => ci >= 0 && cols[ci] ? cols[ci].replace(/['"]/g, "").trim() || null : null
      const priceStr  = col(colIdx.pvp)
      const pvpRaw    = priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null
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

    // ── Descompresión y parseo línea a línea ──────────────────────────────────
    if (isZip) {
      // fflate Unzip: streaming — nunca construye el CSV completo en memoria
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Unzip, UnzipInflate } = require("fflate") as typeof import("fflate")
        let foundFile  = false
        let lineBuffer = new Uint8Array(0)
        const decoder  = new TextDecoder("latin1")

        const unzipper = new Unzip()
        ;(unzipper as any).register(UnzipInflate)

        unzipper.onfile = (file: any) => {
          if (!foundFile && /\.(csv|txt)$/i.test(file.name) && !file.name.endsWith("/")) {
            foundFile = true
            console.log(`[AZETA][ZIP] Procesando entrada: ${file.name}`)

            file.ondata = (err: Error | null, data: Uint8Array, final: boolean) => {
              if (err) { reject(err); return }

              // Concatenar con buffer incompleto de la iteración anterior
              const combined = new Uint8Array(lineBuffer.length + data.length)
              combined.set(lineBuffer)
              combined.set(data, lineBuffer.length)

              // Procesar líneas completas (terminadas en \n)
              let start = 0
              for (let i = 0; i < combined.length; i++) {
                if (combined[i] === 0x0a) {
                  const slice = combined.slice(start, i)
                  // Eliminar \r si viene de CRLF
                  const lineBytes = slice.length > 0 && slice[slice.length - 1] === 0x0d
                    ? slice.slice(0, -1) : slice
                  processLine(decoder.decode(lineBytes))
                  start = i + 1
                }
              }
              lineBuffer = combined.slice(start)

              if (final) {
                if (lineBuffer.length > 0) processLine(decoder.decode(lineBuffer))
                resolve()
              }
            }

            file.start()
          } else {
            file.terminate()
          }
        }

        // Alimentar el descompresor con el buffer completo (230MB Uint8Array)
        unzipper.push(fileBuf, true)
      })
    } else {
      // CSV sin comprimir: procesar por chunks de 1MB para evitar string gigante
      const decoder  = new TextDecoder("latin1")
      const CHUNK    = 1024 * 1024
      let lineBuffer = new Uint8Array(0)
      for (let i = 0; i < fileBuf.length; i += CHUNK) {
        const piece    = fileBuf.slice(i, Math.min(i + CHUNK, fileBuf.length))
        const combined = new Uint8Array(lineBuffer.length + piece.length)
        combined.set(lineBuffer)
        combined.set(piece, lineBuffer.length)
        let start = 0
        for (let j = 0; j < combined.length; j++) {
          if (combined[j] === 0x0a) {
            const slice     = combined.slice(start, j)
            const lineBytes = slice.length > 0 && slice[slice.length - 1] === 0x0d ? slice.slice(0, -1) : slice
            processLine(decoder.decode(lineBytes))
            start = j + 1
          }
        }
        lineBuffer = combined.slice(start)
      }
      if (lineBuffer.length > 0) processLine(decoder.decode(lineBuffer))
    }

    // Validación post-parseo
    if (hasHeader && colIdx.ean < 0) {
      return { success: false, error: "Columna EAN no encontrada en el CSV" }
    }

    const products = Array.from(productMap.values())
    console.log(`[AZETA][IMPORT] validos=${products.length} descartados=${discarded}`)

    const allEans = products.map(p => p.ean)

    // Fetch existing ean→sku mapping para:
    //   1. preservar SKU existente (evita violación UNIQUE en products.sku)
    //   2. distinguir created vs updated
    const eanToSku = new Map<string, string>()
    for (let i = 0; i < allEans.length; i += 5000) {
      const { data } = await supabase.from("products").select("ean, sku").in("ean", allEans.slice(i, i + 5000))
      ;(data || []).forEach((r: any) => { if (r.ean) eanToSku.set(r.ean, r.sku) })
    }

    let created = 0, updated = 0, errors = 0
    for (let i = 0; i < products.length; i += 500) {
      const batch = products.slice(i, i + 500).map(p => ({
        ...p,
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
