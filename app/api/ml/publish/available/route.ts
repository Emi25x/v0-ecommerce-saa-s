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
    const minStock = parseInt(searchParams.get("min_stock") || "5") // Stock mínimo por defecto 5
    const minPrice = parseFloat(searchParams.get("min_price") || "0")
    const maxPrice = parseFloat(searchParams.get("max_price") || "999999")
    const language = searchParams.get("language") || ""
    const brand = searchParams.get("brand") || ""
    const search = searchParams.get("search") || ""
    const excludeIbd = searchParams.get("exclude_ibd") !== "false" // Por defecto excluir IBD

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

    // Si solo necesitamos IDs (para publicación masiva), hacemos query con todos los filtros
    if (onlyIds) {
      const allIds: string[] = []
      let offset = 0
      const batchSize = 1000
      let hasMore = true
      
      while (hasMore) {
        let query = supabase
          .from("products")
          .select("id, cost_price, language, brand, title, ean")
          .gt("cost_price", 0)
          .gte("stock", minStock)
          .gte("cost_price", minPrice)
          .lte("cost_price", maxPrice)
        
        // Filtrar IBD por defecto
        if (excludeIbd) {
          query = query.or("is_ibd.is.null,is_ibd.eq.false")
        }
        
        // Aplicar filtros opcionales
        if (language) {
          query = query.ilike("language", language)
        }
        if (brand) {
          query = query.ilike("brand", `%${brand}%`)
        }
        if (search) {
          query = query.or(`title.ilike.%${search}%,ean.ilike.%${search}%`)
        }
        
        const { data: batch } = await query.range(offset, offset + batchSize - 1)
        
        if (!batch || batch.length === 0) {
          hasMore = false
        } else {
          // Filtrar por no publicados si es necesario
          const batchIds = showAll 
            ? batch.map(p => p.id)
            : batch.filter(p => !allPublishedIds.has(p.id)).map(p => p.id)
          allIds.push(...batchIds)
          offset += batchSize
          if (batch.length < batchSize) hasMore = false
        }
      }
      
      return NextResponse.json({
        ids: allIds,
        total: allIds.length,
        published_count: allPublishedIds.size
      })
    }

    // Query normal paginada para mostrar en UI
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    
    let query = supabase
      .from("products")
      .select("id, ean, title, cost_price, price, stock, brand, image_url, language, is_ibd")
      .gt("cost_price", 0)
      .gte("stock", minStock)
      .gte("cost_price", minPrice)
      .lte("cost_price", maxPrice)
    
    // Filtrar IBD por defecto
    if (excludeIbd) {
      query = query.or("is_ibd.is.null,is_ibd.eq.false")
    }
    
    // Aplicar filtros opcionales
    if (language) {
      query = query.ilike("language", language)
    }
    if (brand) {
      query = query.ilike("brand", `%${brand}%`)
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,ean.ilike.%${search}%`)
    }
    
    const { data: allProducts, error } = await query.range(from, to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtrar segun el parametro show_all (por defecto solo NO publicados)
    let resultProducts = allProducts || []
    if (!showAll) {
      resultProducts = resultProducts.filter(p => !allPublishedIds.has(p.id))
    }

    // Marcar cuales estan publicados
    const productsWithStatus = resultProducts.map(p => ({
      ...p,
      is_published: allPublishedIds.has(p.id)
    }))

    // has_more basado en si obtuvimos el máximo de resultados
    const hasMore = (allProducts?.length || 0) >= pageSize

    return NextResponse.json({ 
      products: productsWithStatus,
      total: productsWithStatus.length,
      published_count: allPublishedIds.size,
      page,
      page_size: pageSize,
      min_stock: minStock,
      show_all: showAll,
      has_more: hasMore
    })
  } catch (error) {
    console.error("Error fetching available products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
