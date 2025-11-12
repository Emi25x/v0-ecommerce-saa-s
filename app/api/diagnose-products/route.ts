import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  console.log("[v0] === DIAGNÓSTICO GET STARTED ===")

  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log("[v0] Supabase URL disponible:", !!supabaseUrl)
    console.log("[v0] Supabase Key disponible:", !!supabaseKey)

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Faltan credenciales de Supabase")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    console.log("[v0] Cliente Supabase creado exitosamente")

    // 1. Total de productos
    console.log("[v0] Consultando total de productos...")
    const { count: totalProducts, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar productos:", countError)
      throw new Error(`Error al contar productos: ${countError.message}`)
    }

    console.log(`[v0] Total productos en BD: ${totalProducts}`)

    // 2. Obtener muestra de 5,000 productos para análisis rápido
    console.log("[v0] Obteniendo muestra de productos...")
    const { data: sampleProducts, error: fetchError } = await supabase
      .from("products")
      .select("id, sku, title, source")
      .limit(5000)

    if (fetchError) {
      console.error("[v0] Error al obtener muestra:", fetchError)
      throw new Error(`Error al obtener muestra: ${fetchError.message}`)
    }

    console.log(`[v0] Muestra obtenida: ${sampleProducts?.length || 0} productos`)

    // 3. Detectar SKUs duplicados
    console.log("[v0] Analizando duplicados...")
    const skuMap = new Map<string, { count: number; originalSku: string }>()

    sampleProducts?.forEach((p: any) => {
      if (!p.sku) return
      const normalizedSKU = p.sku.toString().trim().toUpperCase().replace(/\s+/g, "")
      if (normalizedSKU) {
        const existing = skuMap.get(normalizedSKU)
        if (existing) {
          existing.count++
        } else {
          skuMap.set(normalizedSKU, {
            count: 1,
            originalSku: p.sku,
          })
        }
      }
    })

    const duplicates = Array.from(skuMap.entries())
      .filter(([_, data]) => data.count > 1)
      .map(([_, data]) => data.originalSku)

    console.log("[v0] SKUs duplicados encontrados:", duplicates.length)

    // 4. Títulos corruptos
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

    // 5. Distribución por fuentes
    console.log("[v0] Calculando distribución por fuentes...")
    const sourceCounts: Record<string, number> = {}
    sampleProducts?.forEach((product: any) => {
      const source = product.source || "Sin fuente"
      const sourceStr = Array.isArray(source) ? source.join(", ") : source
      sourceCounts[sourceStr] = (sourceCounts[sourceStr] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Distribución por fuentes:", productsBySource.length)
    console.log("[v0] === DIAGNÓSTICO COMPLETED ===")

    return NextResponse.json({
      totalProducts: totalProducts || 0,
      duplicateSKUs: duplicates,
      productsBySource,
      corruptedTitles,
      sampleSize: sampleProducts?.length || 0,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("[v0] === DIAGNÓSTICO ERROR ===")
    console.error("[v0] Error:", error.message)
    console.error("[v0] Stack:", error.stack)
    return NextResponse.json({ error: error.message || "Error al ejecutar diagnóstico" }, { status: 500 })
  }
}
