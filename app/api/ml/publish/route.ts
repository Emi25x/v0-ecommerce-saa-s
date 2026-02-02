import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

// Calcular precio usando la formula de margen
async function calculatePriceForProduct(costPriceEur: number, marginPercent: number) {
  // Obtener tipo de cambio EUR billetes BNA
  let exchangeRate = 1765
  try {
    const rateResponse = await fetch("https://dolarapi.com/v1/cotizaciones/eur")
    if (rateResponse.ok) {
      const rateData = await rateResponse.json()
      exchangeRate = Math.round((rateData.venta || 1718) * 1.027) // EUR billetes
    }
  } catch {
    // Usar fallback
  }

  const mlFeePercent = 0.13 // 13% comision ML
  const costInArs = costPriceEur * exchangeRate
  const costWithMargin = costInArs * (1 + marginPercent / 100)

  // Calcular precio iterativamente para manejar el umbral de $33k
  const shippingCost = 5500
  let finalPrice = 0
  let iterations = 0
  const maxIterations = 5

  const getCosts = (price: number) => {
    let fixedFee = 0
    let shipping = 0

    if (price < 15000) {
      fixedFee = 1115
    } else if (price < 25000) {
      fixedFee = 2300
    } else if (price < 33000) {
      fixedFee = 2810
    } else {
      fixedFee = 0
      shipping = shippingCost
    }

    return { fixedFee, shipping }
  }

  let prevPrice = 0
  let currentPrice = costWithMargin / (1 - mlFeePercent)
  let mlFixedFee = 0

  while (Math.abs(currentPrice - prevPrice) > 100 && iterations < maxIterations) {
    iterations++
    prevPrice = currentPrice

    const costs = getCosts(currentPrice)
    mlFixedFee = costs.fixedFee
    const currentShipping = costs.shipping

    currentPrice = (costWithMargin + mlFixedFee + currentShipping) / (1 - mlFeePercent)
  }

  const finalCosts = getCosts(currentPrice)
  finalPrice = Math.ceil(currentPrice / 10) * 10

  return {
    price: finalPrice,
    exchangeRate,
    costInArs: Math.round(costInArs),
    fixedFee: finalCosts.fixedFee,
    shippingCost: finalCosts.shipping
  }
}

// POST: Publicar un producto del catalogo a ML
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      product_id,      // ID del producto en nuestro catalogo
      template_id,     // ID de la plantilla a usar
      account_id,      // ID de la cuenta ML
      override_price,  // Precio manual (opcional)
      preview_only = true, // Solo generar preview, no publicar
      publish_mode = "linked" // "linked", "catalog" o "traditional"
    } = body

    if (!product_id || !template_id || !account_id) {
      return NextResponse.json({ 
        error: "product_id, template_id y account_id son requeridos" 
      }, { status: 400 })
    }

    const supabase = await createClient()

    // Obtener el producto del catalogo
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", product_id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    // Obtener la plantilla
    const { data: template, error: templateError } = await supabase
      .from("ml_publication_templates")
      .select("*")
      .eq("id", template_id)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 })
    }

    // Obtener la cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta ML no encontrada" }, { status: 404 })
    }

    // Calcular el precio
    let finalPrice = override_price
    let priceCalculation = null

    if (!finalPrice && product.cost_price) {
      const marginPercent = template.margin_percent || 20
      priceCalculation = await calculatePriceForProduct(product.cost_price, marginPercent)
      finalPrice = priceCalculation.price
    }

    if (!finalPrice) {
      return NextResponse.json({ 
        error: "No se pudo calcular el precio. El producto no tiene cost_price." 
      }, { status: 400 })
    }

    // Reemplazar variables en la descripcion de la plantilla
    let description = template.description_template || ""
    description = description.replace(/{title}/g, product.title || "")
    description = description.replace(/{author}/g, product.author || "")
    description = description.replace(/{brand}/g, product.brand || "")
    description = description.replace(/{ean}/g, product.ean || "")
    description = description.replace(/{pages}/g, product.pages?.toString() || "")
    description = description.replace(/{binding}/g, product.binding || "")
    description = description.replace(/{language}/g, product.language || "")
    description = description.replace(/{year_edition}/g, product.year_edition?.toString() || "")
    description = description.replace(/{category}/g, product.category || "")
    description = description.replace(/{subject}/g, product.subject || "")
    description = description.replace(/{description}/g, product.description || "")
    description = description.replace(/{width}/g, product.width?.toString() || "")
    description = description.replace(/{height}/g, product.height?.toString() || "")
    description = description.replace(/{thickness}/g, product.thickness?.toString() || "")

    // Buscar en el catalogo de ML si el modo es "catalog" o "linked"
    let familyName: string | null = null
    let catalogProductId: string | null = null
    
    if ((publish_mode === "catalog" || publish_mode === "linked") && product.ean && account.access_token) {
      try {
        // Buscar en el catalogo de ML por product_identifier (ISBN/EAN)
        const catalogSearch = await fetch(
          `https://api.mercadolibre.com/products/search?status=active&site_id=MLA&product_identifier=${product.ean}`,
          { headers: { Authorization: `Bearer ${account.access_token}` } }
        )
        
        if (catalogSearch.ok) {
          const catalogData = await catalogSearch.json()
          if (catalogData.results && catalogData.results.length > 0) {
            catalogProductId = catalogData.results[0].id
            familyName = catalogData.results[0].name || catalogData.results[0].id
          }
        }
      } catch {
        // Continuar sin family_name del catalogo
      }
    }

    // Construir el objeto de publicacion para ML
    const mlItem: Record<string, unknown> = {
      site_id: "MLA",
      category_id: template.category_id || "MLA3025", // Libros
      price: finalPrice,
      currency_id: "ARS",
      available_quantity: Math.min(product.stock || 1, 50), // Max 50 para nuevos vendedores
      buying_mode: "buy_it_now",
      condition: "new",
      listing_type_id: template.listing_type_id || "gold_special",
      pictures: product.image_url ? [{ source: product.image_url }] : [],
      attributes: [] as Array<{ id: string; value_name: string }>
    }
    
    // Para modo "catalog" con catalog_product_id: NO enviar title, agregar catalog_listing
    // Para modo "linked" y "traditional": enviar title y family_name
    if (publish_mode === "catalog" && catalogProductId) {
      mlItem.catalog_product_id = catalogProductId
      mlItem.catalog_listing = true
      // NO incluir title ni family_name - ML usa los del catalogo
    } else {
      // Modos linked y traditional necesitan title y family_name
      mlItem.title = product.title?.substring(0, 60) || "Libro"
      mlItem.family_name = familyName || product.title?.substring(0, 60) || "Libro"
      mlItem.description = { plain_text: description }
    }

    // Agregar atributos basicos
    const attributes = mlItem.attributes as Array<{ id: string; value_name: string }>
    if (product.ean) {
      attributes.push({ id: "GTIN", value_name: product.ean })
    }
    if (product.author) {
      attributes.push({ id: "AUTHOR", value_name: product.author })
    }
    if (product.brand) {
      attributes.push({ id: "PUBLISHER", value_name: product.brand })
    }
    if (product.language) {
      attributes.push({ id: "LANGUAGE", value_name: product.language })
    }
    if (product.pages) {
      attributes.push({ id: "PAGES", value_name: product.pages.toString() })
    }

    // Calcular margen real para verificacion
    const mlCommission = finalPrice * 0.13
    const shippingCostFinal = priceCalculation?.shippingCost || 0
    const fixedFeeFinal = priceCalculation?.fixedFee || 0
    const netReceived = finalPrice - mlCommission - shippingCostFinal - fixedFeeFinal
    const costInArs = priceCalculation?.costInArs || (product.cost_price * 1765)
    const actualMargin = ((netReceived - costInArs) / costInArs) * 100

    // Si es solo preview, retornar sin publicar
    if (preview_only) {
      return NextResponse.json({
        success: true,
        preview: {
          price: finalPrice,
          margin: Math.round(actualMargin * 10) / 10,
          multiplier: Math.round(finalPrice / product.cost_price),
          exchange_rate: priceCalculation?.exchangeRate || 1765,
          ml_item: mlItem
        }
      })
    }

    // Refrescar token si es necesario
    const validAccount = await refreshTokenIfNeeded(account)
    const accessToken = validAccount.access_token

    // El mlItem ya esta preparado correctamente segun el publish_mode
    // Para "linked" y "traditional" ya tiene title y family_name
    // Para "catalog" ya tiene catalog_product_id y catalog_listing
    const itemToPublish = mlItem

    // Publicar en ML (tradicional primero si es linked)
    const mlResponse = await fetch("https://api.mercadolibre.com/items", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(itemToPublish)
    })

    const mlData = await mlResponse.json()

    if (!mlResponse.ok) {
      return NextResponse.json({
        success: false,
        error: mlData.message || mlData.error || "Error al publicar en ML"
      }, { status: 400 })
    }

    // Guardar publicacion tradicional en nuestra base de datos
    const { error: insertError } = await supabase
      .from("ml_publications")
      .insert({
        product_id: product.id,
        account_id: account.id,
        ml_item_id: mlData.id,
        title: mlData.title,
        price: mlData.price,
        status: mlData.status,
        permalink: mlData.permalink,
        published_at: new Date().toISOString()
      })

    if (insertError) {
      console.error("Error saving publication:", insertError)
    }

    // Si es modo "linked" y tenemos catalog_product_id, hacer optin al catalogo
    let catalogListing = null
    if (publish_mode === "linked" && catalogProductId) {
      try {
        const optinResponse = await fetch("https://api.mercadolibre.com/items/catalog_listings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            item_id: mlData.id,
            catalog_product_id: catalogProductId
          })
        })

        if (optinResponse.ok) {
          catalogListing = await optinResponse.json()
          
          // Guardar tambien la publicacion de catalogo vinculada
          if (catalogListing.id) {
            await supabase
              .from("ml_publications")
              .insert({
                product_id: product.id,
                account_id: account.id,
                ml_item_id: catalogListing.id,
                title: catalogListing.title || mlData.title,
                price: catalogListing.price || mlData.price,
                status: catalogListing.status || "active",
                permalink: catalogListing.permalink,
                published_at: new Date().toISOString()
              })
          }
        } else {
          const optinError = await optinResponse.json()
          console.error("Error en optin catalogo:", optinError)
        }
      } catch (optinErr) {
        console.error("Error al vincular con catalogo:", optinErr)
      }
    }

    return NextResponse.json({
      success: true,
      ml_item_id: mlData.id,
      permalink: mlData.permalink,
      status: mlData.status,
      catalog_listing: catalogListing ? {
        id: catalogListing.id,
        permalink: catalogListing.permalink,
        item_relations: catalogListing.item_relations
      } : null
    })

  } catch (error) {
    console.error("[v0] Error en POST /api/ml/publish:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
