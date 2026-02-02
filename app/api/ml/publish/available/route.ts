import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

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

    // Obtener productos con cost_price (sin ordenar para evitar timeout)
    const { data: allProducts, error } = await supabase
      .from("products")
      .select("id, ean, title, cost_price, price, stock, brand, image_url, language")
      .gt("cost_price", 0)
      .limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtrar los que no estan publicados (por product_id)
    const availableProducts = (allProducts || []).filter(p => !allPublishedIds.has(p.id))

    console.log("[v0] Products available:", {
      total: allProducts?.length || 0,
      published_in_ml_publications: publishedProductIds.size,
      published_in_ml_listings: publishedListingsProductIds.size,
      available: availableProducts.length
    })

    return NextResponse.json({ 
      products: availableProducts,
      total: availableProducts.length,
      published_count: allPublishedIds.size
    })
  } catch (error) {
    console.error("Error fetching available products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
