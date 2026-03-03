import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Ejecuta el opt-in al catálogo de ML para un item existente
// Asocia la publicación tradicional al producto de catálogo y crea la publicación de catálogo
// Ref: POST /items/{item_id}/catalog_listing_opt_in
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await request.json()
    const { account_id, item_id, catalog_product_id } = body

    if (!account_id || !item_id) {
      return NextResponse.json({ error: "account_id e item_id son requeridos" }, { status: 400 })
    }

    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id")
      .eq("id", account_id)
      .single()

    if (!mlAccount) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    const token = mlAccount.access_token

    // Opción 1: opt-in con catalog_product_id conocido
    // Opción 2: opt-in automático (ML busca el producto por el ítem)
    const payload: any = {}
    if (catalog_product_id) {
      payload.catalog_product_id = catalog_product_id
    }

    const optinRes = await fetch(
      `https://api.mercadolibre.com/items/${item_id}/catalog_listing_opt_in`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    )

    const optinData = await optinRes.json()

    if (!optinRes.ok) {
      return NextResponse.json({
        ok:    false,
        error: optinData.message || optinData.error || `Error ${optinRes.status}`,
        details: optinData,
      }, { status: optinRes.status })
    }

    return NextResponse.json({
      ok:      true,
      message: "Opt-in al catálogo realizado correctamente",
      data:    optinData,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
