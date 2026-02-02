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
    
    console.log("[v0] Product loaded from DB:", {
      id: product.id,
      title: product.title,
      image_url: product.image_url,
      description: product.description?.substring(0, 100) + "..."
    })

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

    // Refrescar token si es necesario para tener access_token valido
    const validAccount = await refreshTokenIfNeeded(account)
    const accessToken = validAccount.access_token

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

    // Funcion para subir imagen directamente a ML usando multipart/form-data
    // Esto evita problemas de Cloudflare porque subimos el binario directo a ML
    const uploadImageToML = async (imageUrl: string): Promise<string | null> => {
      try {
        console.log("[v0] Downloading image from:", imageUrl)
        
        // Descargar imagen con headers de navegador
        const response = await fetch(imageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
          }
        })
        
        if (!response.ok) {
          console.log("[v0] Failed to download image:", response.status)
          return null
        }
        
        const contentType = response.headers.get("content-type") || ""
        if (contentType.includes("text/html")) {
          console.log("[v0] Got HTML instead of image (Cloudflare block)")
          return null
        }
        
        const imageBuffer = await response.arrayBuffer()
        if (imageBuffer.byteLength < 1000) {
          console.log("[v0] Image too small, skipping")
          return null
        }
        
        console.log("[v0] Uploading image to ML, size:", imageBuffer.byteLength)
        
        // Crear FormData para multipart upload
        const formData = new FormData()
        const blob = new Blob([imageBuffer], { type: contentType || "image/jpeg" })
        formData.append("file", blob, "image.jpg")
        
        // Subir a ML usando multipart/form-data
        const uploadResponse = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
          },
          body: formData,
        })
        
        if (!uploadResponse.ok) {
          const error = await uploadResponse.text()
          console.log("[v0] ML upload failed:", error)
          return null
        }
        
        const uploadData = await uploadResponse.json()
        console.log("[v0] Image uploaded to ML with ID:", uploadData.id)
        return uploadData.id // Retorna el ID de la imagen en ML
      } catch (error) {
        console.log("[v0] Error uploading image:", error)
        return null
      }
    }
    
    // Subir imagen a ML si existe
    let imageUrlForML: string | null = null
    let mlPictureId: string | null = null
    if (product.image_url) {
      mlPictureId = await uploadImageToML(product.image_url)
    }

    // Funcion para sanitizar texto a plain text (quitar HTML y caracteres especiales)
    // ML solo acepta caracteres ASCII básicos y algunos extendidos
    const sanitizeToPlainText = (text: string): string => {
      return text
        // Quitar tags HTML
        .replace(/<[^>]*>/g, ' ')
        // Convertir entidades HTML comunes
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&aacute;/gi, 'a')
        .replace(/&eacute;/gi, 'e')
        .replace(/&iacute;/gi, 'i')
        .replace(/&oacute;/gi, 'o')
        .replace(/&uacute;/gi, 'u')
        .replace(/&ntilde;/gi, 'n')
        .replace(/&#\d+;/g, '') // Quitar entidades numéricas
        // Quitar cualquier otra entidad HTML
        .replace(/&[a-zA-Z]+;/g, '')
        // Reemplazar caracteres Unicode problemáticos
        .replace(/[""]/g, '"') // Comillas tipográficas
        .replace(/['']/g, "'") // Apóstrofes tipográficos
        .replace(/[–—]/g, '-') // Guiones largos
        .replace(/[…]/g, '...') // Puntos suspensivos
        .replace(/[•·]/g, '-') // Viñetas
        .replace(/[©®™]/g, '') // Símbolos de copyright
        .replace(/[€£¥]/g, '$') // Símbolos de moneda
        .replace(/[°]/g, ' grados ') // Símbolo de grados
        .replace(/[½¼¾]/g, '') // Fracciones
        .replace(/[←→↑↓↔]/g, '') // Flechas
        .replace(/[★☆♠♣♥♦]/g, '') // Símbolos especiales
        // Quitar caracteres de control y no imprimibles
        .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        // Quitar caracteres Unicode fuera del rango latino básico extendido
        .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '')
        // Normalizar saltos de linea
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Quitar espacios múltiples
        .replace(/[ \t]+/g, ' ')
        // Quitar lineas vacias multiples
        .replace(/\n{3,}/g, '\n\n')
        // Quitar espacios al inicio/fin de líneas
        .replace(/^[ \t]+|[ \t]+$/gm, '')
        .trim()
    }

    // Reemplazar variables en la descripcion de la plantilla
    // Si no hay template de descripcion, crear una descripcion por defecto
    const defaultDescription = `${product.title || "Libro"}

Autor: ${product.author || "No especificado"}
Editorial: ${product.brand || "No especificada"}
ISBN: ${product.ean || product.isbn || "No especificado"}
Idioma: ${product.language || "Español"}
${product.pages ? `Páginas: ${product.pages}` : ""}
${product.binding ? `Encuadernación: ${product.binding}` : ""}
${product.year_edition ? `Año de edición: ${product.year_edition}` : ""}

${product.description || ""}

Libro nuevo. Envíos a todo el país.`

    let description = template.description_template || defaultDescription
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
    
    // Sanitizar la descripcion para que sea plain text (ML rechaza HTML)
    description = sanitizeToPlainText(description)

    // Buscar en el catalogo de ML si el modo es "catalog" o "linked"
    let familyName: string | null = null
    let catalogProductId: string | null = null
    
    // SIEMPRE buscar en catalogo - ML rechaza "title" si el ISBN existe en su catalogo
    if (product.ean && accessToken) {
      try {
        const catalogSearch = await fetch(
          `https://api.mercadolibre.com/products/search?status=active&site_id=MLA&product_identifier=${product.ean}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        
        if (catalogSearch.ok) {
          const catalogData = await catalogSearch.json()
          if (catalogData.results && catalogData.results.length > 0) {
            catalogProductId = catalogData.results[0].id
            familyName = catalogData.results[0].name || catalogData.results[0].id
          }
        }
      } catch {
        // Continuar sin catalogo
      }
    }

    // Construir el objeto de publicacion para ML segun el modo SELECCIONADO POR EL USUARIO
    let mlItem: Record<string, unknown>

    // Helper para construir publicacion tradicional
    const buildTraditionalItem = () => {
      // Mapeo de codigos de idioma a value_id de ML
      const languageMap: Record<string, string> = {
        "SPA": "313886", // Español
        "ENG": "313885", // Inglés
        "POR": "1258229", // Portugués
        "FRA": "313883", // Francés
        "ITA": "313889", // Italiano
        "DEU": "313884", // Alemán
        "RUS": "313887", // Ruso
        "JPN": "313888", // Japonés
        "CHI": "2466958", // Chino
      }
      
      const attributes: Array<{ id: string; value_name?: string; value_id?: string }> = []
      
      // MAPEO DE CAMPOS: Nuestra BD -> Atributos ML (MLA412445 - Libros Fisicos)
      // Basado en publicacion real MLA2199217606 de la cuenta LIBROESVIDA
      // 
      // Nuestra BD          | ML Attribute ID    | ML Attribute Name         | Tipo
      // --------------------|--------------------|-----------------------------|-------
      // title               | BOOK_TITLE         | Título del libro           | string (required)
      // author              | AUTHOR             | Autor                      | string (required)
      // brand               | BOOK_PUBLISHER     | Editorial del libro        | string (required)
      // -                   | BOOK_GENRE         | Género del libro           | list (value_id required)
      // ean/isbn            | GTIN               | ISBN                       | string
      // language            | LANGUAGE           | Idioma                     | list (value_id)
      // year_edition        | PUBLICATION_YEAR   | Año de publicación         | string
      // binding             | BOOK_COVER         | Tapa del libro             | string
      // pages               | PAGES_NUMBER       | Cantidad de páginas        | string
      
      // REQUERIDOS por ML para MLA412445
      // BOOK_TITLE - Titulo (required)
      attributes.push({ id: "BOOK_TITLE", value_name: product.title?.substring(0, 255) || "Libro" })
      
      // AUTHOR - Autor (required)
      attributes.push({ id: "AUTHOR", value_name: product.author || "Desconocido" })
      
      // BOOK_GENRE - Genero del libro (REQUIRED - usa value_id)
      // value_id "7538039" = "Literatura y ficción" (valor generico seguro)
      attributes.push({ id: "BOOK_GENRE", value_id: "7538039" })
      
      // BOOK_PUBLISHER - Editorial del libro (REQUIRED - NO es "PUBLISHER")
      attributes.push({ id: "BOOK_PUBLISHER", value_name: product.brand?.substring(0, 255) || "Editorial independiente" })
      
      // GTIN/ISBN
      if (product.ean) {
        attributes.push({ id: "GTIN", value_name: product.ean })
      }
      
      // LANGUAGE - usa value_id (lista cerrada)
      const langCode = (product.language || "SPA").toUpperCase().substring(0, 3)
      const langValueId = languageMap[langCode] || "313886" // Default Español
      attributes.push({ id: "LANGUAGE", value_id: langValueId })
      
      // Opcionales
      if (product.year_edition) {
        attributes.push({ id: "PUBLICATION_YEAR", value_name: product.year_edition.toString() })
      }
      
      // BOOK_COVER - Tapa del libro (Blanda/Dura)
      // Solo agregar si tenemos un valor mapeado válido
      if (product.binding) {
        const bindingLower = product.binding.toLowerCase()
        const coverMap: Record<string, string> = {
          "rustica": "Blanda",
          "rústica": "Blanda",
          "tapa blanda": "Blanda", 
          "paperback": "Blanda",
          "blanda": "Blanda",
          "tapa dura": "Dura",
          "hardcover": "Dura",
          "carton": "Dura",
          "cartón": "Dura",
          "dura": "Dura",
        }
        // Solo agregar si el valor está en el mapa, sino omitir
        if (coverMap[bindingLower]) {
          attributes.push({ id: "BOOK_COVER", value_name: coverMap[bindingLower] })
        }
      }
      
      // PAGES_NUMBER - Cantidad de paginas
      if (product.pages) {
        attributes.push({ id: "PAGES_NUMBER", value_name: product.pages.toString() })
      }
      
      // Usar el ID de imagen subido a ML, o URL como fallback
      const pictures: Array<{ id?: string; source?: string }> = []
      if (mlPictureId) {
        pictures.push({ id: mlPictureId })
      } else if (product.image_url) {
        pictures.push({ source: product.image_url })
      }
      
      return {
        site_id: "MLA",
        category_id: template.category_id || "MLA412445", // Libros Fisicos
        family_name: product.title?.substring(0, 60) || "Libro",
        price: finalPrice,
        currency_id: template.currency_id || "ARS",
        available_quantity: Math.min(product.stock || 1, 50),
        buying_mode: "buy_it_now",
        condition: template.condition || "new",
        listing_type_id: template.listing_type_id || "gold_special",
        // NOTA: La descripción se agrega en POST separado después de crear el item
        // Imagenes
        pictures: pictures,
        // Garantia via sale_terms (WARRANTY_TYPE + WARRANTY_TIME)
        sale_terms: [
          {
            id: "WARRANTY_TYPE",
            value_name: template.warranty_type || "Garantía del vendedor"
          },
          {
            id: "WARRANTY_TIME", 
            value_name: template.warranty_time || "30 días"
          }
        ],
        // Configuracion de envio (usar valores del template si existen)
        shipping: {
          mode: template.shipping_mode || "me2", // Mercado Envios
          local_pick_up: template.local_pick_up !== false, // true por defecto
          free_shipping: template.free_shipping || false,
        },
        // Atributos del libro
        attributes: attributes,
      }
    }
    
    // Helper para construir publicacion de catalogo
    const buildCatalogItem = () => {
      // Usar el ID de imagen subido a ML, o URL como fallback
      const pictures: Array<{ id?: string; source?: string }> = []
      if (mlPictureId) {
        pictures.push({ id: mlPictureId })
      } else if (product.image_url) {
        pictures.push({ source: product.image_url })
      }
      
      return {
        site_id: "MLA",
        catalog_product_id: catalogProductId,
        catalog_listing: true,
        price: finalPrice,
        currency_id: template.currency_id || "ARS",
        available_quantity: Math.min(product.stock || 1, 50),
        buying_mode: "buy_it_now",
        condition: template.condition || "new",
        listing_type_id: template.listing_type_id || "gold_special",
        // NOTA: La descripción se agrega en POST separado después de crear el item
        // Imagenes
        pictures: pictures,
        // Garantia via sale_terms (WARRANTY_TYPE + WARRANTY_TIME)
        sale_terms: [
          {
            id: "WARRANTY_TYPE",
            value_name: template.warranty_type || "Garantía del vendedor"
          },
          {
            id: "WARRANTY_TIME", 
            value_name: template.warranty_time || "30 días"
          }
        ],
        // Configuracion de envio
        shipping: {
          mode: template.shipping_mode || "me2",
          local_pick_up: template.local_pick_up !== false,
          free_shipping: template.free_shipping || false,
        },
      }
    }
    
    // RESPETAR el modo seleccionado por el usuario
    if (publish_mode === "catalog") {
      // Usuario quiere SOLO catalogo
      if (!catalogProductId) {
        return NextResponse.json({
          success: false,
          error: `Producto no encontrado en catálogo de ML (ISBN: ${product.ean}). Intenta con modo "Tradicional".`,
          not_in_catalog: true
        }, { status: 400 })
      }
      mlItem = buildCatalogItem()
    } else if (publish_mode === "traditional") {
      // Usuario quiere SOLO tradicional - siempre usar tradicional
      mlItem = buildTraditionalItem()
    } else {
      // Modo "linked": tradicional primero, luego optin a catalogo si existe
      mlItem = buildTraditionalItem()
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

    // El mlItem ya esta preparado correctamente segun el publish_mode
    // Para "linked" y "traditional" ya tiene title y family_name
    // Para "catalog" ya tiene catalog_product_id y catalog_listing
    const itemToPublish = mlItem
    
    // Log para debug - ver exactamente que se envia a ML
    console.log("[v0] Item to publish - pictures:", JSON.stringify((itemToPublish as Record<string, unknown>).pictures))
    console.log("[v0] Item to publish - description:", JSON.stringify((itemToPublish as Record<string, unknown>).description))
    console.log("[v0] Item to publish - shipping:", JSON.stringify((itemToPublish as Record<string, unknown>).shipping))
    console.log("[v0] Item to publish - warranty:", (itemToPublish as Record<string, unknown>).warranty)
    console.log("[v0] Product image_url from DB:", product.image_url)

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

    // Agregar descripción en un POST separado (ML lo requiere así)
    let descriptionAdded = false
    let descriptionError: string | null = null
    if (description && description.trim()) {
      try {
        console.log("[v0] Adding description to item", mlData.id, "length:", description.length)
        const descResponse = await fetch(`https://api.mercadolibre.com/items/${mlData.id}/description`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ plain_text: description })
        })
        
        if (!descResponse.ok) {
          const descError = await descResponse.json()
          console.log("[v0] Error adding description:", JSON.stringify(descError))
          descriptionError = descError.message || descError.error || "Error desconocido"
        } else {
          console.log("[v0] Description added successfully")
          descriptionAdded = true
        }
      } catch (descErr) {
        console.log("[v0] Exception adding description:", descErr)
        descriptionError = String(descErr)
      }
    } else {
      console.log("[v0] No description to add (empty or null)")
      descriptionError = "Descripción vacía o no disponible"
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
        // Si el item está pausado, activarlo primero
        if (mlData.status === "paused") {
          console.log("[v0] Item created as paused, activating before optin...")
          const activateResponse = await fetch(`https://api.mercadolibre.com/items/${mlData.id}`, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "active" })
          })
          
          if (!activateResponse.ok) {
            const activateError = await activateResponse.json()
            console.error("[v0] Error activating item:", activateError)
            // No hacer optin si no se pudo activar
            throw new Error("No se pudo activar el item para optin")
          }
          
          console.log("[v0] Item activated, waiting for ML to process...")
          // Esperar 2 segundos para que ML procese el cambio de estado
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Verificar que realmente se activó
          const verifyResponse = await fetch(`https://api.mercadolibre.com/items/${mlData.id}`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
          })
          
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json()
            console.log("[v0] Item status after activate:", verifyData.status)
            if (verifyData.status === "paused") {
              console.error("[v0] Item still paused, skipping optin")
              throw new Error("Item sigue pausado después de activar")
            }
          }
        }
        
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
      // Debug info
      image_url_sent: product.image_url || null,
      ml_picture_id: mlPictureId || null,
      pictures_in_response: mlData.pictures || [],
      description_added: descriptionAdded,
      description_error: descriptionError,
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
