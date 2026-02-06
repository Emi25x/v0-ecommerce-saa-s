import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * POST /api/ml/publications/manual-match
 * Vincula manualmente una publicación ML con un producto interno
 * Body: { account_id, ml_item_id, product_id, matched_value? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { account_id, ml_item_id, product_id, matched_value } = body

    if (!account_id || !ml_item_id || !product_id) {
      return NextResponse.json({ 
        error: "account_id, ml_item_id y product_id son requeridos" 
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Validar que el producto existe
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, sku, title")
      .eq("id", product_id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ 
        error: "Producto no encontrado" 
      }, { status: 404 })
    }

    // Validar que la publicación existe
    const { data: publication, error: pubError } = await supabase
      .from("ml_publications")
      .select("id, ml_item_id, title")
      .eq("account_id", account_id)
      .eq("ml_item_id", ml_item_id)
      .single()

    if (pubError || !publication) {
      return NextResponse.json({ 
        error: "Publicación no encontrada" 
      }, { status: 404 })
    }

    // Crear el match manual
    const { error: matchError } = await supabase
      .from("ml_publication_matches")
      .upsert({
        account_id,
        ml_item_id,
        product_id,
        matched_by: 'manual',
        matched_value: matched_value || null,
        matched_at: new Date().toISOString()
      }, {
        onConflict: "account_id,ml_item_id"
      })

    if (matchError) {
      console.error("[v0] Error creating match:", matchError)
      return NextResponse.json({ error: matchError.message }, { status: 500 })
    }

    // Actualizar ml_publications con el product_id y matched_by
    const { error: updateError } = await supabase
      .from("ml_publications")
      .update({
        product_id,
        matched_by: 'manual',
        updated_at: new Date().toISOString()
      })
      .eq("account_id", account_id)
      .eq("ml_item_id", ml_item_id)

    if (updateError) {
      console.error("[v0] Error updating publication:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Match creado correctamente",
      match: {
        publication: {
          ml_item_id: publication.ml_item_id,
          title: publication.title
        },
        product: {
          id: product.id,
          sku: product.sku,
          title: product.title
        }
      }
    })
  } catch (error: any) {
    console.error("[v0] Manual match error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
