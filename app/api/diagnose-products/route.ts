import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    console.log("[v0] ========================================")
    console.log("[v0] DIAGNÓSTICO DE PRODUCTOS - INICIANDO")
    console.log("[v0] ========================================")

    // 1. Total de productos
    const { count: totalProducts, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar productos:", countError)
      throw new Error(`Error al contar productos: ${countError.message}`)
    }

    console.log(`[v0] Total productos en BD: ${totalProducts}`)

    // 2. Obtener muestra de productos para análisis
    const { data: sampleProducts, error: fetchError } = await supabase
      .from("products")
      .select("id, sku, title, source")
      .limit(10000)

    if (fetchError) {
      console.error("[v0] Error al obtener muestra:", fetchError)
      throw new Error(`Error al obtener muestra: ${fetchError.message}`)
    }

    console.log(`[v0] Muestra obtenida: ${sampleProducts?.length || 0} productos`)

    // 3. Detectar SKUs duplicados (normalizando: trim + uppercase + sin espacios)
    const skuMap = new Map<string, { count: number; ids: string[]; originalSku: string }>()

    sampleProducts?.forEach((p: any) => {
      if (!p.sku) return
      const normalizedSKU = p.sku.toString().trim().toUpperCase().replace(/\s+/g, "")
      if (normalizedSKU) {
        const existing = skuMap.get(normalizedSKU)
        if (existing) {
          existing.count++
          existing.ids.push(p.id)
        } else {
          skuMap.set(normalizedSKU, {
            count: 1,
            ids: [p.id],
            originalSku: p.sku,
          })
        }
      }
    })

    const duplicates = Array.from(skuMap.entries())
      .filter(([_, data]) => data.count > 1)
      .map(([sku, data]) => ({
        sku: data.originalSku,
        count: data.count,
        productIds: data.ids.slice(0, 3),
      }))
      .sort((a, b) => b.count - a.count)

    console.log(`[v0] SKUs duplicados encontrados: ${duplicates.length}`)
    console.log(`[v0] Productos duplicados (total): ${duplicates.reduce((sum, d) => sum + (d.count - 1), 0)}`)

    // 4. Detectar títulos corruptos
    const corruptedTitles =
      sampleProducts
        ?.filter((p: any) => {
          if (!p.title || p.title.trim() === "") return true
          if (/^\d+(\.\d+)?$/.test(p.title.trim())) return true
          if (p.title.length < 3) return true
          return false
        })
        .slice(0, 50) || []

    console.log(`[v0] Títulos corruptos encontrados: ${corruptedTitles.length}`)

    // 5. Distribución por fuentes
    const sourceCounts: Record<string, number> = {}
    sampleProducts?.forEach((product: any) => {
      const source = product.source || "Sin fuente"
      const sourceStr = Array.isArray(source) ? source.join(", ") : source
      sourceCounts[sourceStr] = (sourceCounts[sourceStr] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Distribución por fuentes:", productsBySource)
    console.log("[v0] ========================================")
    console.log("[v0] DIAGNÓSTICO COMPLETADO")
    console.log("[v0] ========================================")

    return NextResponse.json({
      totalProducts: totalProducts || 0,
      duplicateSKUs: duplicates.length,
      duplicateExamples: duplicates.slice(0, 10),
      sourceDistribution: Object.fromEntries(productsBySource.map((s) => [s.source, s.count])),
      corruptTitles: corruptedTitles.slice(0, 10).map((p: any) => ({ sku: p.sku, title: p.title })),
      sampleSize: sampleProducts?.length || 0,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[v0] ========================================")
    console.error("[v0] ERROR EN DIAGNÓSTICO:", error)
    console.error("[v0] ========================================")
    return NextResponse.json(
      {
        error: error.message || "Error desconocido al ejecutar diagnóstico",
      },
      { status: 500 },
    )
  }
}
