import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

export async function GET() {
  try {
    console.log("[v0] ========================================")
    console.log("[v0] DIAGNÓSTICO - INICIANDO")
    console.log("[v0] ========================================")

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    console.log("[v0] Paso 1: Contando total de productos...")
    const { count: totalProducts, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error contando productos:", countError)
      throw countError
    }

    console.log("[v0] Total de productos:", totalProducts)

    console.log("[v0] Paso 2: Obteniendo fuentes...")
    const { data: sources, error: sourcesError } = await supabase.from("import_sources").select("id, name")

    if (sourcesError) {
      console.error("[v0] Error obteniendo fuentes:", sourcesError)
    }

    const sourceMap = new Map<string, string>()
    sources?.forEach((s: any) => {
      sourceMap.set(s.id, s.name)
    })
    console.log("[v0] Fuentes cargadas:", sourceMap.size)

    console.log("[v0] Paso 3: Detectando duplicados en TODA la base de datos...")
    console.log("[v0] Total de productos a analizar:", totalProducts)

    const skuCounts = new Map<string, { count: number; example: string; ids: string[] }>()
    let lastId: string | null = null
    let totalProcessed = 0
    const batchSize = 10000
    let batchNumber = 0

    while (true) {
      batchNumber++
      console.log(`[v0] === Lote ${batchNumber} ===`)

      // Obtener productos ordenados por ID para paginación manual
      let query = supabase.from("products").select("id, sku").order("id", { ascending: true }).limit(batchSize)

      if (lastId) {
        query = query.gt("id", lastId)
      }

      const { data: batch, error: batchError } = await query

      if (batchError) {
        console.error("[v0] Error obteniendo lote:", batchError)
        throw batchError
      }

      if (!batch || batch.length === 0) {
        console.log("[v0] No hay más productos - análisis completo")
        break
      }

      console.log(`[v0] Procesando ${batch.length} productos...`)

      // Procesar cada producto del lote
      batch.forEach((p: any) => {
        if (!p.sku) return

        // Normalizar SKU: trim, uppercase, sin espacios ni guiones
        const normalized = p.sku.toString().trim().toUpperCase().replace(/[\s-]/g, "")
        if (!normalized) return

        const existing = skuCounts.get(normalized)
        if (existing) {
          existing.count++
          existing.ids.push(p.id)
        } else {
          skuCounts.set(normalized, {
            count: 1,
            example: p.sku,
            ids: [p.id],
          })
        }
      })

      totalProcessed += batch.length
      const progress = Math.round((totalProcessed / (totalProducts || 1)) * 100)
      console.log(`[v0] Progreso: ${totalProcessed}/${totalProducts} productos (${progress}%)`)

      // Actualizar lastId con el último ID del lote
      lastId = batch[batch.length - 1].id

      // Si obtuvimos menos productos que el límite, hemos terminado
      if (batch.length < batchSize) {
        console.log("[v0] Último lote procesado - análisis completo")
        break
      }
    }

    // Contar duplicados
    const duplicateSKUs: string[] = []
    const duplicateDetails: Array<{ sku: string; count: number }> = []
    let totalDuplicateProducts = 0

    skuCounts.forEach((value, key) => {
      if (value.count > 1) {
        duplicateSKUs.push(value.example)
        duplicateDetails.push({ sku: value.example, count: value.count })
        totalDuplicateProducts += value.count - 1 // Los "extras" que deben eliminarse
      }
    })

    // Ordenar por cantidad de duplicados
    duplicateDetails.sort((a, b) => b.count - a.count)

    console.log("[v0] ========================================")
    console.log("[v0] ANÁLISIS DE DUPLICADOS COMPLETADO")
    console.log("[v0] ========================================")
    console.log(`[v0] Total productos analizados: ${totalProcessed}`)
    console.log(`[v0] Total SKUs únicos: ${skuCounts.size}`)
    console.log(`[v0] SKUs con duplicados: ${duplicateSKUs.length}`)
    console.log(`[v0] Productos duplicados (extras): ${totalDuplicateProducts}`)
    if (duplicateDetails.length > 0) {
      console.log(`[v0] Top 5 SKUs más duplicados:`)
      duplicateDetails.slice(0, 5).forEach((d) => {
        console.log(`[v0]   - ${d.sku}: ${d.count} copias`)
      })
    }

    console.log("[v0] Paso 4: Obteniendo distribución por fuentes...")
    const sourceCountsMap = new Map<string, number>()
    let sourceLastId: string | null = null
    let sourcesProcessed = 0

    while (true) {
      let sourceQuery = supabase.from("products").select("id, source").order("id", { ascending: true }).limit(10000)

      if (sourceLastId) {
        sourceQuery = sourceQuery.gt("id", sourceLastId)
      }

      const { data: sourceBatch, error: sourceError } = await sourceQuery

      if (sourceError) {
        console.error("[v0] Error obteniendo fuentes:", sourceError)
        break
      }

      if (!sourceBatch || sourceBatch.length === 0) break

      sourceBatch.forEach((p: any) => {
        // source es un array, procesamos cada elemento
        if (Array.isArray(p.source)) {
          p.source.forEach((sourceId: string) => {
            const sourceName = sourceMap.get(sourceId) || sourceId
            sourceCountsMap.set(sourceName, (sourceCountsMap.get(sourceName) || 0) + 1)
          })
        } else if (p.source) {
          // Fallback si source no es array
          const sourceId = p.source
          const sourceName = sourceMap.get(sourceId) || sourceId
          sourceCountsMap.set(sourceName, (sourceCountsMap.get(sourceName) || 0) + 1)
        } else {
          sourceCountsMap.set("Sin fuente", (sourceCountsMap.get("Sin fuente") || 0) + 1)
        }
      })

      sourcesProcessed += sourceBatch.length
      console.log(`[v0] Progreso fuentes: ${sourcesProcessed}/${totalProducts}`)

      sourceLastId = sourceBatch[sourceBatch.length - 1].id
      if (sourceBatch.length < 10000) break
    }

    const productsBySource = Array.from(sourceCountsMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Distribución por fuentes:", productsBySource)

    console.log("[v0] Paso 5: Detectando títulos corruptos...")
    const { data: sample, error: sampleError } = await supabase.from("products").select("sku, title").limit(10000)

    if (sampleError) {
      console.error("[v0] Error obteniendo muestra:", sampleError)
    }

    const corruptedTitles = (sample || [])
      .filter((p: any) => {
        if (!p.title || p.title.trim() === "") return true
        if (/^\d+(\.\d+)?$/.test(p.title.trim())) return true
        if (p.title.length < 3) return true
        return false
      })
      .slice(0, 50)
      .map((p: any) => ({
        sku: p.sku,
        title: p.title || "Sin título",
      }))

    console.log("[v0] Títulos corruptos encontrados:", corruptedTitles.length)

    console.log("[v0] ========================================")
    console.log("[v0] DIAGNÓSTICO - COMPLETADO EXITOSAMENTE")
    console.log("[v0] ========================================")

    const response = {
      totalProducts: totalProducts || 0,
      duplicateSKUs: duplicateSKUs.slice(0, 100),
      totalDuplicateSKUs: duplicateSKUs.length,
      totalDuplicateProducts,
      duplicateDetails: duplicateDetails.slice(0, 20),
      productsBySource,
      corruptedTitles,
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[v0] ========================================")
    console.error("[v0] ERROR FATAL EN DIAGNÓSTICO")
    console.error("[v0] ========================================")
    console.error("[v0] Error:", error.message)
    console.error("[v0] Stack:", error.stack)

    return NextResponse.json(
      {
        error: error.message || "Error al ejecutar diagnóstico",
        stack: error.stack,
      },
      { status: 500 },
    )
  }
}
