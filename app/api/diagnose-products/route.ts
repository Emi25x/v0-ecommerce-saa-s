import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET() {
  try {
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

    // Contar productos totales
    const { count: totalProducts } = await supabase.from("products").select("*", { count: "exact", head: true })

    // Buscar todos los productos para análisis
    const { data: allProducts, error: productsError } = await supabase
      .from("products")
      .select("sku, title, price, stock, source")
      .order("sku")

    if (productsError) {
      throw new Error(`Error al obtener productos: ${productsError.message}`)
    }

    // Analizar duplicados por SKU
    const skuMap = new Map()
    allProducts?.forEach((product: any) => {
      const existing = skuMap.get(product.sku) || []
      existing.push(product)
      skuMap.set(product.sku, existing)
    })

    const duplicateSKUs = Array.from(skuMap.entries())
      .filter(([_, products]) => products.length > 1)
      .map(([sku]) => sku)

    // Buscar productos con títulos corruptos (solo números o precios)
    const corruptedTitles = allProducts?.filter((product: any) => {
      const title = product.title || ""
      // Detectar si el título es solo números, decimales o está vacío
      return (
        title.length === 0 ||
        /^\d+$/.test(title) || // Solo números
        /^\d+[.,]\d+$/.test(title) || // Números decimales (precio)
        title.length < 3 // Títulos muy cortos
      )
    })

    // Contar productos por fuente
    const sourceCounts: Record<string, number> = {}
    allProducts?.forEach((product: any) => {
      const source = Array.isArray(product.source) ? product.source.join(", ") : product.source || "Sin fuente"
      sourceCounts[source] = (sourceCounts[source] || 0) + 1
    })

    const productsBySource = Object.entries(sourceCounts).map(([source, count]) => ({
      source,
      count,
    }))

    return NextResponse.json({
      success: true,
      totalProducts: totalProducts || 0,
      duplicateSKUs: duplicateSKUs,
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
