import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("[v0] Webhook ML recibido:", JSON.stringify(body))

    // Validar estructura del webhook
    if (!body.topic || !body.resource) {
      console.log("[v0] Webhook inválido, falta topic o resource")
      return NextResponse.json({ success: true }) // ML espera 200 siempre
    }

    const { topic, resource } = body

    // Solo procesar notificaciones de items
    if (!topic.startsWith("items")) {
      console.log("[v0] Topic ignorado:", topic)
      return NextResponse.json({ success: true })
    }

    // Extraer item_id del resource (/items/MLA123456)
    const itemIdMatch = resource.match(/\/items\/([A-Z0-9]+)/)
    if (!itemIdMatch) {
      console.log("[v0] No se pudo extraer item_id de:", resource)
      return NextResponse.json({ success: true })
    }

    const itemId = itemIdMatch[1]
    console.log("[v0] Procesando cambio en item:", itemId)

    const supabase = await createClient()

    // Buscar la cuenta asociada a este item
    const { data: publication } = await supabase
      .from("ml_publications")
      .select("account_id, ml_accounts(access_token)")
      .eq("ml_item_id", itemId)
      .single()

    if (!publication || !publication.ml_accounts) {
      console.log("[v0] No se encontró cuenta para item:", itemId)
      return NextResponse.json({ success: true })
    }

    const accessToken = (publication.ml_accounts as any).access_token

    // Obtener detalles completos del item de ML
    const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!itemResponse.ok) {
      console.error("[v0] Error obteniendo item de ML:", itemResponse.status)
      return NextResponse.json({ success: true })
    }

    const itemData = await itemResponse.json()
    console.log("[v0] Item obtenido de ML:", itemId)

    // Extraer SKU/GTIN/ISBN
    let sku = itemData.seller_custom_field || ""
    if (!sku && itemData.attributes) {
      const skuAttr = itemData.attributes.find((attr: any) => 
        attr.id === 'SELLER_SKU' || attr.id === 'ISBN' || attr.id === 'GTIN' || attr.id === 'EAN'
      )
      if (skuAttr) {
        sku = skuAttr.value_name || ""
      }
    }

    // Buscar product_id por SKU
    let productId = null
    if (sku) {
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("ean", sku)
        .maybeSingle()
      
      productId = product?.id || null
    }

    // Actualizar publicación
    const { error } = await supabase
      .from("ml_publications")
      .update({
        product_id: productId,
        title: itemData.title,
        price: itemData.price,
        current_stock: itemData.available_quantity,
        status: itemData.status,
        permalink: itemData.permalink,
        updated_at: new Date().toISOString()
      })
      .eq("ml_item_id", itemId)

    if (error) {
      console.error("[v0] Error actualizando publicación:", error)
    } else {
      console.log("[v0] Publicación actualizada:", itemId, productId ? `vinculada a producto ${productId}` : "sin vincular")
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error("[v0] Error en webhook ML:", error)
    // Siempre retornar 200 para que ML no reintente
    return NextResponse.json({ success: true })
  }
}

// GET para verificación de webhook
export async function GET() {
  return NextResponse.json({ 
    message: "Webhook ML endpoint",
    status: "active" 
  })
}
