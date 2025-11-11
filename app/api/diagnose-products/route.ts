import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    console.log("[v0] Iniciando diagnóstico de productos...")

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

    const { count: totalProducts, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error al contar productos:", countError)
      throw new Error(`Error al contar productos: ${countError.message}`)
    }

    console.log("[v0] Total productos:", totalProducts)

    // Primero intentamos con una consulta que agrupe por SKU
    const { data: allProducts, error: productsError } = await supabase
      .from("products")
      .select("id, sku, title, price, stock, source, created_at")
      .order("sku")

    if (productsError) {
      console.error("[v0] Error al obtener productos:", productsError)
      throw new Error(`Error al obtener productos: ${productsError.message}`)
    }

    console.log("[v0] Productos obtenidos:", allProducts?.length || 0)

    const skuMap = new Map<string, any[]>()
    allProducts?.forEach((product: any) => {
      // Normalizar SKU: trim, uppercase, sin espacios
      const normalizedSKU = (product.sku || "").toString().trim().toUpperCase().replace(/\s+/g, "")
      const existing = skuMap.get(normalizedSKU) || []
      existing.push(product)
      skuMap.set(normalizedSKU, existing)
    })

    // Solo SKUs que tienen más de un producto
    const duplicates = Array.from(skuMap.entries())
      .filter(([_, products]) => products.length > 1)
      .map(([sku, products]) => ({
        sku,
        count: products.length,
        products: products.slice(0, 3), // Solo primeros 3 para no saturar
      }))

    console.log("[v0] Duplicados encontrados:", duplicates.length)

    const corruptedTitles = allProducts?.filter((product: any) => {
      const title = product.title || ""
      return (
        title.length === 0 ||
        /^\d+$/.test(title) || // Solo números
        /^\d+[.,]\d+$/.test(title) || // Decimales (precio)
        title.length < 3 // Muy cortos
      )
    })

    console.log("[v0] Títulos corruptos:", corruptedTitles?.length || 0)

    const sourceCounts: Record<string, number> = {}
    allProducts?.forEach((product: any) => {
      const source = Array.isArray(product.source) ? product.source.join(", ") : product.source || "Sin fuente"
      sourceCounts[source] = (sourceCounts[source] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    console.log("[v0] Productos por fuente:", productsBySource)

    return NextResponse.json({
      success: true,
      totalProducts: totalProducts || 0,
      duplicatesCount: duplicates.length,
      duplicates: duplicates.slice(0, 10), // Solo primeros 10
      corruptedTitlesCount: corruptedTitles?.length || 0,
      corruptedTitles: corruptedTitles?.slice(0, 20) || [],
      productsBySource,
    })
  } catch (error: any) {
    console.error("[v0] Error en diagnóstico:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error desconocido al ejecutar diagnóstico",
      },
      { status: 500 },
    )
  }
}
