import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

const BATCH_SIZE = 1000

// Cache global para el archivo CSV parseado
const csvCache: Map<string, { data: Record<string, string>[], timestamp: number }> = new Map()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutos

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
  forceReload: boolean = false
): Promise<BatchImportResult> {
  
  // Limpiar cache si se fuerza recarga
  if (forceReload) {
    console.log(`[v0] Batch import: Limpiando cache`)
    csvCache.clear()
  }

  console.log(`[v0] Batch import ejecutando: sourceId=${sourceId}, mode=${mode}, offset=${offset}`)

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
      error: `Fuente no encontrada: ${sourceId}`
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
      error: "URL no configurada"
    }
  }

  // Verificar cache o descargar CSV
  let data: Record<string, string>[]
  const cached = csvCache.get(sourceId)
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[v0] Batch import: Usando CSV desde cache`)
    data = cached.data
  } else {
    console.log(`[v0] Batch import: Descargando archivo desde ${fileUrl}`)

    const fileResponse = await fetch(fileUrl)
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
        error: `Error descargando: ${fileResponse.status}`
      }
    }

    const csvText = await fileResponse.text()
    console.log(`[v0] Batch import: Archivo descargado, ${csvText.length} caracteres`)

    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: "|",
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
  const mapping = source.column_mapping || {}

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
    
    const stockUpdates = batchEans.map(ean => {
      const stockData = stockMap.get(ean)!
      return { ean, stock: stockData.stock, price: stockData.price }
    })
    
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_stock_batch', {
      stock_updates: stockUpdates
    })
    
    if (!rpcError && rpcResult) {
      updatedCount = rpcResult.updated || 0
    } else {
      console.log(`[v0] RPC error:`, rpcError)
      failedCount = batchEans.length
    }
    
    const newOffset = offset + batch.length
    const done = newOffset >= totalRows
    const progress = Math.round((newOffset / totalRows) * 100)
    
    // Si terminamos, poner stock=0 en productos que no están en el archivo
    if (done) {
      console.log(`[v0] Stock import: Poniendo stock=0 en productos no listados...`)
      
      const eansInFile = data
        .map(row => row[mapping.ean || "EAN"]?.trim())
        .filter(Boolean)
      
      const { data: zeroResult, error: zeroError } = await supabase.rpc('zero_stock_not_in_list', {
        ean_list: eansInFile
      })
      
      if (!zeroError && zeroResult) {
        zeroStockCount = zeroResult.zeroed || 0
        console.log(`[v0] Stock import: ${zeroStockCount} productos puestos a stock=0`)
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
    const chunkWithEan = chunk.filter(p => p.ean)
    
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
  feedType: string
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
        message: result.error
      }
    }
    
    totalCreated += result.created
    totalUpdated += result.updated
    done = result.done
    offset = result.nextOffset || 0
    isFirstBatch = false
    
    console.log(`[v0] Import progress: ${result.progress}% (${result.processed}/${result.total})`)
  }
  
  return {
    success: true,
    created: totalCreated,
    updated: totalUpdated,
    message: `Importación completada: ${totalCreated} creados, ${totalUpdated} actualizados`
  }
}
