import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/products/search
 * Busca productos por SKU o título
 * Query params: q (query), limit (default 20)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get("q")
    const requestedLimit = parseInt(searchParams.get("limit") || "20")
    const limit = Math.min(requestedLimit, 50) // Máximo 50 resultados

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ 
        error: "Query must be at least 2 characters" 
      }, { status: 400 })
    }

    const supabase = await createClient()
    const query = q.trim()

    // Buscar por SKU (exact), SKU parcial, o título
    const { data: products, error } = await supabase
      .from("products")
      .select("id, sku, title, author, stock, price, image_url")
      .or(`sku.ilike.%${query}%,title.ilike.%${query}%,author.ilike.%${query}%`)
      .limit(limit)

    if (error) {
      console.error("[v0] Product search error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Ordenar: exact match primero, luego por relevancia
    const sorted = products?.sort((a, b) => {
      const aSkuExact = a.sku?.toLowerCase() === query.toLowerCase()
      const bSkuExact = b.sku?.toLowerCase() === query.toLowerCase()
      if (aSkuExact && !bSkuExact) return -1
      if (!aSkuExact && bSkuExact) return 1
      return 0
    })

    return NextResponse.json({ products: sorted || [] })
  } catch (error: any) {
    console.error("[v0] Product search error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
