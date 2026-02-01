import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Papa from "papaparse"

const BATCH_SIZE = 3000 // Procesar 3000 productos por request

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

      // Descargar el archivo CSV
      const fileResponse = await fetch(fileUrl)
      if (!fileResponse.ok) {
        return NextResponse.json({ error: `Error descargando: ${fileResponse.status}` }, { status: 500 })
      }

      const csvText = await fileResponse.text()
      console.log(`[v0] Batch import: Archivo descargado, ${csvText.length} caracteres`)

      // Parsear CSV
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        delimiter: "|",
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
    const mapping = source.column_mapping || {}

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
      
      // Buscar productos existentes por EAN en chunks de 500
      const CHUNK_SIZE = 500
      for (let i = 0; i < batchEans.length; i += CHUNK_SIZE) {
        const chunkEans = batchEans.slice(i, i + CHUNK_SIZE)
        
        // Buscar productos existentes
        const { data: existingProducts } = await supabase
          .from("products")
          .select("id, ean")
          .in("ean", chunkEans)
        
        if (existingProducts && existingProducts.length > 0) {
          // Preparar updates masivos
          const updates = existingProducts.map(p => {
            const stockData = stockMap.get(p.ean!)
            return {
              id: p.id,
              stock: stockData?.stock || 0,
              price: stockData?.price || 0,
              updated_at: now,
            }
          })
          
          // Actualizar en batch usando upsert
          const { error } = await supabase
            .from("products")
            .upsert(updates, { onConflict: "id" })
          
          if (!error) {
            updatedCount += updates.length
          } else {
            failedCount += updates.length
          }
        }
      }
      
      const newOffset = offset + batch.length
      const done = newOffset >= totalRows
      const progress = Math.round((newOffset / totalRows) * 100)
      
      // Si terminamos, poner stock=0 en productos que no están en el archivo
      let zeroStockCount = 0
      if (done) {
        console.log(`[v0] Stock import: Poniendo stock=0 en productos que no están en el archivo...`)
        
        const eansInFile = new Set(
          data
            .map(row => row[mapping.ean || "EAN"]?.trim())
            .filter(Boolean)
        )
        
        const { data: allProducts } = await supabase
          .from("products")
          .select("id, ean")
          .not("ean", "is", null)
        
        if (allProducts) {
          const productsToZero = allProducts.filter(p => p.ean && !eansInFile.has(p.ean))
          console.log(`[v0] Stock import: ${productsToZero.length} productos a poner en stock=0`)
          
          for (let i = 0; i < productsToZero.length; i += 1000) {
            const ids = productsToZero.slice(i, i + 1000).map(p => p.id)
            const { error } = await supabase
              .from("products")
              .update({ stock: 0, updated_at: now })
              .in("id", ids)
            
            if (!error) zeroStockCount += ids.length
          }
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
        // Filtrar productos sin EAN para el upsert por EAN
        const chunkWithEan = chunk.filter(p => p.ean)
        
        if (chunkWithEan.length > 0) {
          const { error } = await supabase
            .from("products")
            .upsert(chunkWithEan, { onConflict: "ean", ignoreDuplicates: mode === "create" })
          
          if (error) {
            console.error("[v0] Error insertando chunk:", error.message)
            failedCount += chunkWithEan.length
          } else {
            createdCount += chunkWithEan.length
          }
        }
      } else if (mode === "update") {
        // Para update, usamos upsert que actualiza si existe (por EAN)
        const chunkWithEan = chunk.filter(p => p.ean)
        
        if (chunkWithEan.length > 0) {
          const { error } = await supabase
            .from("products")
            .upsert(chunkWithEan, { onConflict: "ean", ignoreDuplicates: false })
          
          if (error) {
            console.error("[v0] Error actualizando chunk:", error.message)
            failedCount += chunkWithEan.length
          } else {
            updatedCount += chunkWithEan.length
          }
        }
      }
    }

    const newOffset = offset + batch.length
    const done = newOffset >= totalRows
    const progress = Math.round((newOffset / totalRows) * 100)

    console.log(`[v0] Batch import: Lote procesado. Creados: ${createdCount}, Actualizados: ${updatedCount}, Fallidos: ${failedCount}, Progreso: ${progress}%`)

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
    })
  } catch (error) {
    console.error("[v0] Error en batch import:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
