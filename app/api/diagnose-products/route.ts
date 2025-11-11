import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    console.log("[v0] Iniciando diagnóstico optimizado de productos...")

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )

    // 1. Total de productos
    const { count: totalProducts, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar productos:", countError)
      throw new Error(`Error al contar productos: ${countError.message}`)
    }

    console.log("[v0] Total productos:", totalProducts)

    const { data: sampleProducts, error: fetchError } = await supabase
      .from("products")
      .select("id, sku, title, source")
      .limit(30000)

    if (fetchError) {
      console.error("[v0] Error al obtener muestra:", fetchError)
      throw new Error(`Error al obtener muestra: ${fetchError.message}`)
    }

    console.log(`[v0] Analizando muestra de ${sampleProducts?.length || 0} productos...`)

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

    const duplicatesInSample = duplicates.reduce((sum, d) => sum + (d.count - 1), 0)

    const estimatedTotalDuplicates = Math.round((duplicatesInSample / 30000) * (totalProducts || 0))

    console.log(`[v0] SKUs duplicados en muestra: ${duplicates.length}`)
    console.log(`[v0] Productos duplicados estimados: ${estimatedTotalDuplicates}`)

    const corruptedTitles =
      sampleProducts
        ?.filter((p: any) => {
          if (!p.title || p.title.trim() === "") return true
          if (/^\d+(\.\d+)?$/.test(p.title.trim())) return true
          if (p.title.length < 3) return true
          return false
        })
        .slice(0, 50) || []

    console.log(`[v0] Títulos corruptos en muestra: ${corruptedTitles.length}`)

    // 4. Productos por fuente (muestra)
    const sourceCounts: Record<string, number> = {}
    sampleProducts?.forEach((product: any) => {
      const source = product.source || "Sin fuente"
      sourceCounts[source] = (sourceCounts[source] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Distribución por fuentes (muestra):", productsBySource)

    return NextResponse.json({
      success: true,
      totalProducts: totalProducts || 0,
      duplicates: {
        uniqueSkusInSample: duplicates.length,
        duplicatesInSample: duplicatesInSample,
        estimatedTotalDuplicates: estimatedTotalDuplicates,
        examples: duplicates.slice(0, 10),
        note: "Basado en muestra de 30,000 productos",
      },
      corruptedTitles: {
        countInSample: corruptedTitles.length,
        examples: corruptedTitles.slice(0, 20),
        note: "Basado en muestra de 30,000 productos",
      },
      productsBySource,
    })
  } catch (error: any) {
    console.error("[v0] Error en diagnóstico:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al ejecutar diagnóstico",
        stack: error.stack,
      },
      { status: 500 },
    )
  }
}
