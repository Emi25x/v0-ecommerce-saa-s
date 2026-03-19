import { createClient } from "@/lib/db/server"
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
      return NextResponse.json(
        {
          error: "account_id, ml_item_id y product_id son requeridos",
        },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // Usar función RPC atómica para el match (valida y actualiza ambas tablas en una transacción)
    const { data: result, error: rpcError } = await supabase.rpc("manual_match_publication", {
      p_account_id: account_id,
      p_ml_item_id: ml_item_id,
      p_product_id: product_id,
      p_user_id: null, // TODO: agregar user_id cuando se implemente auth
    })

    if (rpcError) {
      console.error("[v0] Error calling manual_match_publication:", rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    // La función RPC retorna { success: boolean, error?: string, message?: string }
    if (!result?.success) {
      return NextResponse.json(
        {
          error: result?.error || "Error desconocido al crear match",
        },
        { status: 400 },
      )
    }

    // Obtener datos para respuesta
    const { data: publication } = await supabase
      .from("ml_publications")
      .select("ml_item_id, title")
      .eq("account_id", account_id)
      .eq("ml_item_id", ml_item_id)
      .single()

    const { data: product } = await supabase.from("products").select("id, sku, title").eq("id", product_id).single()

    return NextResponse.json({
      success: true,
      message: result.message || "Match creado correctamente",
      match: {
        publication: {
          ml_item_id: publication?.ml_item_id,
          title: publication?.title,
        },
        product: {
          id: product?.id,
          sku: product?.sku,
          title: product?.title,
        },
      },
    })
  } catch (error: any) {
    console.error("[v0] Manual match error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
