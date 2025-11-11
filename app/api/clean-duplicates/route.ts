import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Encontrar SKUs duplicados
    const { data: duplicates, error: duplicatesError } = await supabase.rpc("find_duplicate_skus", {})

    if (duplicatesError) {
      // Si la función no existe, usar consulta manual
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("sku, id, created_at, title, source")
        .order("sku")

      if (productsError) throw productsError

      // Agrupar por SKU
      const skuGroups = new Map<string, any[]>()
      products?.forEach((p) => {
        if (!skuGroups.has(p.sku)) {
          skuGroups.set(p.sku, [])
        }
        skuGroups.get(p.sku)!.push(p)
      })

      // Filtrar solo duplicados
      const duplicateSkus = Array.from(skuGroups.entries())
        .filter(([_, products]) => products.length > 1)
        .map(([sku, products]) => ({
          sku,
          count: products.length,
          products: products.map((p) => ({
            id: p.id,
            created_at: p.created_at,
            title: p.title,
            source: p.source,
          })),
        }))

      return NextResponse.json({
        success: true,
        totalDuplicates: duplicateSkus.length,
        duplicates: duplicateSkus.slice(0, 10), // Primeros 10 ejemplos
        message: `Se encontraron ${duplicateSkus.length} SKUs duplicados`,
      })
    }

    return NextResponse.json({
      success: true,
      duplicates: duplicates?.slice(0, 10),
      totalDuplicates: duplicates?.length || 0,
    })
  } catch (error: any) {
    console.error("[v0] Error detecting duplicates:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}

export async function POST() {
  try {
    const supabase = await createClient()

    // Obtener todos los productos ordenados por SKU y fecha de creación
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, sku, created_at")
      .order("sku")
      .order("created_at", { ascending: true }) // Mantener el más antiguo

    if (productsError) throw productsError

    // Agrupar por SKU
    const skuGroups = new Map<string, any[]>()
    products?.forEach((p) => {
      if (!skuGroups.has(p.sku)) {
        skuGroups.set(p.sku, [])
      }
      skuGroups.get(p.sku)!.push(p)
    })

    // Identificar productos a eliminar (mantener solo el primero de cada grupo)
    const toDelete: string[] = []
    skuGroups.forEach((products) => {
      if (products.length > 1) {
        // Mantener el primero (más antiguo), eliminar los demás
        toDelete.push(...products.slice(1).map((p) => p.id))
      }
    })

    if (toDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "No se encontraron duplicados para eliminar",
      })
    }

    // Eliminar productos duplicados
    const { error: deleteError } = await supabase.from("products").delete().in("id", toDelete)

    if (deleteError) throw deleteError

    return NextResponse.json({
      success: true,
      deleted: toDelete.length,
      message: `Se eliminaron ${toDelete.length} productos duplicados`,
    })
  } catch (error: any) {
    console.error("[v0] Error cleaning duplicates:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
