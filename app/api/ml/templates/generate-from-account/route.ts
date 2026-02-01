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
    
    // Verificar y refrescar token si está expirado
    let accessToken = account.access_token
    const expiresAt = new Date(account.token_expires_at)
    if (expiresAt < new Date() && account.refresh_token) {
      console.log("[v0] Token expirado, refrescando...")
      const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.MERCADOLIBRE_CLIENT_ID!,
          client_secret: process.env.MERCADOLIBRE_CLIENT_SECRET!,
          refresh_token: account.refresh_token,
        }),
      })
      
      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json()
        accessToken = tokens.access_token
        await supabase.from("ml_accounts").update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        }).eq("id", account.id)
        console.log("[v0] Token refrescado")
      }
    }
    
    // 2. Obtener publicaciones activas
    const itemsResponse = await fetch(
      `https://api.mercadolibre.com/users/${account.ml_user_id}/items/search?status=active&limit=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
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
      { headers: { Authorization: `Bearer ${accessToken}` } }
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
        { headers: { Authorization: `Bearer ${accessToken}` } }
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
    
    // Calcular margen PROMEDIO de todas las coincidencias
    const margins: number[] = []
    const marginDetails: any[] = []
    
    for (const match of analysisResults) {
      const mlPrice = match.ml_item.price
      const costPrice = match.catalog_product.cost_price
      const catalogPrice = match.catalog_product.price
      
      if (costPrice && costPrice > 0) {
        const margin = mlPrice / costPrice
        margins.push(margin)
        marginDetails.push({
          ean: match.ean,
          ml_price: mlPrice,
          cost_price: costPrice,
          margin: margin.toFixed(2)
        })
        console.log(`[v0] Margen ${match.ean}: ML $${mlPrice} / Costo $${costPrice} = ${margin.toFixed(2)}x`)
      } else if (catalogPrice && catalogPrice > 0) {
        const margin = mlPrice / catalogPrice
        margins.push(margin)
        marginDetails.push({
          ean: match.ean,
          ml_price: mlPrice,
          catalog_price: catalogPrice,
          margin: margin.toFixed(2)
        })
        console.log(`[v0] Margen ${match.ean}: ML $${mlPrice} / Precio $${catalogPrice} = ${margin.toFixed(2)}x`)
      }
    }
    
    // Calcular margen promedio
    let priceFormula = "price"
    let avgMargin = 1
    if (margins.length > 0) {
      avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length
      // Usar cost_price si hay valores de costo, sino usar price
      const hasCostPrice = analysisResults.some(m => m.catalog_product.cost_price > 0)
      if (hasCostPrice) {
        priceFormula = `cost_price * ${avgMargin.toFixed(2)}`
      } else {
        priceFormula = `price * ${avgMargin.toFixed(2)}`
      }
      console.log(`[v0] Margen PROMEDIO: ${avgMargin.toFixed(2)}x (basado en ${margins.length} productos)`)
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
        average_margin: avgMargin.toFixed(2),
        price_formula: priceFormula,
        margin_details: marginDetails.slice(0, 10), // Mostrar primeros 10
        sample_match: {
          ml_title: mlItem.title,
          catalog_title: catalogProduct.title,
          ml_price: mlItem.price,
          catalog_price: catalogProduct.price,
          catalog_cost: catalogProduct.cost_price
        }
      }
    })
    
  } catch (error) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: "Error interno", details: String(error) }, { status: 500 })
  }
}
