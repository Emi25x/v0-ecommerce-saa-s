/**
 * ML item builders for traditional and catalog publication modes.
 * Extracted from app/api/ml/publish/route.ts — no logic changes.
 */

// Mapeo de codigos de idioma a value_id de ML
const LANGUAGE_MAP: Record<string, string> = {
  SPA: "313886", // Español
  ENG: "313885", // Inglés
  POR: "1258229", // Portugués
  FRA: "313883", // Francés
  ITA: "313889", // Italiano
  DEU: "313884", // Alemán
  RUS: "313887", // Ruso
  JPN: "313888", // Japonés
  CHI: "2466958", // Chino
}

// Mapeo de binding a BOOK_COVER values de ML
const COVER_MAP: Record<string, string> = {
  rustica: "Blanda",
  rústica: "Blanda",
  "tapa blanda": "Blanda",
  paperback: "Blanda",
  blanda: "Blanda",
  "tapa dura": "Dura",
  hardcover: "Dura",
  carton: "Dura",
  cartón: "Dura",
  dura: "Dura",
}

export interface MlItemTemplate {
  category_id?: string
  currency_id?: string
  condition?: string
  listing_type_id?: string
  warranty_type?: string
  warranty_time?: string
  handling_days?: number
  shipping_mode?: string
  local_pick_up?: boolean
  free_shipping?: boolean
}

export interface MlItemProduct {
  title?: string
  author?: string
  brand?: string
  ean?: string
  isbn?: string
  language?: string
  year_edition?: number | string
  binding?: string
  pages?: number
  width?: number
  height?: number
  thickness?: number
  canonical_weight_g?: number
  stock?: number
}

/**
 * Builds a traditional ML item object (non-catalog).
 * Includes all required attributes for MLA412445 (Libros Fisicos).
 */
export function buildTraditionalItem(params: {
  product: MlItemProduct
  template: MlItemTemplate
  mlTitle: string
  finalPrice: number
  mlPictureId: string | null
}): Record<string, unknown> {
  const { product, template, mlTitle, finalPrice, mlPictureId } = params

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
  const langValueId = LANGUAGE_MAP[langCode] || "313886" // Default Español
  attributes.push({ id: "LANGUAGE", value_id: langValueId })

  // Opcionales
  if (product.year_edition) {
    attributes.push({ id: "PUBLICATION_YEAR", value_name: product.year_edition.toString() })
  }

  // BOOK_COVER - Tapa del libro (Blanda/Dura) - solo enviar si tenemos valor válido
  if (product.binding) {
    const bindingLower = product.binding.toLowerCase()
    const coverValue = COVER_MAP[bindingLower]
    if (coverValue) {
      attributes.push({ id: "BOOK_COVER", value_name: coverValue })
    }
  }

  // PAGES_NUMBER - Cantidad de paginas
  if (product.pages) {
    attributes.push({ id: "PAGES_NUMBER", value_name: product.pages.toString() })
  }

  // DIMENSIONES (en milímetros para ML)
  if (product.width && product.width > 0) {
    attributes.push({ id: "ITEM_WIDTH", value_name: `${Math.round(product.width * 10)} mm` })
  }
  if (product.height && product.height > 0) {
    attributes.push({ id: "ITEM_HEIGHT", value_name: `${Math.round(product.height * 10)} mm` })
  }
  if (product.thickness && product.thickness > 0) {
    attributes.push({ id: "ITEM_THICKNESS", value_name: `${Math.round(product.thickness * 10)} mm` })
  }

  // PESO (si tenemos canonical_weight_g)
  if (product.canonical_weight_g && product.canonical_weight_g > 0) {
    attributes.push({ id: "ITEM_WEIGHT", value_name: `${product.canonical_weight_g} g` })
  }

  // Usar el ID de imagen subido a ML (NO usamos fallback a URL porque ML la rechazará si es pequeña)
  const pictures: Array<{ id?: string; source?: string }> = []
  if (mlPictureId) {
    pictures.push({ id: mlPictureId })
  }
  // Si no hay mlPictureId, se publica sin imagen (mejor que fallar)

  return {
    site_id: "MLA",
    category_id: template.category_id || "MLA412445", // Libros Fisicos
    family_name: mlTitle,
    price: finalPrice,
    currency_id: template.currency_id || "ARS",
    available_quantity: Math.max(product.stock ?? 0, 0),
    buying_mode: "buy_it_now",
    condition: template.condition || "new",
    listing_type_id: template.listing_type_id || "gold_special",
    // ATRIBUTOS OBLIGATORIOS (incluyen BOOK_TITLE)
    attributes: attributes,
    // NOTA: seller_sku NO es válido para listings tradicionales en ML API
    // NOTA: La descripción se agrega en POST separado después de crear el item
    // Imagenes
    pictures: pictures,
    // Garantia y tiempo de disponibilidad via sale_terms
    sale_terms: buildSaleTerms(template),
    // Configuracion de envio
    shipping: buildShipping(template),
  }
}

/**
 * Builds a catalog ML item object.
 * Used when publishing directly to ML's product catalog.
 */
export function buildCatalogItem(params: {
  template: MlItemTemplate
  catalogProductId: string | null
  finalPrice: number
  mlPictureId: string | null
  stock: number | undefined
}): Record<string, unknown> {
  const { template, catalogProductId, finalPrice, mlPictureId, stock } = params

  const pictures: Array<{ id?: string; source?: string }> = []
  if (mlPictureId) {
    pictures.push({ id: mlPictureId })
  }

  return {
    site_id: "MLA",
    catalog_product_id: catalogProductId,
    catalog_listing: true,
    price: finalPrice,
    currency_id: template.currency_id || "ARS",
    available_quantity: Math.max(stock ?? 0, 0),
    buying_mode: "buy_it_now",
    condition: template.condition || "new",
    listing_type_id: template.listing_type_id || "gold_special",
    pictures: pictures,
    sale_terms: buildSaleTerms(template),
    shipping: buildShipping(template),
  }
}

// --- internal helpers ---

function buildSaleTerms(template: MlItemTemplate) {
  return [
    {
      id: "WARRANTY_TYPE",
      value_name: template.warranty_type || "Garantía del vendedor",
    },
    {
      id: "WARRANTY_TIME",
      value_name: template.warranty_time || "30 días",
    },
    ...(template.handling_days && template.handling_days > 0
      ? [
          {
            id: "MANUFACTURING_TIME",
            value_name: `${template.handling_days} días`,
          },
        ]
      : []),
  ]
}

function buildShipping(template: MlItemTemplate) {
  return {
    mode: template.shipping_mode || "me2",
    local_pick_up: template.local_pick_up || false,
    free_shipping: template.free_shipping || false,
  }
}

/**
 * Validates a traditional ML item before publishing.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateTraditionalItem(
  item: Record<string, unknown>,
  productId: string,
  productTitle: string,
): string | null {
  // Validar family_name (requerido para tradicional/linked)
  if (!item.family_name || typeof item.family_name !== "string" || item.family_name.trim().length === 0) {
    return `family_name inválido: "${item.family_name}". El título del producto no puede estar vacío.`
  }

  // Validar atributos requeridos
  const attrs = item.attributes as Array<{ id: string; value_name?: string; value_id?: string }>
  const bookTitle = attrs?.find((a) => a.id === "BOOK_TITLE")
  const author = attrs?.find((a) => a.id === "AUTHOR")
  const publisher = attrs?.find((a) => a.id === "BOOK_PUBLISHER")
  const genre = attrs?.find((a) => a.id === "BOOK_GENRE")

  if (!bookTitle || !bookTitle.value_name || bookTitle.value_name.trim().length === 0) {
    return `BOOK_TITLE inválido. El producto "${productId}" no tiene título válido.`
  }

  if (!author || !author.value_name || author.value_name.trim().length === 0) {
    return `AUTHOR inválido. El producto "${productTitle}" no tiene autor válido.`
  }

  if (!publisher || !publisher.value_name || publisher.value_name.trim().length === 0) {
    return `BOOK_PUBLISHER inválido. El producto "${productTitle}" no tiene editorial válida.`
  }

  if (!genre || !genre.value_id) {
    return `BOOK_GENRE inválido. Error interno de validación.`
  }

  return null
}
