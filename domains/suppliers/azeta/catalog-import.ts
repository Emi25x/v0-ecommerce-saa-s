/**
 * runCatalogImport — lógica central de importación de catálogo AZETA.
 *
 * Flujo completo en un solo paso (diseñado para cron/server):
 *   1. Resuelve la URL desde import_sources (source_id | source_name | fallback "Azeta Total")
 *   2. Descarga el ZIP/CSV desde AZETA
 *   3. Extrae y parsea el CSV línea a línea con fflate (streaming, sin cargar el CSV completo)
 *   4. Upsert en tabla products en batches de 1000 DURANTE el streaming
 *      → evita acumular 600K+ productos en RAM (anterior productMap causaba OOM)
 *
 * Se llama directamente desde /api/azeta/import-catalog (cron).
 */

import { createAdminClient } from "@/lib/db/admin"
import { normalizeEan } from "@/domains/inventory/ean-utils"

// URL de fallback — solo si no está configurado en import_sources
const AZETA_TOTAL_URL = "https://www.azetadistribuciones.es/servicios_web/csv.php?user=680899&password=badajoz24"

// Headers para que el servidor de Azeta no bloquee la petición
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "*/*",
  Connection: "keep-alive",
}

// Cantidad de productos por batch de upsert (balance entre memoria y round-trips a DB)
const BATCH_SIZE = 1000

export interface CatalogImportResult {
  success: boolean
  created?: number
  updated?: number
  errors?: number
  total_rows?: number
  elapsed_seconds?: number
  error?: string
}

export type CatalogImportProgress = {
  created: number
  updated: number
  errors: number
  processed: number
  message?: string
  last_error?: string
}

export async function runCatalogImport(
  opts?: { source_id?: string; source_name?: string },
  onProgress?: (p: CatalogImportProgress) => void,
): Promise<CatalogImportResult> {
  const startTime = Date.now()
  console.log("[AZETA][RUN] === Inicio importacion catalogo ===")

  const supabase = createAdminClient()
  let url = AZETA_TOTAL_URL

  // Resolver fuente desde import_sources
  {
    let q = supabase.from("import_sources").select("url_template, name")
    if (opts?.source_id) q = (q as any).eq("id", opts.source_id)
    else if (opts?.source_name) q = (q as any).ilike("name", opts.source_name)
    else q = (q as any).ilike("name", "azeta%total%")
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
    const res = await fetch(url, { method: "GET", headers: FETCH_HEADERS })
    console.log(
      `[AZETA][FETCH] status=${res.status} content-type=${res.headers.get("content-type")} content-length=${res.headers.get("content-length")}`,
    )

    if (!res.ok) {
      const preview = await res
        .text()
        .then((t) => t.slice(0, 300))
        .catch(() => "")
      const isHtml = preview.toLowerCase().includes("<html")
      return {
        success: false,
        error: isHtml
          ? `Servidor AZETA devolvió HTML (error ${res.status}) — posible error de credenciales o sesión caducada`
          : `Error ${res.status} servidor AZETA — ${preview}`,
      }
    }

    // Leer la respuesta de forma STREAMING para evitar cargar 230MB+ en RAM
    if (!res.body) {
      return { success: false, error: "Azeta: response body is null (empty response)" }
    }

    const reader = res.body.getReader()

    // Peek primer chunk para detectar formato y verificar que no sea HTML
    const { value: firstChunk } = await reader.read()
    if (!firstChunk || firstChunk.length === 0) {
      return { success: false, error: "Azeta: respuesta vacía del servidor" }
    }

    const previewText = new TextDecoder("utf8").decode(firstChunk.slice(0, 200))
    if (previewText.toLowerCase().includes("<html") || previewText.toLowerCase().includes("<!doctype")) {
      return {
        success: false,
        error: `Servidor AZETA devolvió HTML en lugar del catálogo. Posible error de credenciales o URL incorrecta. Preview: ${previewText.slice(0, 150)}`,
      }
    }

    const isZip = firstChunk[0] === 0x50 && firstChunk[1] === 0x4b
    console.log(`[AZETA] Formato: ${isZip ? "ZIP" : "CSV"} (streaming fflate, batch-flush)`)

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

    // ── Estado del parser CSV ────────────────────────────────────────────────
    let discarded = 0
    let headerProcessed = false
    let hasHeader = false
    let delimiter = "|"
    let colIdx = {
      ean: 0,
      titulo: -1,
      autor: -1,
      editorial: -1,
      pvp: -1,
      idioma: -1,
      sinopsis: -1,
      url: -1,
      ano: -1,
      codigo: -1,
    }

    // ── Batch streaming: buffer pequeño + flush a DB durante el streaming ────
    // Esto evita el OOM que ocurría al acumular 600K+ productos en productMap.
    // Peak de RAM: solo BATCH_SIZE productos (≈1MB) en lugar de 600K (≈600MB+).
    let batchBuffer: any[] = []
    let created = 0,
      updated = 0,
      errors = 0,
      totalProcessed = 0
    let lastErrorMsg = ""

    // Columnas que SEGURO existen en la tabla products (del schema base + migraciones conocidas).
    // Si la primera inserción falla por columnas inexistentes, usamos solo estas.
    const SAFE_COLUMNS = new Set([
      "sku",
      "ean",
      "title",
      "description",
      "price",
      "stock",
      "image_url",
      "condition",
      "brand",
      "category",
      "source",
      "custom_fields",
      "stock_by_source",
      "stock_total",
      "internal_code",
    ])
    let useOnlySafeColumns = false

    function toSafeProduct(p: any): any {
      // Mover campos extra a custom_fields para no perder datos
      const safe: any = {}
      const extra: Record<string, any> = {}
      for (const [k, v] of Object.entries(p)) {
        if (SAFE_COLUMNS.has(k)) {
          safe[k] = v
        } else {
          if (v != null) extra[k] = v
        }
      }
      // Merge extra fields into custom_fields
      if (Object.keys(extra).length > 0) {
        safe.custom_fields = { ...(p.custom_fields || {}), ...extra }
      }
      return safe
    }

    async function flushBatch(): Promise<void> {
      if (batchBuffer.length === 0) return
      const batch = batchBuffer.splice(0) // tomar todos y limpiar el buffer

      // Lookup SKUs existentes para preservarlos (evita romper UNIQUE constraint en sku)
      const eans = batch.map((p: any) => p.ean)
      const eanToSku = new Map<string, string>()
      const { data: existing } = await supabase.from("products").select("ean, sku").in("ean", eans)
      ;(existing || []).forEach((r: any) => {
        if (r.ean) eanToSku.set(r.ean, r.sku)
      })

      const batchWithSku = batch.map((p: any) => {
        const isNew = !eanToSku.has(p.ean)
        const base = useOnlySafeColumns ? toSafeProduct(p) : p
        return {
          ...base,
          sku: eanToSku.get(p.ean) ?? p.ean,
          ...(isNew ? { stock_by_source: { azeta: 0 }, stock: 0 } : {}),
        }
      })

      let { error: upsertErr } = await supabase.from("products").upsert(batchWithSku, { onConflict: "ean" })

      // Si falla y no estamos en modo safe, reintentar con solo columnas seguras
      if (upsertErr && !useOnlySafeColumns) {
        console.warn(`[AZETA][UPSERT] Fallo con todas las columnas: ${upsertErr.message}`)
        console.warn(`[AZETA][UPSERT] Reintentando con solo columnas seguras (extras irán a custom_fields)...`)
        useOnlySafeColumns = true
        lastErrorMsg = `Columnas extra no existen en DB, usando custom_fields: ${upsertErr.message}`

        const safeBatch = batchWithSku.map(toSafeProduct)
        const retry = await supabase.from("products").upsert(safeBatch, { onConflict: "ean" })
        upsertErr = retry.error
      }

      if (upsertErr) {
        console.error(`[AZETA][UPSERT] error: ${upsertErr.message}`)
        lastErrorMsg = upsertErr.message
        errors += batch.length
      } else {
        for (const p of batchWithSku) {
          if (eanToSku.has(p.ean)) updated++
          else created++
        }
      }
      totalProcessed += batch.length
      if (totalProcessed % 10000 < BATCH_SIZE) {
        console.log(
          `[AZETA][PROGRESS] ${totalProcessed} procesados (creados=${created} actualizados=${updated} errores=${errors})`,
        )
      }
      // Emitir progreso al caller (SSE) — incluir último error para que la UI lo muestre
      onProgress?.({ created, updated, errors, processed: totalProcessed, last_error: lastErrorMsg || undefined })
    }

    function processLine(rawLine: string): void {
      const line = rawLine.trim()
      if (!line) return

      if (!headerProcessed) {
        // Auto-detección de delimitador a partir de la primera línea
        const pipeCount = (line.match(/\|/g) || []).length
        const semiCount = (line.match(/;/g) || []).length
        delimiter = pipeCount >= semiCount ? "|" : ";"

        const rawHeaders = line.split(delimiter).map((h) => h.trim().replace(/['"]/g, "").toLowerCase())
        const firstColNumeric = /^[0-9eE.+\-]+$/.test(rawHeaders[0])

        if (!firstColNumeric) {
          hasHeader = true
          colIdx = {
            ean: rawHeaders.findIndex((h) => ["ean", "isbn", "gtin"].includes(h)),
            titulo: rawHeaders.findIndex((h) => ["titulo", "title"].includes(h)),
            autor: rawHeaders.findIndex((h) => ["autor", "author"].includes(h)),
            editorial: rawHeaders.findIndex((h) => ["editorial", "publisher"].includes(h)),
            pvp: rawHeaders.findIndex((h) => ["pvp", "precio", "precio_sin_iva", "precio s/iva"].includes(h)),
            idioma: rawHeaders.findIndex((h) => ["idioma", "language"].includes(h)),
            sinopsis: rawHeaders.findIndex((h) => h.includes("sinopsis") || h === "descripcion"),
            url: rawHeaders.findIndex((h) => ["url", "imagen", "portada"].includes(h)),
            ano: rawHeaders.findIndex((h) => h.includes("ano_edicion") || h.includes("year")),
            codigo: rawHeaders.findIndex((h) => h === "codigo_interno"),
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
      if (!ean || ean.length !== 13) {
        discarded++
        return
      }
      const col = (ci: number) => (ci >= 0 && cols[ci] ? cols[ci].replace(/['"]/g, "").trim() || null : null)
      const priceStr = col(colIdx.pvp)
      const pvpRaw = priceStr ? parseFloat(priceStr.replace(",", ".")) || null : null
      const costPrice =
        pvpRaw != null
          ? discountRate != null
            ? Math.round(pvpRaw * (1 - discountRate) * 10000) / 10000
            : pvpRaw
          : null
      batchBuffer.push({
        sku: ean, // placeholder — reemplazado por SKU existente en flushBatch
        ean,
        title: col(colIdx.titulo),
        author: col(colIdx.autor),
        brand: col(colIdx.editorial),
        pvp_editorial: pvpRaw,
        cost_price: costPrice,
        language: col(colIdx.idioma),
        description: col(colIdx.sinopsis),
        image_url: col(colIdx.url),
        year_edition: col(colIdx.ano),
        internal_code: col(colIdx.codigo),
      })
    }

    // ── Descompresión y parseo STREAMING ────────────────────────────────────
    // fflate Unzip streaming para ZIP, TextDecoder incremental para CSV plano.
    // flushBatch() se llama tras cada chunk para mantener batchBuffer pequeño.

    const decoder = new TextDecoder("latin1")
    let lineBuffer = ""

    function processChunk(bytes: Uint8Array, final: boolean) {
      const chunk = decoder.decode(bytes, { stream: !final })
      const text = lineBuffer + chunk
      const parts = text.split(/\r?\n/)
      lineBuffer = final ? "" : (parts.pop() ?? "")
      for (const line of parts) processLine(line)
    }

    if (isZip) {
      // fflate streaming Unzip — ondata callbacks son síncronos durante push()
      const { Unzip, UnzipInflate } = await import("fflate")

      let fflateError: Error | null = null
      const unzipper = new Unzip()
      unzipper.register(UnzipInflate)
      let csvFound = false

      unzipper.onfile = (file) => {
        if (!csvFound && !file.name.endsWith("/")) {
          csvFound = true
          console.log(`[AZETA][ZIP] Streaming "${file.name}"`)
          file.ondata = (err, data, isFinal) => {
            if (err) {
              fflateError = err
              return
            }
            processChunk(data, isFinal)
          }
          file.start()
        } else {
          file.terminate()
        }
      }

      // Push primer chunk (puede disparar onfile + primeros ondata síncronamente)
      unzipper.push(firstChunk!, false)
      if (fflateError) throw fflateError

      // Pump asíncrono: lee chunks y flushea a DB entre lecturas
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          // Señalizar fin al unzipper (el CSV ya debería estar completo — fflate
          // detecta el fin de cada entrada por su tamaño comprimido almacenado)
          try {
            unzipper.push(new Uint8Array(0), true)
          } catch {}
          break
        }

        if (value) unzipper.push(value, false)
        if (fflateError) throw fflateError

        // Flush tras cada chunk decomprimido para no acumular demasiados productos
        if (batchBuffer.length >= BATCH_SIZE) {
          await flushBatch()
        }
      }

      if (!csvFound) throw new Error("No se encontró archivo CSV/TXT dentro del ZIP de Azeta")
    } else {
      // CSV sin comprimir — streaming directo
      processChunk(firstChunk!, false)
      if (batchBuffer.length >= BATCH_SIZE) await flushBatch()

      while (true) {
        const { done, value } = await reader.read()
        if (value) processChunk(value, done)
        if (batchBuffer.length >= BATCH_SIZE) await flushBatch()
        if (done) break
      }
    }

    // Flush final — productos restantes en el buffer
    await flushBatch()

    // Validación post-parseo
    if (hasHeader && colIdx.ean < 0) {
      return { success: false, error: "Columna EAN no encontrada en el CSV" }
    }

    const elapsed = (Date.now() - startTime) / 1000
    console.log(
      `[AZETA] Completado: creados=${created} actualizados=${updated} errores=${errors} descartados=${discarded} en ${elapsed.toFixed(1)}s`,
    )
    return {
      success: true,
      created,
      updated,
      errors,
      total_rows: totalProcessed,
      elapsed_seconds: parseFloat(elapsed.toFixed(1)),
    }
  } catch (err: any) {
    console.error("[AZETA][RUN] Error fatal:", err.message)
    return { success: false, error: err.message }
  }
}
