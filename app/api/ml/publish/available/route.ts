import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Obtener IDs de productos ya publicados en ML (puede fallar si tabla no existe)
    let publishedIds = new Set<string>()
    try {
      const { data: publishedProducts } = await supabase
        .from("ml_publications")
        .select("product_id")
      publishedIds = new Set((publishedProducts || []).map(p => p.product_id))
    } catch {
      // Tabla puede no existir aun, continuar sin filtrar
    }

    // Obtener productos con cost_price (sin ordenar para evitar timeout)
    const { data: allProducts, error } = await supabase
      .from("products")
      .select("id, ean, title, cost_price, price, stock, brand, image_url, language")
      .gt("cost_price", 0)
      .limit(500)

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
