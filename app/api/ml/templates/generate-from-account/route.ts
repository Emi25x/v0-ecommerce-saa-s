import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Este endpoint analiza publicaciones reales de ML y crea una plantilla basada en ellas
export async function POST() {
  try {
    const supabase = await createClient()
    
    // 1. Obtener cuenta de ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .single()
    
    if (accountError || !account) {
      return NextResponse.json({ error: "No hay cuenta de ML conectada" }, { status: 400 })
    }
    
    // 2. Obtener publicaciones activas
    const itemsResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=50`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    )
    const itemsData = await itemsResponse.json()
    
    if (!itemsData.results || itemsData.results.length === 0) {
      return NextResponse.json({ error: "No hay publicaciones activas" }, { status: 400 })
    }
    
    console.log(`[v0] Encontradas ${itemsData.results.length} publicaciones activas`)
    
    // 3. Obtener detalles de las primeras publicaciones
    const itemIds = itemsData.results.slice(0, 20).join(",")
    const detailsResponse = await fetch(
      `https://api.mercadolibre.com/items?ids=${itemIds}`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    )
    const detailsData = await detailsResponse.json()
    
    // 4. Analizar cada publicación y buscar coincidencias con el catálogo
    const analysisResults: any[] = []
    
    for (const itemWrapper of detailsData) {
      if (itemWrapper.code !== 200) continue
      const item = itemWrapper.body
      
      // Buscar EAN en el SKU de ML o en atributos
      let ean = item.seller_custom_field || null
      
      // Buscar en atributos
      const eanAttr = item.attributes?.find((a: any) => 
        a.id === "GTIN" || a.id === "EAN" || a.id === "ISBN"
      )
      if (eanAttr?.value_name) {
        ean = eanAttr.value_name
      }
      
      if (!ean) continue
      
      // Buscar producto en catálogo por EAN
      const { data: product } = await supabase
        .from("products")
        .select("*")
        .eq("ean", ean)
        .single()
      
      if (!product) continue
      
      // Obtener descripción de la publicación
      const descResponse = await fetch(
        `https://api.mercadolibre.com/items/${item.id}/description`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      )
      const descData = await descResponse.json()
      
      analysisResults.push({
        ml_item: {
          id: item.id,
          title: item.title,
          price: item.price,
          currency_id: item.currency_id,
          listing_type_id: item.listing_type_id,
          condition: item.condition,
          shipping: item.shipping,
          warranty: item.warranty,
          attributes: item.attributes,
          description: descData.plain_text || descData.text || "",
          seller_custom_field: item.seller_custom_field,
        },
        catalog_product: product,
        ean: ean
      })
      
      console.log(`[v0] Match encontrado: ML ${item.id} -> Catálogo EAN ${ean}`)
    }
    
    if (analysisResults.length === 0) {
      return NextResponse.json({ 
        error: "No se encontraron coincidencias entre publicaciones de ML y el catálogo",
        hint: "Asegurate de que el SKU de ML contenga el EAN/ISBN del producto"
      }, { status: 400 })
    }
    
    console.log(`[v0] ${analysisResults.length} coincidencias encontradas`)
    
    // 5. Analizar patrones para crear la plantilla
    const firstMatch = analysisResults[0]
    const mlItem = firstMatch.ml_item
    const catalogProduct = firstMatch.catalog_product
    
    // Analizar cómo se genera el título
    let titleTemplate = "{title}"
    if (mlItem.title.includes(catalogProduct.author)) {
      titleTemplate = "{title} - {author}"
    }
    if (mlItem.title.includes(catalogProduct.brand)) {
      titleTemplate = "{title} - {brand}"
    }
    
    // Analizar fórmula de precio
    let priceFormula = "price"
    if (catalogProduct.cost_price && catalogProduct.cost_price > 0) {
      const margin = mlItem.price / catalogProduct.cost_price
      if (margin > 1) {
        priceFormula = `cost_price * ${margin.toFixed(2)}`
      }
    } else if (catalogProduct.price && catalogProduct.price > 0) {
      const margin = mlItem.price / catalogProduct.price
      if (margin > 1) {
        priceFormula = `price * ${margin.toFixed(2)}`
      }
    }
    
    // Analizar descripción para crear template
    let descriptionTemplate = mlItem.description
    
    // Reemplazar datos específicos del producto con variables
    if (catalogProduct.title && descriptionTemplate.includes(catalogProduct.title)) {
      descriptionTemplate = descriptionTemplate.replace(new RegExp(catalogProduct.title, 'gi'), '{title}')
    }
    if (catalogProduct.author && descriptionTemplate.includes(catalogProduct.author)) {
      descriptionTemplate = descriptionTemplate.replace(new RegExp(catalogProduct.author, 'gi'), '{author}')
    }
    if (catalogProduct.brand && descriptionTemplate.includes(catalogProduct.brand)) {
      descriptionTemplate = descriptionTemplate.replace(new RegExp(catalogProduct.brand, 'gi'), '{brand}')
    }
    if (catalogProduct.ean && descriptionTemplate.includes(catalogProduct.ean)) {
      descriptionTemplate = descriptionTemplate.replace(new RegExp(catalogProduct.ean, 'gi'), '{ean}')
    }
    
    // Extraer atributos fijos (que no varían por producto)
    const fixedAttributes = mlItem.attributes?.filter((attr: any) => {
      // Atributos que suelen ser fijos por vendedor
      return ['SELLER_SKU', 'GTIN', 'ISBN'].indexOf(attr.id) === -1
    }).slice(0, 10) || []
    
    // Crear mapeo de atributos del catálogo a ML
    const attributeMapping: Record<string, string> = {
      "GTIN": "ean",
      "ISBN": "ean", 
      "SELLER_SKU": "ean",
      "BOOK_TITLE": "title",
      "AUTHOR": "author",
      "PUBLISHER": "brand",
      "LANGUAGE": "language",
      "PAGES": "pages",
      "BOOK_COVER_TYPE": "binding"
    }
    
    // 6. Crear la plantilla en la base de datos
    const { data: template, error: templateError } = await supabase
      .from("ml_publication_templates")
      .insert({
        account_id: account.id,
        name: "Plantilla Libros (Generada)",
        description: `Plantilla generada automáticamente analizando ${analysisResults.length} publicaciones activas de ML`,
        title_template: titleTemplate,
        listing_type_id: mlItem.listing_type_id || "gold_special",
        condition: mlItem.condition || "new",
        currency_id: mlItem.currency_id || "ARS",
        price_formula: priceFormula,
        shipping_mode: mlItem.shipping?.mode || "me2",
        free_shipping: mlItem.shipping?.free_shipping || false,
        local_pick_up: mlItem.shipping?.local_pick_up || false,
        warranty: mlItem.warranty || "Garantía del vendedor: 30 días",
        description_template: descriptionTemplate,
        fixed_attributes: fixedAttributes,
        attribute_mapping: attributeMapping,
        is_default: true,
        is_active: true
      })
      .select()
      .single()
    
    if (templateError) {
      console.error("[v0] Error creando plantilla:", templateError)
      return NextResponse.json({ error: "Error creando plantilla", details: templateError }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      template,
      analysis: {
        total_items_checked: detailsData.length,
        matches_found: analysisResults.length,
        sample_match: {
          ml_title: mlItem.title,
          catalog_title: catalogProduct.title,
          ml_price: mlItem.price,
          catalog_price: catalogProduct.price,
          catalog_cost: catalogProduct.cost_price,
          price_formula: priceFormula
        }
      }
    })
    
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: "Error interno", details: String(error) }, { status: 500 })
  }
}
