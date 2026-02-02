import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Obtener productos que tienen cost_price y no estan publicados en ML
    const { data: products, error } = await supabase
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
      .not("id", "in", `(SELECT product_id FROM ml_publications WHERE product_id IS NOT NULL)`)
      .order("title")
      .limit(500)

    if (error) {
      // Si la subquery falla (tabla no existe), obtener todos los productos con cost_price
      const { data: allProducts, error: fallbackError } = await supabase
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
        .limit(500)

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 })
      }

      return NextResponse.json({ products: allProducts || [] })
    }

    return NextResponse.json({ products: products || [] })
  } catch (error) {
    console.error("Error fetching available products:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
