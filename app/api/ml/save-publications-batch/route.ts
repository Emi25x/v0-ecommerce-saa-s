import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { publications } = await request.json()

    console.log(`[v0] Guardando ${publications.length} publicaciones...`)

    let saved = 0
    let updated = 0
    let linked = 0

    for (const pub of publications) {
      try {
        // Buscar producto por SKU/EAN
        let product_id = null
        if (pub.SELLER_SKU) {
          const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("ean", pub.SELLER_SKU)
            .maybeSingle()
          
          if (product) {
            product_id = product.id
            linked++
          }
        }

        // Verificar si existe
        const { data: existing } = await supabase
          .from("ml_publications")
          .select("id")
          .eq("ml_item_id", pub.id)
          .maybeSingle()

        const pubData = {
          account_id: pub.account_id,
          ml_item_id: pub.id,
          product_id,
          title: pub.title,
          price: pub.price,
          current_stock: pub.available_quantity || 0,
          status: pub.status,
          permalink: pub.permalink,
          updated_at: new Date().toISOString()
        }

        if (existing) {
          await supabase
            .from("ml_publications")
            .update(pubData)
            .eq("id", existing.id)
          updated++
        } else {
          await supabase
            .from("ml_publications")
            .insert(pubData)
          saved++
        }
      } catch (error) {
        console.error("[v0] Error guardando publicación:", error)
      }
    }

    return NextResponse.json({
      success: true,
      saved,
      updated,
      linked,
      total: publications.length
    })

  } catch (error) {
    console.error("[v0] Error en save-publications-batch:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    )
  }
}
