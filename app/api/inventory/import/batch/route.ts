import { type NextRequest, NextResponse } from "next/server"
import { requireCron } from "@/lib/auth/require-auth"
import { createClient } from "@/lib/db/server"
import Papa from "papaparse"
import { fetchWithAuth } from "@/lib/http/fetch-with-auth"
import { normalizeEan } from "@/domains/inventory/ean-utils"
import { normalizeHeader, detectDelimiter } from "@/lib/import/csv-helpers"
import { inflateRawSync } from "node:zlib"
import { startRun } from "@/lib/process-runs"
import { BatchImportSchema } from "@/lib/validation/schemas"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const maxDuration = 300

const BATCH_SIZE_INITIAL = 500
const BATCH_SIZE_MIN = 50
const BATCH_SIZE_MAX = 1000
const UPSERT_CHUNK = 100 // filas por upsert call dentro de cada batch

function isTimeoutError(msg: string): boolean {
  return (
    msg.toLowerCase().includes("statement timeout") ||
    msg.toLowerCase().includes("canceling statement") ||
    msg.toLowerCase().includes("query_timeout")
  )
}

export async function POST(request: NextRequest) {
  const auth = await requireCron(request)
  if (auth.error) return auth.response
  const startTime = Date.now()
  const log = createStructuredLogger({ request_id: genRequestId() })

  try {
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "bad_request", detail: "Invalid JSON body" } },
        { status: 400 },
      )
    }

    const validated = BatchImportSchema.safeParse(rawBody)
    if (!validated.success) {
      log.warn("Validation failed", "batch.validate", { issues_count: validated.error.issues.length })
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", detail: validated.error.issues } },
        { status: 422 },
      )
    }

    const { sourceId, offset, mode, historyId, batch_size } = validated.data
    const effectiveBatchSize = batch_size

    const supabase = await createClient()

    // Open a process_runs record on the first batch; resume existing run on subsequent batches
    let run: Awaited<ReturnType<typeof startRun>> | null = null
    if (offset === 0) {
      run = await startRun(supabase, "batch_import", `Batch Import`)
    }

    // 1. Obtener source
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 })
    }

    // 2. Descargar CSV completo
    const fileResponse = await fetchWithAuth({
      url_template: source.url_template,
      auth_type: source.auth_type,
      credentials: source.credentials,
    })

    if (!fileResponse.ok) {
      return NextResponse.json(
        {
          error: `Error ${fileResponse.status}: ${fileResponse.statusText}`,
        },
        { status: fileResponse.status },
      )
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer())
    const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b

    let csvText: string = ""

    if (isZip) {
      let offset_zip = 0
      let found = false
      while (offset_zip < fileBuffer.length - 30 && !found) {
        if (fileBuffer.readUInt32LE(offset_zip) === 0x04034b50) {
          const compressionMethod = fileBuffer.readUInt16LE(offset_zip + 8)
          const compressedSize = fileBuffer.readUInt32LE(offset_zip + 18)
          const fileNameLength = fileBuffer.readUInt16LE(offset_zip + 26)
          const extraFieldLength = fileBuffer.readUInt16LE(offset_zip + 28)
          const fileName = fileBuffer.toString("utf-8", offset_zip + 30, offset_zip + 30 + fileNameLength)
          if (fileName.toLowerCase().endsWith(".csv")) {
            const dataStart = offset_zip + 30 + fileNameLength + extraFieldLength
            const compressedData = fileBuffer.subarray(dataStart, dataStart + compressedSize)
            const raw = compressionMethod === 8 ? inflateRawSync(compressedData) : compressedData
            const chunks: string[] = []
            for (let i = 0; i < raw.length; i += 50 * 1024 * 1024) {
              chunks.push(raw.subarray(i, i + 50 * 1024 * 1024).toString("latin1"))
            }
            csvText = chunks.join("")
            found = true
          }
        }
        offset_zip++
      }
      if (!found) throw new Error("No CSV file found in ZIP")
    } else {
      csvText = fileBuffer.toString("utf-8")
    }

    // 3. Auto-detect delimiter
    let delimiter = source.delimiter || ""
    if (!delimiter) {
      delimiter = detectDelimiter(csvText.split("\n")[0] || "")
    }

    // 4. Parse CSV
    const parsed = Papa.parse(csvText, {
      delimiter,
      header: true,
      skipEmptyLines: true,
    })

    const headers = parsed.meta.fields || []
    const headersNormalized = headers.map(normalizeHeader)
    const headerMap = new Map<string, string>()
    headers.forEach((orig, idx) => {
      headerMap.set(orig, headersNormalized[idx])
    })

    const allRows = (parsed.data as Array<Record<string, any>>).map((row) => {
      const normalized: Record<string, string> = {}
      Object.entries(row).forEach(([key, value]) => {
        normalized[headerMap.get(key) || normalizeHeader(key)] = value as string
      })
      return normalized
    })

    const totalRows = allRows.length
    const batchRows = allRows.slice(offset, offset + effectiveBatchSize)
    const rows_seen = batchRows.length
    const done = rows_seen === 0 || offset + rows_seen >= totalRows

    if (offset === 0) {
      log.info("Batch import started", "batch.start", {
        source_name: source.name,
        delimiter,
        total_rows: totalRows,
        batch_size: effectiveBatchSize,
        headers_sample: headersNormalized.slice(0, 10),
      })
    }

    // 5. Mapear productos
    const productsToInsert: Record<string, any>[] = []
    let missing_ean = 0
    let invalid_ean = 0

    const isStockImport = source.name.toLowerCase().includes("stock") || source.feed_type === "stock_price"
    // Libral Argentina is a stock-only source — it must never create new products.
    // Products should already exist from Arnoia/Azeta catalog imports.
    const isStockOnlySource = isStockImport || source.feed_type === "api" || source.name.toLowerCase().includes("libral")

    // column_mapping values may be original-case column names; normalize them for lookup
    const cm: Record<string, string> = {}
    if (source.column_mapping && typeof source.column_mapping === "object") {
      for (const [field, colName] of Object.entries(source.column_mapping as Record<string, unknown>)) {
        if (typeof colName === "string" && colName.trim()) {
          cm[field] = normalizeHeader(colName)
        }
      }
    }

    // Helper: use column_mapping first, then heuristic fallbacks
    const col = (field: string, ...fallbacks: string[]): string | null => {
      const mappedKey = cm[field]
      if (mappedKey) return mappedKey
      for (const f of fallbacks) if (f) return f
      return null
    }

    // Detect if this source provides two separate price columns (EUR + ARS)
    // Triggered when column_mapping has "price_ars" key,
    // or when the CSV contains the known Libral Argentina column.
    const hasTwoPrices = !!cm["price_ars"] || headersNormalized.includes("pesos_argentinos")

    for (const row of batchRows) {
      const eanRaw = row[col("ean", "ean") ?? "ean"] || row["ean13"] || row["gtin"] || row["codigo_de_barras"]
      const isbnRaw = row[col("isbn", "isbn") ?? "isbn"] || row["isbn13"]
      const ean = normalizeEan(eanRaw || isbnRaw)

      if (!ean) {
        missing_ean++
        continue
      }
      if (ean.length !== 13) {
        invalid_ean++
        continue
      }

      const stockKey = col("stock", "stock", "cantidad")
      const stockRaw = (stockKey ? row[stockKey] : null) || row["stock"] || row["cantidad"] || null
      const stock = stockRaw !== null ? parseInt(String(stockRaw).replace(/\D/g, ""), 10) || 0 : null

      // precio_euros     → price     (PVP EUR, precio base del sistema)
      // pesos_argentinos → price_ars (PVP ARS, se guarda en custom_fields.precio_ars del almacén)
      let cost_price: number | null = null
      let price: number | null = null
      let price_ars: number | null = null
      if (hasTwoPrices) {
        const eurKey = cm["price"] || "precio_euros"
        const arsKey = cm["price_ars"] || "pesos_argentinos"
        const eurRaw = row[eurKey] ?? null
        const arsRaw = row[arsKey] ?? null
        price = eurRaw
          ? parseFloat(
              String(eurRaw)
                .replace(",", ".")
                .replace(/[^\d.]/g, ""),
            ) || null
          : null
        price_ars = arsRaw
          ? parseFloat(
              String(arsRaw)
                .replace(",", ".")
                .replace(/[^\d.]/g, ""),
            ) || null
          : null
      } else {
        const priceKey = col("price", "pvp", "precio_sin_iva", "precio", "price")
        const priceRaw =
          (priceKey ? row[priceKey] : null) ||
          row["pvp"] ||
          row["precio_sin_iva"] ||
          row["precio"] ||
          row["price"] ||
          null
        cost_price = priceRaw
          ? parseFloat(
              String(priceRaw)
                .replace(",", ".")
                .replace(/[^\d.]/g, ""),
            ) || null
          : null
      }

      const descKey = cm["description"] || Object.keys(row).find((k) => k.includes("sinopsis"))
      const yearKey =
        cm["year_edition"] || Object.keys(row).find((k) => k.includes("ano_edicion") || k.includes("ano_edici"))

      const titleKey = col("title", "titulo", "title", "articulo")
      const authorKey = col("author", "autor", "author", "autores")
      const imageKey = col("image_url", "url", "portada", "imagen", "image", "url_fotografia")
      const categoryKey = col("category", "categoria", "category", "tematica")

      productsToInsert.push({
        ean,
        isbn: isbnRaw || null,
        title: (titleKey ? row[titleKey] : null) || row["titulo"] || row["title"] || row["articulo"] || null,
        author: (authorKey ? row[authorKey] : null) || row["autor"] || row["author"] || row["autores"] || null,
        cost_price,
        price,
        price_ars,
        image_url:
          (imageKey ? row[imageKey] : null) ||
          row["url"] ||
          row["portada"] ||
          row["imagen"] ||
          row["image"] ||
          row["url_fotografia"] ||
          null,
        stock,
        brand: row[cm["brand"] ?? ""] || row["editorial"] || row["marca"] || row["brand"] || null,
        category:
          (categoryKey ? row[categoryKey] : null) || row["categoria"] || row["category"] || row["tematica"] || null,
        description: (descKey ? row[descKey] : null) || row["descripcion"] || row["description"] || null,
        language: row[cm["language"] ?? ""] || row["idioma"] || row["language"] || null,
        year_edition: (yearKey ? row[yearKey] : null) || row["year_edition"] || null,
        internal_code: row[cm["internal_code"] ?? ""] || row["codigo_interno"] || row["internal_code"] || null,
      })
    }

    const rows_processed = productsToInsert.length

    // 6. Upsert / update con retry y contadores correctos
    let created = 0
    let updated = 0
    let failed_rows = 0
    let timeout_count = 0
    let last_error: string | null = null
    let last_reason: string | null = null

    if (productsToInsert.length > 0) {
      // Deduplicar por EAN (último gana)
      const dedupMap = new Map<string, any>()
      for (const p of productsToInsert) dedupMap.set(p.ean, p)
      const deduped = Array.from(dedupMap.values())

      if (isStockImport || hasTwoPrices) {
        // Stock / dos-precios: usar RPC bulk con retry
        const STOCK_CHUNK = 200
        for (let i = 0; i < deduped.length; i += STOCK_CHUNK) {
          const chunk = deduped.slice(i, i + STOCK_CHUNK)
          const eans = chunk.map((p) => String(p.ean))
          const stocks = chunk.map((p) => {
            const n = parseInt(String(p.stock ?? 0), 10)
            return isNaN(n) ? 0 : n
          })
          const costPrices = chunk.map((p) => {
            if (p.cost_price === null || p.cost_price === undefined) return null
            const n = parseFloat(String(p.cost_price).replace(",", "."))
            return isNaN(n) ? null : n
          })

          let retryCount = 0
          let chunkDone = false
          while (!chunkDone && retryCount <= 2) {
            let rpcError: any = null
            let rpcData: any = null

            if (hasTwoPrices) {
              // PVP EUR → price, PVP ARS → custom_fields.precio_ars
              const eurPrices = chunk.map((p) => {
                if (p.price === null || p.price === undefined) return null
                const n = parseFloat(String(p.price).replace(",", "."))
                return isNaN(n) ? null : n
              })
              const arsPrices = chunk.map((p) => {
                if (p.price_ars === null || p.price_ars === undefined) return null
                const n = parseFloat(String(p.price_ars).replace(",", "."))
                return isNaN(n) ? null : n
              })
              const twoPriceSourceKey = (source as any).source_key || source.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") || "libral_argentina"
              const res = await supabase.rpc("bulk_update_stock_two_prices", {
                p_eans: eans,
                p_stocks: stocks,
                p_prices: eurPrices,
                p_prices_ars: arsPrices,
                p_source_key: twoPriceSourceKey,
              })
              rpcError = res.error
              rpcData = res.data
            } else {
              const stockKey = (source as any).source_key || source.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") || ""
              const res = await supabase.rpc("bulk_update_stock_price", {
                p_eans: eans,
                p_stocks: stocks,
                p_prices: costPrices,
                p_source_key: stockKey || undefined,
              })
              rpcError = res.error
              rpcData = res.data
            }

            if (rpcError) {
              if (isTimeoutError(rpcError.message) && retryCount < 2) {
                timeout_count++
                retryCount++
                log.warn("Stock chunk timeout, retrying", "batch.stock_rpc", { retry: retryCount })
                await new Promise((r) => setTimeout(r, 1000 * retryCount))
                continue
              }
              last_error = rpcError.message
              last_reason = isTimeoutError(rpcError.message) ? "statement_timeout" : "update_failed"
              failed_rows += chunk.length
              chunkDone = true
            } else {
              updated += typeof rpcData === "number" ? rpcData : (rpcData ?? 0)
              chunkDone = true
            }
          }
        }
      } else {
        // Catálogo: upsert con select previo para separar created/updated
        const eans = deduped.map((p) => p.ean)
        const { data: existingRows } = await supabase.from("products").select("ean, sku").in("ean", eans)
        const eanToSku = new Map<string, string>()
        existingRows?.forEach((r: any) => eanToSku.set(r.ean, r.sku))

        // Stock-only sources (e.g. Libral Argentina) must NOT create new products.
        // Filter to only existing EANs and log skipped ones.
        let skippedNotFound = 0
        const effectiveDeduped = isStockOnlySource
          ? deduped.filter((p) => {
              if (eanToSku.has(p.ean)) return true
              skippedNotFound++
              return false
            })
          : deduped
        if (skippedNotFound > 0) {
          log.info(`Stock-only source: skipped ${skippedNotFound} EANs not in catalog`, "batch.skip_stock_only", {
            skipped: skippedNotFound,
            source_name: source.name,
          })
        }

        const toUpsert = effectiveDeduped.map((p) => {
          // Strip price_ars — not a products column (goes to custom_fields via two-prices RPC path)
          const { price_ars, ...rest } = p
          const custom_fields =
            price_ars != null
              ? { ...(rest.custom_fields ?? {}), precio_ars: price_ars }
              : (rest.custom_fields ?? undefined)
          return {
            ...rest,
            ...(custom_fields ? { custom_fields } : {}),
            sku: eanToSku.get(p.ean) || p.ean,
            // title is NOT NULL in products; fall back to ean if mapping produced nothing
            title: p.title || p.ean,
          }
        })

        // Upsert en chunks de UPSERT_CHUNK
        for (let i = 0; i < toUpsert.length; i += UPSERT_CHUNK) {
          const chunk = toUpsert.slice(i, i + UPSERT_CHUNK)
          let retryCount = 0
          let chunkDone = false

          while (!chunkDone && retryCount <= 2) {
            const { error: chunkError } = await supabase.from("products").upsert(chunk, { onConflict: "ean" })

            if (chunkError) {
              if (isTimeoutError(chunkError.message) && retryCount < 2) {
                timeout_count++
                retryCount++
                log.warn("Catalog chunk timeout, retrying", "batch.upsert", { chunk_offset: i, retry: retryCount })
                await new Promise((r) => setTimeout(r, 1000 * retryCount))
                continue
              }
              last_error = chunkError.message
              last_reason = isTimeoutError(chunkError.message) ? "statement_timeout" : "upsert_failed"
              failed_rows += chunk.length
              chunkDone = true
            } else {
              // Contar created vs updated basado en si existía antes
              for (const p of chunk) {
                if (eanToSku.has(p.ean)) {
                  updated++
                } else {
                  created++
                }
              }
              chunkDone = true
            }
          }
        }
      }

      // Validar: created+updated nunca puede superar rows_processed
      if (created + updated > rows_processed) {
        log.warn("Counter inconsistency detected, correcting", "batch.counters", {
          created,
          updated,
          rows_processed,
        })
        const total_ok = rows_processed - failed_rows
        updated = isStockImport ? total_ok : Math.min(updated, total_ok)
        created = isStockImport ? 0 : Math.min(created, total_ok - updated)
      }

      // Populate stock_by_source so warehouse source-filtering works
      const elapsedSoFar = Date.now() - startTime
      const TIME_BUDGET_MS = 250_000 // leave 50s margin before Vercel 300s limit

      if (elapsedSoFar < TIME_BUDGET_MS) {
        const sourceKey = (source.source_key || source.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") || "").slice(0, 30)
        if (sourceKey && deduped.some((p: any) => p.stock !== null && p.stock !== undefined)) {
          const eanStockMap = new Map<string, number>()
          for (const p of deduped) {
            if (p.stock !== null && p.stock !== undefined) {
              eanStockMap.set(p.ean, parseInt(String(p.stock), 10) || 0)
            }
          }
          const stockEans = Array.from(eanStockMap.keys())
          const SBS_CHUNK = 200
          for (let i = 0; i < stockEans.length; i += SBS_CHUNK) {
            const eanChunk = stockEans.slice(i, i + SBS_CHUNK)
            try {
              const { data: prods } = await supabase
                .from("products")
                .select("id, ean, stock_by_source")
                .in("ean", eanChunk)
              if (!prods?.length) continue
              await supabase.from("products").upsert(
                prods.map((p: any) => ({
                  id: p.id,
                  stock_by_source: { ...(p.stock_by_source ?? {}), [sourceKey]: eanStockMap.get(p.ean) ?? 0 },
                })),
                { onConflict: "id" },
              )
            } catch (e) {
              log.warn("stock_by_source update failed for chunk", "batch.stock_by_source", {
                error: e instanceof Error ? e.message : String(e),
              })
            }
          }
        }
      } else {
        log.warn("Skipping stock_by_source update — time budget exceeded", "batch.time_guard", {
          elapsed_ms: elapsedSoFar,
          budget_ms: TIME_BUDGET_MS,
        })
      }

      if (!last_error) last_reason = "success"
    } else {
      last_reason = rows_seen === 0 ? "no_rows_in_batch" : "all_filtered"
    }

    const duration_ms = Date.now() - startTime
    const next_offset = done ? null : offset + rows_seen

    log.info("Batch import completed", "batch.complete", {
      done,
      offset,
      rows_seen,
      rows_processed,
      created,
      updated,
      failed_rows,
      timeout_count,
      duration_ms,
      reason: last_reason,
      source_name: source.name,
      status: last_error ? "partial" : "ok",
    })

    // Record run on first batch (captures the initial batch metrics)
    if (run) {
      if (done) {
        await run.complete({
          rows_processed,
          rows_created: created,
          rows_updated: updated,
          rows_failed: failed_rows,
          log_json: { missing_ean, invalid_ean, timeout_count, total_rows: totalRows, source_name: source.name },
        })
      } else if (last_error) {
        await run.fail(last_error)
      }
      // If not done and no error, the run stays 'running' — next batches won't touch it
    }

    // Actualizar import_history si existe (heartbeat: updated_at always refreshed)
    if (historyId) {
      const { data: history } = await supabase.from("import_history").select("*").eq("id", historyId).single()
      if (history) {
        await supabase
          .from("import_history")
          .update({
            status: done ? "completed" : "running",
            processed_rows: (history.processed_rows || 0) + rows_processed,
            created_count: (history.created_count || 0) + created,
            updated_count: (history.updated_count || 0) + updated,
            skipped_count: (history.skipped_count || 0) + missing_ean + invalid_ean,
            error_count: last_error ? (history.error_count || 0) + 1 : history.error_count,
            current_offset: next_offset,
            last_message: done
              ? `Completado: ${(history.processed_rows || 0) + rows_processed} procesadas`
              : `Procesando offset ${offset}`,
            completed_at: done ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", historyId)
      }
    }

    return NextResponse.json({
      ok: true,
      offset,
      batch_size: effectiveBatchSize,
      rows_seen,
      rows_processed,
      created,
      updated,
      failed_rows,
      timeout_count,
      missing_ean,
      invalid_ean,
      done,
      next_offset,
      last_reason,
      last_error,
      duration_ms,
      suggested_next_batch_size:
        timeout_count > 0
          ? Math.max(BATCH_SIZE_MIN, Math.floor(effectiveBatchSize / 2))
          : duration_ms < 5000 && effectiveBatchSize < BATCH_SIZE_MAX
            ? Math.min(BATCH_SIZE_MAX, Math.floor(effectiveBatchSize * 1.5))
            : effectiveBatchSize,
      debug:
        offset === 0
          ? {
              delimiter,
              headers_normalized: headersNormalized.slice(0, 20),
              sample_ean: batchRows[0]?.["ean"] || batchRows[0]?.["ean13"] || "(no encontrado)",
              total_rows_in_file: totalRows,
            }
          : undefined,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "Error interno"
    const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined
    log.error("Batch import fatal error", error, "batch.fatal")
    return NextResponse.json(
      { ok: false, error: { code: "internal_error", detail: message, stack_hint: stack } },
      { status: 500 },
    )
  }
}
