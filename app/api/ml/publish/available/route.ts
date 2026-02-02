import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Obtener IDs de productos ya publicados en ML
    const { data: publishedProducts } = await supabase
      .from("ml_publications")
      .select("product_id")
    
    const publishedIds = new Set((publishedProducts || []).map(p => p.product_id))

    // Obtener todos los productos con cost_price
    const { data: allProducts, error } = await supabase
      .from("products")
      .select(`
        id,
        ean,
        title,
        cost_price,
        price,
        stock,
        brand,
        image_url
      `)
      .gt("cost_price", 0)
      .order("title")
      .limit(1000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtrar los que no estan publicados
    const availableProducts = (allProducts || []).filter(p => !publishedIds.has(p.id))

    return NextResponse.json({ 
      products: availableProducts,
      total: availableProducts.length,
      published_count: publishedIds.size
    })
  } catch (error) {
    console.error("Error fetching available products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
