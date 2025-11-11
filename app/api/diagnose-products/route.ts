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

    // 2. Detectar duplicados usando RPC (función SQL en Supabase)
    // Como alternativa, obtenemos una muestra y contamos
    const { data: duplicatesData, error: dupError } = await supabase.rpc("find_duplicate_skus", {}).limit(100)

    let duplicatesCount = 0
    let duplicateExamples: any[] = []

    // Si la función RPC no existe, hacemos una consulta alternativa
    if (dupError?.code === "42883") {
      console.log("[v0] RPC no disponible, usando consulta alternativa para duplicados...")
      // Consulta limitada de productos para análisis
      const { data: sampleProducts, error: sampleError } = await supabase.from("products").select("sku").limit(10000)

      if (!sampleError && sampleProducts) {
        const skuMap = new Map<string, number>()
        sampleProducts.forEach((p: any) => {
          const normalizedSKU = (p.sku || "").toString().trim().toUpperCase().replace(/\s+/g, "")
          if (normalizedSKU) {
            skuMap.set(normalizedSKU, (skuMap.get(normalizedSKU) || 0) + 1)
          }
        })

        duplicatesCount = Array.from(skuMap.values()).filter((count) => count > 1).length
        duplicateExamples = Array.from(skuMap.entries())
          .filter(([_, count]) => count > 1)
          .slice(0, 10)
          .map(([sku, count]) => ({ sku, count }))

        console.log("[v0] Duplicados en muestra de 10k:", duplicatesCount)
      }
    } else if (!dupError) {
      duplicatesCount = duplicatesData?.length || 0
      duplicateExamples = duplicatesData?.slice(0, 10) || []
    }

    // 3. Títulos corruptos (muestra)
    const { data: corruptedTitles, error: corruptError } = await supabase
      .from("products")
      .select("id, sku, title, source")
      .or("title.is.null,title.eq.")
      .limit(50)

    console.log("[v0] Títulos vacíos encontrados:", corruptedTitles?.length || 0)

    // También buscar títulos que son solo números
    const { data: numericTitles, error: numericError } = await supabase
      .from("products")
      .select("id, sku, title, source")
      .like("title", "[0-9]%")
      .limit(50)

    const allCorrupted = [...(corruptedTitles || []), ...(numericTitles || [])]
    console.log("[v0] Total títulos corruptos (muestra):", allCorrupted.length)

    // 4. Productos por fuente
    const { data: sourceStats, error: sourceError } = await supabase.from("products").select("source").limit(5000) // Muestra representativa

    const sourceCounts: Record<string, number> = {}
    sourceStats?.forEach((product: any) => {
      const source = Array.isArray(product.source) ? product.source.join(", ") : product.source || "Sin fuente"
      sourceCounts[source] = (sourceCounts[source] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Fuentes encontradas:", productsBySource.length)

    return NextResponse.json({
      success: true,
      totalProducts: totalProducts || 0,
      duplicatesCount,
      duplicateExamples,
      corruptedTitlesCount: allCorrupted.length,
      corruptedTitles: allCorrupted.slice(0, 20),
      productsBySource,
      note: "Los contadores de duplicados y fuentes se basan en muestras representativas para optimizar el rendimiento",
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
