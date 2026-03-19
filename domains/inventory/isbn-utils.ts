/**
 * Utilidades para manejo de ISBN en librerías
 * Funciones para normalización, validación y conversión de ISBN-10 a ISBN-13
 */

/**
 * Normaliza cadenas removiendo espacios, guiones y puntos
 */
export function normalize(str: string): string {
  if (!str) return ""
  return str
    .replace(/[-\s.]/g, "")
    .trim()
    .toUpperCase()
}

/**
 * Valida formato ISBN-10
 */
export function isValidISBN10(isbn: string): boolean {
  const cleaned = normalize(isbn)
  if (cleaned.length !== 10) return false
  if (!/^[0-9]{9}[0-9X]$/i.test(cleaned)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i]) * (10 - i)
  }
  const checkDigit = cleaned[9].toUpperCase() === "X" ? 10 : parseInt(cleaned[9])
  sum += checkDigit

  return sum % 11 === 0
}

/**
 * Valida formato ISBN-13
 */
export function isValidISBN13(isbn: string): boolean {
  const cleaned = normalize(isbn)
  if (cleaned.length !== 13) return false
  if (!/^(978|979)[0-9]{10}$/.test(cleaned)) return false

  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = parseInt(cleaned[12])
  const calculatedCheck = (10 - (sum % 10)) % 10

  return checkDigit === calculatedCheck
}

/**
 * Convierte ISBN-10 a ISBN-13
 */
export function isbn10ToISBN13(isbn10: string): string {
  const cleaned = normalize(isbn10).replace(/X$/i, "")
  if (cleaned.length < 9) return isbn10

  const base = cleaned.slice(0, 9)
  const isbn13Base = "978" + base

  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn13Base[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = (10 - (sum % 10)) % 10

  return isbn13Base + checkDigit
}

/**
 * Normaliza a ISBN-13 (convierte ISBN-10 si es necesario)
 */
export function normalizeToISBN13(isbn: string): string {
  const cleaned = normalize(isbn)

  // Si es ISBN-10, convertir a ISBN-13
  if (cleaned.length === 10 && isValidISBN10(cleaned)) {
    return isbn10ToISBN13(cleaned)
  }

  // Si ya es ISBN-13, devolver normalizado
  if (cleaned.length === 13) {
    return cleaned
  }

  // Si no es ninguno, devolver normalizado
  return cleaned
}

/**
 * Extrae ISBN de un texto
 */
export function extractISBNFromText(text: string): string[] {
  const results: string[] = []

  // ISBN-13: 978/979 seguido de 10 dígitos
  const isbn13Matches = text.match(/\b(978|979)[0-9]{10}\b/g) || []
  for (const match of isbn13Matches) {
    const normalized = normalizeToISBN13(match)
    if (!results.includes(normalized)) {
      results.push(normalized)
    }
  }

  // ISBN-10: 9 dígitos + (dígito o X)
  const isbn10Matches = text.match(/\b[0-9]{9}[0-9X]\b/gi) || []
  for (const match of isbn10Matches) {
    const normalized = normalizeToISBN13(match)
    if (!results.includes(normalized)) {
      results.push(normalized)
    }
  }

  return results
}

/**
 * Extrae identificadores (ISBN, EAN, GTIN) de attributes de Mercado Libre
 */
export function extractIdentifiersFromMLAttributes(attributes: any[]): {
  isbn: string | null
  ean: string | null
  gtin: string | null
} {
  let isbn: string | null = null
  let ean: string | null = null
  let gtin: string | null = null

  if (!attributes || !Array.isArray(attributes)) {
    return { isbn, ean, gtin }
  }

  for (const attr of attributes) {
    const attrId = attr.id?.toUpperCase()
    const attrName = attr.name?.toUpperCase()
    const value = attr.value_name || attr.value_id

    if (!value) continue

    // ISBN
    if ((attrId === "ISBN" || attrName === "ISBN") && !isbn) {
      isbn = normalizeToISBN13(value)
    }

    // EAN
    if ((attrId === "EAN" || attrName === "EAN") && !ean) {
      ean = normalize(value)
    }

    // GTIN
    if ((attrId === "GTIN" || attrName === "GTIN") && !gtin) {
      gtin = normalize(value)
    }
  }

  // Si hay GTIN pero no ISBN, verificar si GTIN es ISBN-13
  if (gtin && !isbn && gtin.length === 13 && (gtin.startsWith("978") || gtin.startsWith("979"))) {
    isbn = gtin
  }

  // Si hay EAN pero no ISBN, verificar si EAN es ISBN-13
  if (ean && !isbn && ean.length === 13 && (ean.startsWith("978") || ean.startsWith("979"))) {
    isbn = ean
  }

  return { isbn, ean, gtin }
}

/**
 * Busca product_id en DB usando múltiples identificadores
 */
export async function findProductByIdentifiers(
  supabase: any,
  identifiers: {
    isbn?: string | null
    ean?: string | null
    sku?: string | null
    gtin?: string | null
  },
): Promise<{ product_id: string | null; matched_by: string | null }> {
  // 1. Buscar por ISBN (prioridad más alta para libros)
  if (identifiers.isbn) {
    const { data } = await supabase.from("products").select("id").eq("isbn", identifiers.isbn).limit(1).maybeSingle()

    if (data) return { product_id: data.id, matched_by: "isbn" }

    // También buscar en SKU por si el ISBN está ahí
    const { data: bySku } = await supabase
      .from("products")
      .select("id")
      .eq("sku", identifiers.isbn)
      .limit(1)
      .maybeSingle()

    if (bySku) return { product_id: bySku.id, matched_by: "isbn_as_sku" }
  }

  // 2. Buscar por EAN
  if (identifiers.ean) {
    const { data } = await supabase.from("products").select("id").eq("ean", identifiers.ean).limit(1).maybeSingle()

    if (data) return { product_id: data.id, matched_by: "ean" }

    // También buscar en SKU
    const { data: bySku } = await supabase
      .from("products")
      .select("id")
      .eq("sku", identifiers.ean)
      .limit(1)
      .maybeSingle()

    if (bySku) return { product_id: bySku.id, matched_by: "ean_as_sku" }
  }

  // 3. Buscar por SKU
  if (identifiers.sku) {
    const { data } = await supabase.from("products").select("id").eq("sku", identifiers.sku).limit(1).maybeSingle()

    if (data) return { product_id: data.id, matched_by: "sku" }
  }

  // 4. Buscar por GTIN (como último recurso)
  if (identifiers.gtin) {
    const { data: bySku } = await supabase
      .from("products")
      .select("id")
      .eq("sku", identifiers.gtin)
      .limit(1)
      .maybeSingle()

    if (bySku) return { product_id: bySku.id, matched_by: "gtin_as_sku" }
  }

  return { product_id: null, matched_by: null }
}
