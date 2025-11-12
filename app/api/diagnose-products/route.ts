import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  console.log("[v0] === DIAGNÓSTICO GET STARTED ===")

  try {
    const supabaseUrl = process.env.SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    console.log("[v0] Supabase URL disponible:", !!supabaseUrl)
    console.log("[v0] Supabase Key disponible:", !!supabaseKey)

    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log("[v0] Cliente Supabase creado exitosamente")

    console.log("[v0] Obteniendo fuentes...")
    const { data: sources, error: sourcesError } = await supabase.from("import_sources").select("id, name")

    if (sourcesError) {
      console.error("[v0] Error al obtener fuentes:", sourcesError)
    }

    const sourceMap = new Map<string, string>()
    sources?.forEach((s: any) => {
      sourceMap.set(s.id, s.name)
    })

    console.log(`[v0] Fuentes cargadas: ${sourceMap.size}`)

    // 1. Total de productos
    console.log("[v0] Consultando total de productos...")
    const { count: totalProducts, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar productos:", countError)
      throw countError
    }

    console.log(`[v0] Total productos en BD: ${totalProducts}`)

    console.log("[v0] Analizando duplicados en TODOS los productos...")
    const skuMap = new Map<string, number>()
    const skuExamples = new Map<string, string>()
    let offset = 0
    const batchSize = 10000
    let processedCount = 0

    while (true) {
      console.log(`[v0] Obteniendo lote ${Math.floor(offset / batchSize) + 1}, offset: ${offset}`)

      const { data: batch, error: batchError } = await supabase
        .from("products")
        .select("sku")
        .range(offset, offset + batchSize - 1)

      if (batchError) {
        console.error("[v0] Error al obtener lote:", batchError)
        break
      }

      if (!batch || batch.length === 0) {
        console.log("[v0] No hay más productos para procesar")
        break
      }

      // Procesar este lote
      batch.forEach((p: any) => {
        if (!p.sku) return
        const normalizedSKU = p.sku.toString().trim().toUpperCase().replace(/[\s-]/g, "")
        if (normalizedSKU) {
          const count = skuMap.get(normalizedSKU) || 0
          skuMap.set(normalizedSKU, count + 1)

          if (!skuExamples.has(normalizedSKU)) {
            skuExamples.set(normalizedSKU, p.sku)
          }
        }
      })

      processedCount += batch.length
      console.log(`[v0] Procesados hasta ahora: ${processedCount} productos`)

      if (batch.length < batchSize) {
        console.log("[v0] Último lote procesado")
        break
      }

      offset += batchSize
    }

    console.log(`[v0] Total de productos procesados: ${processedCount}`)

    const duplicateSKUs: string[] = []
    let totalDuplicateCount = 0

    skuMap.forEach((count, normalizedSKU) => {
      if (count > 1) {
        const exampleSKU = skuExamples.get(normalizedSKU) || normalizedSKU
        duplicateSKUs.push(exampleSKU)
        totalDuplicateCount += count - 1
      }
    })

    console.log("[v0] SKUs duplicados encontrados:", duplicateSKUs.length)
    console.log("[v0] Total de productos duplicados:", totalDuplicateCount)
    console.log("[v0] Ejemplos de duplicados:", duplicateSKUs.slice(0, 10))

    console.log("[v0] Obteniendo muestra de 5000 productos para análisis adicional...")
    const { data: sampleProducts, error: fetchError } = await supabase
      .from("products")
      .select("id, sku, title, source")
      .limit(5000)

    if (fetchError) {
      console.error("[v0] Error al obtener muestra:", fetchError)
      throw fetchError
    }

    console.log(`[v0] Muestra obtenida: ${sampleProducts?.length || 0} productos`)

    // 2. Títulos corruptos
    console.log("[v0] Analizando títulos corruptos...")
    const corruptedTitles =
      sampleProducts
        ?.filter((p: any) => {
          if (!p.title || p.title.trim() === "") return true
          if (/^\d+(\.\d+)?$/.test(p.title.trim())) return true
          if (p.title.length < 3) return true
          return false
        })
        .slice(0, 50)
        .map((p: any) => ({ sku: p.sku, title: p.title })) || []

    console.log("[v0] Títulos corruptos encontrados:", corruptedTitles.length)

    console.log("[v0] Calculando distribución por fuentes...")
    const sourceCounts: Record<string, number> = {}
    sampleProducts?.forEach((product: any) => {
      const sourceId = product.source || "Sin fuente"
      const sourceIdStr = Array.isArray(sourceId) ? sourceId.join(", ") : sourceId
      const sourceName = sourceMap.get(sourceIdStr) || sourceIdStr
      sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Distribución por fuentes:", productsBySource)
    console.log("[v0] === DIAGNÓSTICO COMPLETED ===")

    const response = {
      totalProducts: totalProducts || 0,
      duplicateSKUs: duplicateSKUs.slice(0, 50), // Solo devolver primeros 50 ejemplos
      totalDuplicateSKUs: duplicateSKUs.length,
      totalDuplicateProducts: totalDuplicateCount,
      productsBySource,
      corruptedTitles,
      timestamp: new Date().toISOString(),
    }

    console.log("[v0] Respuesta final:", JSON.stringify(response, null, 2))

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[v0] === DIAGNÓSTICO ERROR ===")
    console.error("[v0] Error completo:", error)
    console.error("[v0] Stack:", error.stack)
    return NextResponse.json({ error: error.message || "Error al ejecutar diagnóstico" }, { status: 500 })
  }
}
