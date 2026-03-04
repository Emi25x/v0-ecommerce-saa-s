import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Flujo correcto de opt-in al catálogo ML (según doc oficial):
// POST /items/catalog_listings con { item_id, catalog_product_id }
// Si el ítem tiene variaciones: incluir variation_id también.
// El catalog_product_id se obtiene del ítem (ya asignado por ML) o se busca por categoría.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await request.json()
    const { account_id, item_id, catalog_product_id, variation_id } = body

    if (!account_id || !item_id) {
      return NextResponse.json({ error: "account_id e item_id son requeridos" }, { status: 400 })
    }

    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id")
      .eq("id", account_id)
      .single()

    if (!mlAccount) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    const token   = mlAccount.access_token
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

    // Paso 1: obtener el catalog_product_id del ítem si no viene en el body
    let productId = catalog_product_id
    if (!productId) {
      const itemRes  = await fetch(
        `https://api.mercadolibre.com/items/${item_id}?attributes=catalog_product_id,variations`,
        { headers }
      )
      if (itemRes.ok) {
        const itemData = await itemRes.json()
        productId = itemData?.catalog_product_id
        // Si no tiene catalog_product_id, no podemos hacer el optin automáticamente
        if (!productId) {
          return NextResponse.json({
            ok:    false,
            error: "El ítem no tiene un catalog_product_id asignado por ML. Buscá el producto en el catálogo y enviá el catalog_product_id manualmente.",
            requires_product_id: true,
          }, { status: 422 })
        }
      }
    }

    // Paso 2: hacer el opt-in con el endpoint correcto (POST /items/catalog_listings)
    const optinBody: any = { item_id, catalog_product_id: productId }
    if (variation_id) optinBody.variation_id = variation_id

    const optinRes  = await fetch(
      "https://api.mercadolibre.com/items/catalog_listings",
      { method: "POST", headers, body: JSON.stringify(optinBody) }
    )
    const optinData = await optinRes.json()

    if (!optinRes.ok) {
      return NextResponse.json({
        ok:      false,
        error:   optinData?.message || optinData?.error || `Error ML ${optinRes.status}`,
        details: optinData,
      }, { status: optinRes.status })
    }

    return NextResponse.json({
      ok:      true,
      message: "Opt-in al catálogo iniciado. La publicación de catálogo fue creada.",
      data:    optinData,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
