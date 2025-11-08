import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sku = searchParams.get("sku")

    if (!sku) {
      return NextResponse.json({ error: "SKU parameter is required" }, { status: 400 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    console.log("[v0] Buscando SKU en base de datos:", sku)

    // Buscar el producto por SKU exacto
    const { data: exactMatch, error: exactError } = await supabase.from("products").select("*").eq("sku", sku).single()

    if (exactError && exactError.code !== "PGRST116") {
      console.error("[v0] Error buscando SKU exacto:", exactError)
    }

    // Buscar productos con SKU similar (case insensitive)
    const { data: similarMatches, error: similarError } = await supabase
      .from("products")
      .select("*")
      .ilike("sku", `%${sku}%`)
      .limit(10)

    if (similarError) {
      console.error("[v0] Error buscando SKUs similares:", similarError)
    }

    // Contar total de productos en la base de datos
    const { count: totalCount, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })

    if (countError) {
      console.error("[v0] Error contando productos:", countError)
    }

    const result = {
      sku: sku,
      exactMatch: exactMatch || null,
      similarMatches: similarMatches || [],
      totalProductsInDB: totalCount || 0,
      found: !!exactMatch,
      message: exactMatch
        ? "✅ Producto encontrado en la base de datos"
        : similarMatches && similarMatches.length > 0
          ? `⚠️ No se encontró coincidencia exacta, pero hay ${similarMatches.length} productos con SKU similar`
          : "❌ Producto NO encontrado en la base de datos",
    }

    console.log("[v0] Resultado de búsqueda:", result)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error en verificación de SKU:", error)
    return NextResponse.json(
      { error: "Error al verificar SKU", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
