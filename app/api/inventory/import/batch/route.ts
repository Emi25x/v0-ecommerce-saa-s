import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"
import { fetchWithAuth } from "@/lib/import/fetch-with-auth"

const BATCH_SIZE = 1000 // Procesar 1000 productos por request (reducido para evitar timeouts)

export const maxDuration = 60 // Máximo tiempo permitido en Vercel

// Cache global para el archivo CSV parseado (evita re-descarga en cada request)
const csvCache: Map<string, { data: Record<string, string>[], timestamp: number }> = new Map()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutos

export async function POST(request: NextRequest) {
  try {
    const { sourceId, offset = 0, mode = "update", forceReload = false } = await request.json()

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId es requerido" }, { status: 400 })
    }
    
    // Limpiar TODO el cache si se fuerza recarga (primera llamada de una importación)
    if (forceReload) {
      console.log(`[v0] Batch import: Limpiando TODO el cache`)
      csvCache.clear()
    }

    console.log(`[v0] Batch import: sourceId = ${sourceId}, Modo = ${mode}, Offset = ${offset}`)

    const supabase = await createClient()

    // Obtener la fuente
    const { data: source, error: sourceError } = await supabase
      .from("import_sources")
      .select("*")
      .eq("id", sourceId)
      .single()

    console.log(`[v0] Batch import: source =`, source?.name, "error =", sourceError?.message)

    if (sourceError || !source) {
      return NextResponse.json({ error: `Fuente no encontrada: ${sourceId}` }, { status: 404 })
    }

    const fileUrl = source.url_template
    if (!fileUrl) {
      return NextResponse.json({ error: "URL no configurada" }, { status: 400 })
    }

    // Verificar si tenemos el CSV en cache
    let data: Record<string, string>[]
    const cached = csvCache.get(sourceId)
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[v0] Batch import: Usando CSV desde cache`)
      data = cached.data
    } else {
      console.log(`[v0] Batch import: Descargando archivo desde ${fileUrl}`)
      console.log(`[v0] Batch import: Auth type: ${source.auth_type}`)
      console.log(`[v0] Batch import: Credentials:`, JSON.stringify(source.credentials).substring(0, 100))

      // Descargar el archivo CSV con autenticación
      const fileResponse = await fetchWithAuth({
        url_template: source.url_template,
        auth_type: source.auth_type,
        credentials: source.credentials
      })
      
      console.log(`[v0] Batch import: Response status: ${fileResponse.status} ${fileResponse.statusText}`)
      
      // Leer el body UNA SOLA VEZ
      const csvText = await fileResponse.text()
      
      if (!fileResponse.ok) {
        console.error(`[v0] Batch import: Error descargando: ${fileResponse.status} ${fileResponse.statusText}`)
        console.error(`[v0] Batch import: Error response body (first 300 chars):`, csvText.substring(0, 300))
        return NextResponse.json({ error: `Error descargando: ${fileResponse.status} - ${fileResponse.statusText}` }, { status: 500 })
      }

      console.log(`[v0] Batch import: Archivo descargado, ${csvText.length} caracteres`)
      console.log(`[v0] Batch import: Primeros 300 caracteres:`, csvText.substring(0, 300))

      // Determinar el delimitador correcto desde column_mapping
      let delimiter = "|" // Default
      if (source.column_mapping?.delimiter) {
        delimiter = source.column_mapping.delimiter
      }
      console.log(`[v0] Batch import: Usando delimiter "${delimiter}"`)

      // Parsear CSV
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        delimiter: delimiter,
      })

      data = parseResult.data as Record<string, string>[]
      
      // Guardar en cache
      csvCache.set(sourceId, { data, timestamp: Date.now() })
      console.log(`[v0] Batch import: CSV guardado en cache`)
    }

    const totalRows = data.length
    
    // Log de las columnas del CSV para verificar que es el archivo correcto
    if (offset === 0 && data.length > 0) {
      const columns = Object.keys(data[0])
      console.log(`[v0] Batch import: Columnas del CSV: ${columns.join(", ")}`)
    }

    console.log(`[v0] Batch import: ${totalRows} filas totales, procesando desde offset ${offset}`)

    // Si el offset es mayor que el total, ya terminamos
    if (offset >= totalRows) {
      return NextResponse.json({
        success: true,
        done: true,
        total: totalRows,
        processed: totalRows,
      })
    }

    // Obtener el lote actual
    const batch = data.slice(offset, offset + BATCH_SIZE)
    
    // Normalizar column_mapping para soportar formato viejo y nuevo
    const mapping = source.column_mapping?.mappings || source.column_mapping || {}

    let updatedCount = 0
    let createdCount = 0
    let failedCount = 0

    const now = new Date().toISOString()

    // LÓGICA ESPECIAL PARA FEEDS TIPO STOCK_PRICE
    // Solo actualiza stock y precio por EAN, no crea productos nuevos
    if (source.feed_type === "stock_price") {
      // Recopilar los EANs del batch para buscar productos existentes
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
      
      // Preparar array para update masivo via RPC
      const stockUpdates = batchEans.map(ean => {
        const stockData = stockMap.get(ean)!
        return { ean, stock: stockData.stock, price: stockData.price }
      })
      
      // Llamar función RPC para update masivo
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
      
      // Si terminamos, poner stock=0 en TODOS los productos que no están en el archivo
      let zeroStockCount = 0
      if (done) {
        console.log(`[v0] Stock import: Poniendo stock=0 en productos que no están en el archivo...`)
        
        // Recopilar todos los EANs del archivo
        const eansInFile = data
          .map(row => row[mapping.ean || "EAN"]?.trim())
          .filter(Boolean)
        
        console.log(`[v0] Stock import: ${eansInFile.length} EANs en el archivo de stock`)
        
        // Usar función SQL para poner stock=0 a los que NO están en la lista
        // Esto es más robusto que cargar todos los productos en memoria
        const { data: rpcResult, error: rpcError } = await supabase.rpc('zero_stock_not_in_list', {
          ean_list: eansInFile
        })
        
        if (!rpcError && rpcResult) {
          zeroStockCount = rpcResult.zeroed || 0
          console.log(`[v0] Stock import: ${zeroStockCount} productos puestos a stock=0`)
        } else {
          console.error(`[v0] Stock import: Error al poner stock=0:`, rpcError)
        }
      }
      
      return NextResponse.json({
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
      })
    }

    // LÓGICA NORMAL PARA CATÁLOGO COMPLETO
    const productsToInsert: Array<Record<string, any>> = []
    
    // Contadores de debug
    let skippedMissingEan = 0
    let skippedInvalidEan = 0
    let processedValidRows = 0
    
    // AUTO-DETECCIÓN DE COLUMNAS
    const isFirstBatch = offset === 0
    let detectedColumns = {
      ean: mapping.ean || null,
      isbn: mapping.isbn || null,
      title: mapping.title || null,
      author: mapping.author || null,
      price: mapping.price || null,
      image: mapping.image_url || null
    }
    
    if (isFirstBatch && batch.length > 0) {
      const headers = Object.keys(batch[0])
      const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      
      // Auto-detectar EAN/ISBN (key obligatoria)
      if (!detectedColumns.ean) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "ean" || nh === "ean13") { detectedColumns.ean = h; break }
        }
      }
      if (!detectedColumns.ean && !detectedColumns.isbn) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "isbn" || nh === "isbn13") { detectedColumns.isbn = h; break }
        }
      }
      if (!detectedColumns.ean && !detectedColumns.isbn) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "gtin" || nh === "codbarras" || nh === "codigo de barras") { 
            detectedColumns.ean = h; break 
          }
        }
      }
      
      // Auto-detectar título
      if (!detectedColumns.title) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "titulo" || nh === "title") { detectedColumns.title = h; break }
        }
      }
      if (!detectedColumns.title) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "descripcion") { detectedColumns.title = h; break }
        }
      }
      
      // Auto-detectar autor
      if (!detectedColumns.author) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "autor" || nh === "author") { detectedColumns.author = h; break }
        }
      }
      
      // Auto-detectar precio (priorizar PVP)
      if (!detectedColumns.price) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "pvp") { detectedColumns.price = h; break }
        }
      }
      if (!detectedColumns.price) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "precio" || nh === "price") { detectedColumns.price = h; break }
        }
      }
      
      // Auto-detectar imagen
      if (!detectedColumns.image) {
        for (const h of headers) {
          const nh = normalize(h)
          if (nh === "portada" || nh === "imagen" || nh === "image" || nh === "url_imagen") { 
            detectedColumns.image = h; break 
          }
        }
      }
      
      console.log(`[v0][DEBUG] === AUTO-DETECCIÓN DE COLUMNAS ===`)
      console.log(`[v0][DEBUG] Headers disponibles:`, headers.join(", "))
      console.log(`[v0][DEBUG] Columnas detectadas:`, JSON.stringify(detectedColumns))
      console.log(`[v0][DEBUG] Column mapping original:`, JSON.stringify(mapping))
      console.log(`[v0][DEBUG] Primera fila RAW:`, JSON.stringify(batch[0]).substring(0, 500))
    }

    // Función para normalizar EAN (solo dígitos)
    const normalizeEan = (raw: string | undefined): string | null => {
      if (!raw) return null
      const digits = raw.replace(/\D/g, "")
      return digits || null
    }

    for (const row of batch) {
      // Extraer valores usando columnas detectadas
      let eanRaw = row[detectedColumns.ean || ""]?.trim()
      const isbnRaw = row[detectedColumns.isbn || ""]?.trim()
      
      // Si no hay EAN, usar ISBN
      if (!eanRaw && isbnRaw) {
        eanRaw = isbnRaw
      }
      
      // Normalizar EAN (solo dígitos)
      const ean = normalizeEan(eanRaw)
      
      // Debug de primera fila
      if (isFirstBatch && processedValidRows === 0 && skippedMissingEan === 0 && skippedInvalidEan === 0) {
        console.log(`[v0][DEBUG] === PRIMERA FILA - EXTRACCIÓN ===`)
        console.log(`[v0][DEBUG]   EAN raw: "${eanRaw || '(vacío)'}"`)
        console.log(`[v0][DEBUG]   EAN normalizado: "${ean || '(vacío)'}"`)
        console.log(`[v0][DEBUG]   ISBN raw: "${isbnRaw || '(vacío)'}"`)
      }
      
      // Validar EAN obligatorio
      if (!ean) {
        skippedMissingEan++
        if (isFirstBatch && skippedMissingEan === 1) {
          console.log(`[v0][DEBUG] DESCARTADO: EAN/ISBN faltante`)
        }
        continue
      }
      
      // Validar longitud EAN (debe ser 13 dígitos para EAN-13)
      if (ean.length !== 13) {
        skippedInvalidEan++
        if (isFirstBatch && skippedInvalidEan === 1) {
          console.log(`[v0][DEBUG] DESCARTADO: EAN inválido (longitud=${ean.length}, esperado=13)`)
        }
        continue
      }
      
      processedValidRows++
      
      const title = row[detectedColumns.title || ""]?.trim() || ean
      const author = row[detectedColumns.author || ""]?.trim() || null
      const price = parseFloat(row[detectedColumns.price || ""]?.replace(",", ".") || "0")
      const imageUrl = row[detectedColumns.image || ""]?.trim() || null
      
      // Campos adicionales del mapping (si existen)
      const description = row[mapping.description]?.trim() || null
      const brand = row[mapping.brand]?.trim() || null
      const category = row[mapping.category]?.trim() || null
      const stock = parseInt(row[mapping.stock] || "0", 10)
      const internalCode = row[mapping.internal_code]?.trim() || null
      const language = row[mapping.language]?.trim() || null
      const yearEdition = row[mapping.year_edition]?.trim() || null
      const subject = row[mapping.subject]?.trim() || null
      const course = row[mapping.course]?.trim() || null
      const binding = row[mapping.binding]?.trim() || null
      const pages = parseInt(row[mapping.pages] || "0", 10) || null
      const height = parseFloat(row[mapping.height]?.replace(",", ".") || "0") || null
      const width = parseFloat(row[mapping.width]?.replace(",", ".") || "0") || null
      const thickness = parseFloat(row[mapping.thickness]?.replace(",", ".") || "0") || null
      const costPrice = parseFloat(row[mapping.cost_price]?.replace(",", ".") || "0") || null
      const vat = parseFloat(row[mapping.vat]?.replace(",", ".") || "0") || null
      const editionDate = row[mapping.edition_date]?.trim() || null
      const ibicSubjects = row[mapping.ibic_subjects]?.trim() || null

      productsToInsert.push({
        sku: ean, // Usar EAN como SKU (identificador único)
        ean: ean,
        isbn: isbnRaw || null,
        title: title,
        price: price || 0,
        description,
        brand,
        category,
        stock,
        internal_code: internalCode,
        image_url: imageUrl,
        author,
        language,
        year_edition: yearEdition,
        subject,
        course,
        binding,
        pages,
        height,
        width,
        thickness,
        cost_price: costPrice,
        vat,
        edition_date: editionDate,
        ibic_subjects: ibicSubjects,
        source: [sourceId],
        created_at: now,
        updated_at: now,
      })
    }

    // Inserción masiva en chunks de 500
    const CHUNK_SIZE = 500
    for (let i = 0; i < productsToInsert.length; i += CHUNK_SIZE) {
      const chunk = productsToInsert.slice(i, i + CHUNK_SIZE)
      
      if (mode === "create" || mode === "upsert") {
        // Todos los productos aquí tienen EAN (o ISBN-como-EAN)
        let existingCount = 0
        if (mode === "create") {
          const eans = chunk.map(p => p.ean)
          const { count } = await supabase
            .from("products")
            .select("ean", { count: "exact", head: true })
            .in("ean", eans)
          existingCount = count || 0
        }
        
        const { error } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "ean", ignoreDuplicates: mode === "create" })
        
        if (error) {
          console.error("[v0] Error insertando chunk:", error.message)
          failedCount += chunk.length
        } else {
          if (mode === "create") {
            createdCount += chunk.length - existingCount
          } else {
            createdCount += chunk.length
          }
        }
      } else if (mode === "update") {
        // Para update, todos tienen EAN
        const { error } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "ean", ignoreDuplicates: false })
        
        if (error) {
          console.error("[v0] Error actualizando chunk:", error.message)
          failedCount += chunk.length
        } else {
          updatedCount += chunk.length
        }
      }
    }

    const newOffset = offset + batch.length
    const done = newOffset >= totalRows
    const progress = Math.round((newOffset / totalRows) * 100)

    console.log(`[v0] Batch import: Lote procesado. Creados: ${createdCount}, Actualizados: ${updatedCount}, Fallidos: ${failedCount}, Progreso: ${progress}%`)
    console.log(`[v0] Batch import: Debug counters - Valid: ${processedValidRows}, Sin EAN: ${skippedMissingEan}, EAN inválido: ${skippedInvalidEan}`)

    return NextResponse.json({
      success: true,
      done,
      total: totalRows,
      processed: newOffset,
      created: createdCount,
      updated: updatedCount,
      failed: failedCount,
      nextOffset: done ? null : newOffset,
      progress,
      debug: {
        skipped_missing_ean: skippedMissingEan,
        skipped_invalid_ean: skippedInvalidEan,
        processed_valid_rows: processedValidRows,
        products_to_insert: productsToInsert.length
      }
    })
  } catch (error) {
    console.error("[v0] Error en batch import:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
