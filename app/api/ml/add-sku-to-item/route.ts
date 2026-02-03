import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Intenta agregar seller_sku a un item existente
// ML no permite modificar seller_sku directamente, pero podemos intentar via seller_custom_field
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id, ml_item_id, ean } = await request.json()

    if (!account_id || !ml_item_id || !ean) {
      return NextResponse.json({ 
        error: "account_id, ml_item_id y ean son requeridos" 
      }, { status: 400 })
    }

    // Obtener cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    const accessToken = account.access_token

    // Primero obtener info del item
    const itemResponse = await fetch(
      `https://api.mercadolibre.com/items/${ml_item_id}`,
      {
        headers: { "Authorization": `Bearer ${accessToken}` }
      }
    )

    if (!itemResponse.ok) {
      const error = await itemResponse.json()
      return NextResponse.json({ 
        error: `Error obteniendo item: ${error.message}`,
        details: error
      }, { status: 400 })
    }

    const item = await itemResponse.json()
    
    console.log(`[v0] Item ${ml_item_id} - seller_sku actual: ${item.seller_sku}, variations: ${item.variations?.length || 0}`)

    // Intentar varias formas de agregar el SKU

    // 1. Intentar con seller_custom_field (a veces funciona)
    const updateResponse = await fetch(
      `https://api.mercadolibre.com/items/${ml_item_id}`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          seller_custom_field: ean
        })
      }
    )

    const updateResult = await updateResponse.json()
    
    if (updateResponse.ok) {
      return NextResponse.json({
        success: true,
        method: "seller_custom_field",
        message: `seller_custom_field actualizado a ${ean}`,
        item_id: ml_item_id
      })
    }

    console.log(`[v0] seller_custom_field falló:`, updateResult)

    // 2. Si tiene variaciones, intentar actualizar el seller_sku de la variación
    if (item.variations && item.variations.length > 0) {
      const variationId = item.variations[0].id
      
      const varResponse = await fetch(
        `https://api.mercadolibre.com/items/${ml_item_id}/variations/${variationId}`,
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            seller_sku: ean
          })
        }
      )

      const varResult = await varResponse.json()
      
      if (varResponse.ok) {
        return NextResponse.json({
          success: true,
          method: "variation_seller_sku",
          message: `seller_sku de variación actualizado a ${ean}`,
          item_id: ml_item_id,
          variation_id: variationId
        })
      }

      console.log(`[v0] variation seller_sku falló:`, varResult)
    }

    // 3. Si nada funcionó, devolver el error
    return NextResponse.json({
      success: false,
      error: "No se pudo agregar el SKU",
      details: updateResult,
      item_info: {
        id: item.id,
        title: item.title,
        current_seller_sku: item.seller_sku,
        current_seller_custom_field: item.seller_custom_field,
        has_variations: item.variations?.length > 0
      }
    })

  } catch (error) {
    console.error("Error en add-sku-to-item:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
