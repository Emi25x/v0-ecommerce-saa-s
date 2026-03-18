import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { getValidAccessToken } from "@/lib/mercadolibre"

const ML_API_BASE = "https://api.mercadolibre.com"

export async function POST(request: NextRequest) {
  try {
    const { item_id, account_id } = await request.json()

    if (!item_id || !account_id) {
      return NextResponse.json({ error: "item_id y account_id son requeridos" }, { status: 400 })
    }

    const supabase = await createClient()

    // Obtener cuenta de ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    const accessToken = await getValidAccessToken(account.ml_user_id)

    // Obtener datos completos de la publicación de ML
    const itemResponse = await fetch(
      `${ML_API_BASE}/items/${item_id}?include_attributes=all`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!itemResponse.ok) {
      return NextResponse.json({ error: "Error al obtener publicación de ML" }, { status: 400 })
    }

    const mlItem = await itemResponse.json()

    // Obtener descripción
    let description = ""
    try {
      const descResponse = await fetch(
        `${ML_API_BASE}/items/${item_id}/description`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (descResponse.ok) {
        const descData = await descResponse.json()
        description = descData.plain_text || descData.text || ""
      }
    } catch (e) {
      console.log("[v0] No se pudo obtener descripción")
    }

    // Buscar el EAN/ISBN en los atributos de ML
    let ean = mlItem.seller_custom_field // El SKU en ML es el EAN
    
    // También buscar en atributos
    if (!ean && mlItem.attributes) {
      const eanAttr = mlItem.attributes.find(
        (attr: any) => attr.id === "GTIN" || attr.id === "ISBN" || attr.id === "EAN" || attr.id === "SELLER_SKU"
      )
      if (eanAttr) {
        ean = eanAttr.value_name || eanAttr.value_id
      }
    }

    // Buscar producto en el catálogo de Arnoia por EAN
    let catalogProduct = null
    if (ean) {
      const { data: product } = await supabase
        .from("products")
        .select("*")
        .eq("ean", ean)
        .single()
      
      catalogProduct = product
    }

    // Extraer atributos de ML organizados
    const mlAttributes: Record<string, any> = {}
    if (mlItem.attributes) {
      for (const attr of mlItem.attributes) {
        mlAttributes[attr.id] = {
          name: attr.name,
          value: attr.value_name || attr.value_id,
          value_id: attr.value_id,
        }
      }
    }

    // Generar mapeo sugerido entre campos del catálogo y atributos de ML
    const suggestedMapping: Record<string, string> = {}
    
    if (catalogProduct) {
      // Mapeos comunes para libros
      if (catalogProduct.author) suggestedMapping["AUTHOR"] = "author"
      if (catalogProduct.brand) suggestedMapping["BRAND"] = "brand"
      if (catalogProduct.language) suggestedMapping["LANGUAGE"] = "language"
      if (catalogProduct.pages) suggestedMapping["PAGES"] = "pages"
      if (catalogProduct.year_edition) suggestedMapping["PUBLICATION_YEAR"] = "year_edition"
      if (catalogProduct.binding) suggestedMapping["BOOK_COVER_TYPE"] = "binding"
      if (catalogProduct.ean) suggestedMapping["GTIN"] = "ean"
      if (catalogProduct.ean) suggestedMapping["ISBN"] = "ean"
    }

    // Generar plantilla sugerida
    const suggestedTemplate = {
      title_template: catalogProduct 
        ? "{title} - {author}" 
        : mlItem.title,
      listing_type_id: mlItem.listing_type_id,
      condition: mlItem.condition,
      currency_id: mlItem.currency_id,
      price_formula: catalogProduct?.cost_price 
        ? `cost_price * ${(mlItem.price / catalogProduct.cost_price).toFixed(2)}`
        : `price * 1.0`,
      shipping_mode: mlItem.shipping?.mode || "me2",
      free_shipping: mlItem.shipping?.free_shipping || false,
      local_pick_up: mlItem.shipping?.local_pick_up || false,
      warranty: mlItem.warranty || "30 días de garantía",
      attribute_mapping: suggestedMapping,
    }

    return NextResponse.json({
      success: true,
      ml_item: {
        id: mlItem.id,
        title: mlItem.title,
        price: mlItem.price,
        currency_id: mlItem.currency_id,
        condition: mlItem.condition,
        listing_type_id: mlItem.listing_type_id,
        category_id: mlItem.category_id,
        available_quantity: mlItem.available_quantity,
        sold_quantity: mlItem.sold_quantity,
        permalink: mlItem.permalink,
        thumbnail: mlItem.thumbnail,
        pictures: mlItem.pictures,
        shipping: mlItem.shipping,
        warranty: mlItem.warranty,
        seller_custom_field: mlItem.seller_custom_field,
        attributes: mlAttributes,
        description: description,
        tags: mlItem.tags,
        catalog_product_id: mlItem.catalog_product_id,
        catalog_listing: mlItem.catalog_listing,
      },
      catalog_product: catalogProduct,
      ean_found: ean,
      suggested_template: suggestedTemplate,
    })
  } catch (error) {
    console.error("[v0] Error analyzing listing:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
