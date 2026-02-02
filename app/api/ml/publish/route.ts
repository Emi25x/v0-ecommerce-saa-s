import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
      override_price   // Precio manual (opcional)
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

    // Construir el objeto de publicacion para ML
    const mlItem = {
      title: product.title?.substring(0, 60) || "Libro",
      category_id: template.category_id || "MLA3025", // Libros
      price: finalPrice,
      currency_id: "ARS",
      available_quantity: product.stock || 1,
      buying_mode: "buy_it_now",
      condition: "new",
      listing_type_id: template.listing_type_id || "gold_special",
      description: { plain_text: description },
      pictures: product.image_url ? [{ source: product.image_url }] : [],
      attributes: []
    }

    // Agregar atributos basicos
    if (product.ean) {
      mlItem.attributes.push({ id: "GTIN", value_name: product.ean })
    }
    if (product.author) {
      mlItem.attributes.push({ id: "AUTHOR", value_name: product.author })
    }
    if (product.brand) {
      mlItem.attributes.push({ id: "PUBLISHER", value_name: product.brand })
    }
    if (product.language) {
      mlItem.attributes.push({ id: "LANGUAGE", value_name: product.language })
    }
    if (product.pages) {
      mlItem.attributes.push({ id: "PAGES", value_name: product.pages.toString() })
    }

    // TODO: Publicar en ML (por ahora solo retornamos preview)
    // const mlResponse = await fetch("https://api.mercadolibre.com/items", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${account.access_token}`,
    //     "Content-Type": "application/json"
    //   },
    //   body: JSON.stringify(mlItem)
    // })

    return NextResponse.json({
      success: true,
      preview: true, // Indica que es solo preview, no publicado aun
      product: {
        id: product.id,
        title: product.title,
        cost_price_eur: product.cost_price,
      },
      price_calculation: priceCalculation,
      final_price_ars: finalPrice,
      ml_item: mlItem,
      message: "Preview de publicacion generado. Para publicar, confirma la accion."
    })

  } catch (error) {
    console.error("[v0] Error en POST /api/ml/publish:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
