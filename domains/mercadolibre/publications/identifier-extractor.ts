/**
 * Extracción de identificadores de producto (EAN/ISBN/GTIN/SKU)
 * desde items de ML API.
 *
 * Usada por: sync-ml-stock cron, import-pro, publish, catalog-optin
 */

export interface ProductIdentifiers {
  ean: string | null
  sku: string | null
  isbn: string | null
  gtin: string | null
}

/**
 * Extrae EAN/ISBN/GTIN/SKU de un item de ML.
 * Prioridad: seller_sku → seller_custom_field → atributos GTIN/EAN/ISBN
 */
export function extractIdentifiersFromMlItem(item: any): ProductIdentifiers {
  const result: ProductIdentifiers = {
    ean: null,
    sku: null,
    isbn: null,
    gtin: null,
  }

  // seller_sku y seller_custom_field
  if (item.seller_sku) result.sku = String(item.seller_sku).trim()
  if (item.seller_custom_field) {
    const scf = String(item.seller_custom_field).trim()
    // Si parece un EAN (numérico, 8-13 dígitos), asignarlo como EAN
    if (/^\d{8,13}$/.test(scf)) {
      result.ean = scf
    } else {
      result.sku = result.sku || scf
    }
  }

  // Atributos ML (GTIN, EAN, ISBN, SELLER_SKU)
  if (Array.isArray(item.attributes)) {
    for (const attr of item.attributes) {
      if (!attr.value_name) continue
      const val = String(attr.value_name).trim()

      switch (attr.id) {
        case "GTIN":
          result.gtin = val
          break
        case "EAN":
          result.ean = result.ean || val
          break
        case "ISBN":
          result.isbn = val
          break
        case "SELLER_SKU":
          result.sku = result.sku || val
          break
      }
    }
  }

  // Si no tenemos EAN pero sí GTIN o ISBN, usar como EAN
  if (!result.ean) {
    result.ean = result.gtin || result.isbn || null
  }

  return result
}

/**
 * Obtiene el mejor identificador disponible de un item ML para matching.
 * Devuelve el primer valor no-null de: ean, gtin, isbn, sku
 */
export function getBestIdentifier(item: any): string | null {
  const ids = extractIdentifiersFromMlItem(item)
  return ids.ean || ids.gtin || ids.isbn || ids.sku || null
}
