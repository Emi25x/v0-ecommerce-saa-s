import { createClient } from "@/lib/db/server"
import Papa from "papaparse"
import { createStructuredLogger } from "@/lib/logger"

const log = createStructuredLogger({})

const BATCH_SIZE = 200 // Reducido para evitar timeout en Supabase

// Cache global para el archivo CSV parseado
const csvCache: Map<string, { data: Record<string, string>[]; timestamp: number }> = new Map()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutos

/**
 * Normaliza column_mapping para soportar formatos viejos y nuevos
 * Formato viejo: { sku: "SKU", ean: "EAN", ... }
 * Formato nuevo: { delimiter: ";", has_header: true, mappings: { sku: "SKU", ... } }
 */
function normalizeColumnMapping(columnMapping: any): {
  delimiter: string
  mappings: Record<string, string>
} {
  if (!columnMapping) {
    return { delimiter: "|", mappings: {} }
  }

  // Si tiene la estructura nueva con "mappings"
  if (columnMapping.mappings) {
    return {
      delimiter: columnMapping.delimiter || "|",
      mappings: columnMapping.mappings,
    }
  }

  // Formato viejo: todo el objeto ES el mapping
  return {
    delimiter: "|",
    mappings: columnMapping,
  }
}

export interface BatchImportResult {
  success: boolean
  done: boolean
  total: number
  processed: number
  created: number
  updated: number
  failed: number
  zeroStock?: number
  nextOffset: number | null
  progress: number
  error?: string
}

export async function executeBatchImport(
  sourceId: string,
  offset: number = 0,
  mode: "update" | "upsert" | "create" = "update",
  forceReload: boolean = false,
): Promise<BatchImportResult> {
  // Limpiar cache si se fuerza recarga
  if (forceReload) {
    log.info("Clearing CSV cache", "batch_import.cache")
    csvCache.clear()
  }

  log.info("Batch import executing", "batch_import.start", { source_id: sourceId, mode, offset })

  const supabase = await createClient()

  // Obtener la fuente
  const { data: source, error: sourceError } = await supabase
    .from("import_sources")
    .select("*")
    .eq("id", sourceId)
    .single()

  if (sourceError || !source) {
    return {
      success: false,
      done: true,
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      nextOffset: null,
      progress: 0,
      error: `Fuente no encontrada: ${sourceId}`,
    }
  }

  const fileUrl = source.url_template
  if (!fileUrl) {
    return {
      success: false,
      done: true,
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      nextOffset: null,
      progress: 0,
      error: "URL no configurada",
    }
  }

  // Verificar cache o descargar CSV
  let data: Record<string, string>[]
  const cached = csvCache.get(sourceId)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log.info("Using cached CSV", "batch_import.cache")
    data = cached.data
  } else {
    log.info("Downloading file", "batch_import.download", { url: fileUrl.substring(0, 60) })

    // Construir headers y URL según tipo de autenticación
    let fetchUrl = fileUrl
    const fetchHeaders: HeadersInit = {
      "User-Agent": "Ecommerce-Manager/1.0",
    }

    const authType = source.auth_type
    const credentials = source.credentials

    if (authType === "basic_auth" && credentials?.username && credentials?.password) {
      const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")
      fetchHeaders["Authorization"] = `Basic ${auth}`
    } else if (authType === "bearer_token" && credentials?.token) {
      fetchHeaders["Authorization"] = `Bearer ${credentials.token}`
    } else if (authType === "query_params" && credentials?.type === "query_params" && credentials?.params) {
      // Agregar query params a la URL
      const url = new URL(fetchUrl)
      Object.keys(credentials.params).forEach((key) => {
        url.searchParams.set(key, credentials.params[key])
      })
      fetchUrl = url.toString()
    }
    // Si authType === "none" o null, no se agrega autenticación

    const fileResponse = await fetch(fetchUrl, { headers: fetchHeaders })
    if (!fileResponse.ok) {
      return {
        success: false,
        done: true,
        total: 0,
        processed: 0,
        created: 0,
        updated: 0,
        failed: 0,
        nextOffset: null,
        progress: 0,
        error: `Error descargando: ${fileResponse.status}`,
      }
    }

    const csvText = await fileResponse.text()
    log.info("File downloaded", "batch_import.download", { chars: csvText.length })

    // Normalizar column_mapping para obtener delimiter y mappings
    const { delimiter, mappings } = normalizeColumnMapping(source.column_mapping)
    log.info("Using delimiter", "batch_import.parse", { delimiter })

    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: delimiter,
    })

    data = parseResult.data as Record<string, string>[]
    csvCache.set(sourceId, { data, timestamp: Date.now() })
  }

  const totalRows = data.length

  if (offset >= totalRows) {
    return {
      success: true,
      done: true,
      total: totalRows,
      processed: totalRows,
      created: 0,
      updated: 0,
      failed: 0,
      nextOffset: null,
      progress: 100,
    }
  }

  const batch = data.slice(offset, offset + BATCH_SIZE)
  // Usar mappings ya normalizado
  const { mappings: mapping } = normalizeColumnMapping(source.column_mapping)

  let updatedCount = 0
  let createdCount = 0
  let failedCount = 0
  let zeroStockCount = 0

  // LÓGICA PARA STOCK_PRICE
  if (source.feed_type === "stock_price") {
    const batchEans: string[] = []
    const stockMap = new Map<string, { stock: number; price: number }>()

    for (const row of batch) {
      const ean = row[mapping.ean || "EAN"]?.trim()
      const stock = parseInt(row[mapping.stock] || "0", 10)
      const price = parseFloat(row[mapping.price || "PRECIO"]?.replace(",", ".") || "0")

      if (!ean) continue
      batchEans.push(ean)
      stockMap.set(ean, { stock, price })
    }

    const stockUpdates = batchEans.map((ean) => {
      const stockData = stockMap.get(ean)!
      return { ean, stock: stockData.stock, price: stockData.price }
    })

    const { data: rpcResult, error: rpcError } = await supabase.rpc("update_stock_batch", {
      stock_updates: stockUpdates,
    })

    if (!rpcError && rpcResult) {
      updatedCount = rpcResult.updated || 0
    } else {
      log.error("RPC error in stock batch", rpcError, "batch_import.stock_rpc")
      failedCount = batchEans.length
    }

    const newOffset = offset + batch.length
    const done = newOffset >= totalRows
    const progress = Math.round((newOffset / totalRows) * 100)

    // Si terminamos, poner stock=0 en productos que no están en el archivo
    // SAFETY: skip if feed returned very few EANs (likely download/parse failure)
    if (done) {
      const eansInFile = data.map((row) => row[mapping.ean || "EAN"]?.trim()).filter(Boolean)

      if (eansInFile.length < 10) {
        log.warn("SKIPPING zero step — too few EANs, likely feed failure", "batch_import.zero_skip", { count: eansInFile.length })
      }

      const { data: zeroResult, error: zeroError } = eansInFile.length >= 10
        ? await supabase.rpc("zero_stock_not_in_list", { ean_list: eansInFile })
        : { data: null, error: null }

      if (!zeroError && zeroResult) {
        zeroStockCount = zeroResult.zeroed || 0
        log.info("Products zeroed", "batch_import.zero_stock", { count: zeroStockCount })
      }
    }

    return {
      success: true,
      done,
      total: totalRows,
      processed: newOffset,
      created: 0,
      updated: updatedCount,
      failed: failedCount,
      zeroStock: zeroStockCount,
      nextOffset: done ? null : newOffset,
      progress,
    }
  }

  // LÓGICA PARA CATÁLOGO COMPLETO
  const now = new Date().toISOString()
  const productsToInsert: Array<Record<string, any>> = []

  for (const row of batch) {
    const sku = row[mapping.sku || "SKU"]?.trim()
    const ean = row[mapping.ean || "EAN"]?.trim()
    const title = row[mapping.title || "TITULO"]?.trim()
    const price = parseFloat(row[mapping.price || "PRECIO"]?.replace(",", ".") || "0")
    const description = row[mapping.description]?.trim() || null
    const brand = row[mapping.brand]?.trim() || null
    const category = row[mapping.category]?.trim() || null
    const stock = parseInt(row[mapping.stock] || "0", 10)
    const internalCode = row[mapping.internal_code]?.trim() || null
    const imageUrl = row[mapping.image_url]?.trim() || null
    const author = row[mapping.author]?.trim() || null
    const language = row[mapping.language]?.trim() || null

    if (!sku) continue

    productsToInsert.push({
      sku,
      ean: ean || null,
      title: title || sku,
      price: price || 0,
      description,
      brand,
      category,
      stock,
      internal_code: internalCode,
      image_url: imageUrl,
      author,
      language,
      source: [sourceId],
      created_at: now,
      updated_at: now,
    })
  }

  // Inserción masiva
  const CHUNK_SIZE = 500
  for (let i = 0; i < productsToInsert.length; i += CHUNK_SIZE) {
    const chunk = productsToInsert.slice(i, i + CHUNK_SIZE)
    const chunkWithEan = chunk.filter((p) => p.ean)

    if (chunkWithEan.length > 0) {
      const { error } = await supabase
        .from("products")
        .upsert(chunkWithEan, { onConflict: "ean", ignoreDuplicates: mode === "create" })

      if (error) {
        failedCount += chunkWithEan.length
      } else {
        if (mode === "update") {
          updatedCount += chunkWithEan.length
        } else {
          createdCount += chunkWithEan.length
        }
      }
    }
  }

  // Populate stock_by_source so warehouse source-filtering works
  const sourceKey = (source as any).source_key || source.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") || ""
  if (sourceKey) {
    const eanStockMap = new Map<string, number>()
    for (const p of productsToInsert) {
      if (p.ean && p.stock !== null && p.stock !== undefined) {
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
        if (prods?.length) {
          await supabase.from("products").upsert(
            prods.map((p: any) => ({
              id: p.id,
              stock_by_source: { ...(p.stock_by_source ?? {}), [sourceKey]: eanStockMap.get(p.ean) ?? 0 },
            })),
            { onConflict: "id" },
          )
        }
      } catch (e) {
        log.warn("stock_by_source update failed", "batch_import.stock_by_source", {
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  const newOffset = offset + batch.length
  const done = newOffset >= totalRows
  const progress = Math.round((newOffset / totalRows) * 100)

  return {
    success: true,
    done,
    total: totalRows,
    processed: newOffset,
    created: createdCount,
    updated: updatedCount,
    failed: failedCount,
    nextOffset: done ? null : newOffset,
    progress,
  }
}

// Ejecutar importación completa en bucle
export async function executeFullImport(
  sourceId: string,
  feedType: string,
): Promise<{ success: boolean; created: number; updated: number; message: string }> {
  const mode = feedType === "stock_price" ? "update" : "upsert"
  let offset = 0
  let done = false
  let totalCreated = 0
  let totalUpdated = 0
  let isFirstBatch = true

  while (!done) {
    const result = await executeBatchImport(sourceId, offset, mode, isFirstBatch)

    if (result.error) {
      return {
        success: false,
        created: totalCreated,
        updated: totalUpdated,
        message: result.error,
      }
    }

    totalCreated += result.created
    totalUpdated += result.updated
    done = result.done
    offset = result.nextOffset || 0
    isFirstBatch = false

    log.info("Import progress", "batch_import.progress", {
      progress: result.progress,
      processed: result.processed,
      total: result.total,
    })
  }

  return {
    success: true,
    created: totalCreated,
    updated: totalUpdated,
    message: `Importación completada: ${totalCreated} creados, ${totalUpdated} actualizados`,
  }
}
