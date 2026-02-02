import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const showAll = searchParams.get("show_all") === "true"
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("page_size") || "10000") // Por defecto traer todos

    // Obtener IDs de productos ya publicados en ml_publications
    let publishedProductIds = new Set<string>()
    try {
      const { data: publishedProducts } = await supabase
        .from("ml_publications")
        .select("product_id")
      publishedProductIds = new Set((publishedProducts || []).filter(p => p.product_id).map(p => p.product_id))
    } catch {
      // Tabla puede no existir aun
    }

    // Tambien verificar ml_listings (otra tabla de publicaciones)
    let publishedListingsProductIds = new Set<string>()
    try {
      const { data: listings } = await supabase
        .from("ml_listings")
        .select("product_id")
      publishedListingsProductIds = new Set((listings || []).filter(l => l.product_id).map(l => l.product_id))
    } catch {
      // Tabla puede no existir
    }

    // Combinar ambos sets
    const allPublishedIds = new Set([...publishedProductIds, ...publishedListingsProductIds])

    // Obtener TODOS los productos con cost_price (paginado para evitar timeout)
    // Usamos rango para paginacion eficiente
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data: allProducts, error, count } = await supabase
      .from("products")
      .select("id, ean, title, cost_price, price, stock, brand, image_url, language", { count: "exact" })
      .gt("cost_price", 0)
      .range(from, to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtrar segun el parametro show_all
    let resultProducts = allProducts || []
    if (!showAll) {
      // Por defecto, solo mostrar los NO publicados
      resultProducts = resultProducts.filter(p => !allPublishedIds.has(p.id))
    }

    // Marcar cuales estan publicados (para mostrar en UI)
    const productsWithStatus = resultProducts.map(p => ({
      ...p,
      is_published: allPublishedIds.has(p.id)
    }))

    return NextResponse.json({ 
      products: productsWithStatus,
      total: productsWithStatus.length,
      total_in_db: count || 0,
      published_count: allPublishedIds.size,
      page,
      page_size: pageSize,
      show_all: showAll
    })
  } catch (error) {
    console.error("Error fetching available products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
