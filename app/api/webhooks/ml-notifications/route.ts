import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

const log = createStructuredLogger({ request_id: genRequestId() })

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validar estructura del webhook
    if (!body.topic || !body.resource) {
      log.warn("Invalid webhook payload, missing topic or resource", "ml_notification.validate")
      return NextResponse.json({ success: true }) // ML espera 200 siempre
    }

    const { topic, resource } = body

    // Solo procesar notificaciones de items
    if (!topic.startsWith("items")) {
      log.info("Ignored topic", "ml_notification.skip", { topic })
      return NextResponse.json({ success: true })
    }

    // Extraer item_id del resource (/items/MLA123456)
    const itemIdMatch = resource.match(/\/items\/([A-Z0-9]+)/)
    if (!itemIdMatch) {
      log.warn("Could not extract item_id from resource", "ml_notification.parse", { resource })
      return NextResponse.json({ success: true })
    }

    const itemId = itemIdMatch[1]
    log.info("Processing item change", "ml_notification.process", { item_id: itemId })

    const supabase = await createClient()

    // Buscar la cuenta asociada a este item
    const { data: publication } = await supabase
      .from("ml_publications")
      .select("account_id, ml_accounts(access_token)")
      .eq("ml_item_id", itemId)
      .single()

    if (!publication || !publication.ml_accounts) {
      log.warn("No account found for item", "ml_notification.lookup", { item_id: itemId })
      return NextResponse.json({ success: true })
    }

    const accessToken = (publication.ml_accounts as any).access_token

    // Obtener detalles completos del item de ML
    const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!itemResponse.ok) {
      log.error("Error fetching item from ML", new Error(`HTTP ${itemResponse.status}`), "ml_notification.fetch", {
        item_id: itemId,
        status: itemResponse.status,
      })
      return NextResponse.json({ success: true })
    }

    const itemData = await itemResponse.json()

    // Extraer SKU/GTIN/ISBN
    let sku = itemData.seller_custom_field || ""
    if (!sku && itemData.attributes) {
      const skuAttr = itemData.attributes.find(
        (attr: any) => attr.id === "SELLER_SKU" || attr.id === "ISBN" || attr.id === "GTIN" || attr.id === "EAN",
      )
      if (skuAttr) {
        sku = skuAttr.value_name || ""
      }
    }

    // Buscar product_id por SKU
    let productId = null
    if (sku) {
      const { data: product } = await supabase.from("products").select("id").eq("ean", sku).maybeSingle()

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
        updated_at: new Date().toISOString(),
      })
      .eq("ml_item_id", itemId)

    if (error) {
      log.error("Error updating publication", error, "ml_notification.update", { item_id: itemId })
    } else {
      log.info("Publication updated", "ml_notification.update", {
        item_id: itemId,
        linked: !!productId,
        status: "ok",
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error("Error in ML webhook", error, "ml_notification.fatal")
    // Siempre retornar 200 para que ML no reintente
    return NextResponse.json({ success: true })
  }
}

// GET para verificación de webhook
export async function GET() {
  return NextResponse.json({
    message: "Webhook ML endpoint",
    status: "active",
  })
}
