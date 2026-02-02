import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const showAll = searchParams.get("show_all") === "true"
    const onlyIds = searchParams.get("only_ids") === "true" // Para selección masiva
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("page_size") || "100") // Default 100 para UI

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

    // Si solo necesitamos IDs (para selección masiva), hacemos query más liviana
    if (onlyIds) {
      // Traer solo IDs en lotes de 1000 para evitar timeout
      const allIds: string[] = []
      let offset = 0
      const batchSize = 1000
      let hasMore = true
      
      while (hasMore) {
        const { data: batch } = await supabase
          .from("products")
          .select("id")
          .gt("cost_price", 0)
          .range(offset, offset + batchSize - 1)
        
        if (!batch || batch.length === 0) {
          hasMore = false
        } else {
          allIds.push(...batch.map(p => p.id))
          offset += batchSize
          if (batch.length < batchSize) hasMore = false
        }
      }
      
      // Filtrar por publicados si es necesario
      const filteredIds = showAll 
        ? allIds 
        : allIds.filter(id => !allPublishedIds.has(id))
      
      return NextResponse.json({
        ids: filteredIds,
        total: filteredIds.length,
        published_count: allPublishedIds.size
      })
    }

    // Query normal paginada para mostrar en UI
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
      resultProducts = resultProducts.filter(p => !allPublishedIds.has(p.id))
    }

    // Marcar cuales estan publicados
    const productsWithStatus = resultProducts.map(p => ({
      ...p,
      is_published: allPublishedIds.has(p.id)
    }))

    // Calcular total de productos sin publicar (aproximado basado en count - published)
    const totalInDb = count || 0
    const unpublishedCount = Math.max(0, totalInDb - allPublishedIds.size)

    return NextResponse.json({ 
      products: productsWithStatus,
      total: productsWithStatus.length,
      total_in_db: totalInDb,
      published_count: allPublishedIds.size,
      unpublished_count: unpublishedCount,
      page,
      page_size: pageSize,
      show_all: showAll,
      has_more: (page * pageSize) < totalInDb
    })
  } catch (error) {
    console.error("Error fetching available products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
