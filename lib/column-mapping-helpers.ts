/**
 * Helpers para mapeo semi-automático de columnas CSV
 */

// Campos internos soportados
export const INTERNAL_FIELDS = [
  { key: 'sku', label: 'SKU', required: false },
  { key: 'title', label: 'Título', required: true },
  { key: 'description', label: 'Descripción', required: false },
  { key: 'price', label: 'Precio', required: true },
  { key: 'stock', label: 'Stock', required: false },
  { key: 'isbn', label: 'ISBN', required: false },
  { key: 'ean', label: 'EAN/Código de Barras', required: false },
  { key: 'gtin', label: 'GTIN', required: false },
  { key: 'author', label: 'Autor', required: false },
  { key: 'publisher', label: 'Editorial', required: false },
  { key: 'category', label: 'Categoría', required: false },
  { key: 'image_url', label: 'URL de Imagen', required: false },
] as const

// Diccionario de sinónimos para auto-mapeo
const SYNONYMS: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'código', 'code', 'item', 'producto', 'product'],
  title: ['titulo', 'título', 'title', 'nombre', 'name', 'descripcion breve', 'producto'],
  description: ['descripcion', 'descripción', 'description', 'desc', 'detalle'],
  price: ['precio', 'price', 'pvp', 'valor', 'cost', 'costo'],
  stock: ['stock', 'qty', 'cantidad', 'existencia', 'disponible', 'quantity'],
  isbn: ['isbn', 'isbn13', 'isbn-13', 'isbn10', 'isbn-10'],
  ean: ['ean', 'ean13', 'ean-13', 'barcode', 'codigo barras', 'código de barras'],
  gtin: ['gtin', 'gtin13', 'gtin-13', 'upc'],
  author: ['autor', 'author', 'autores', 'writers', 'escritor'],
  publisher: ['editorial', 'publisher', 'editor', 'editora'],
  category: ['categoria', 'categoría', 'category', 'rubro', 'seccion', 'sección'],
  image_url: ['imagen', 'image', 'foto', 'photo', 'url imagen', 'image url', 'picture'],
}

/**
 * Normaliza un texto para comparación (lowercase, sin tildes, sin símbolos)
 */
export function normalizeForMapping(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/[^a-z0-9\s]/g, '') // Solo letras y números
    .trim()
}

/**
 * Sugiere mapeo automático para un header CSV
 */
export function suggestMapping(csvHeader: string): string | null {
  const normalized = normalizeForMapping(csvHeader)
  
  for (const [internalField, synonyms] of Object.entries(SYNONYMS)) {
    for (const synonym of synonyms) {
      if (normalized.includes(synonym) || synonym.includes(normalized)) {
        return internalField
      }
    }
  }
  
  return null // No hay sugerencia, dejar como "Ignorar"
}

/**
 * Genera mapeo completo sugerido para todos los headers
 */
export function generateSuggestedMapping(csvHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  
  csvHeaders.forEach(header => {
    const suggestion = suggestMapping(header)
    if (suggestion) {
      mapping[header] = suggestion
    }
  })
  
  return mapping
}

/**
 * Valida que el mapeo tenga al menos un identificador (sku o isbn/ean)
 */
export function validateMapping(mapping: Record<string, string>): { valid: boolean; error?: string } {
  const values = Object.values(mapping)
  
  // Debe tener al menos: sku O (isbn O ean)
  const hasSku = values.includes('sku')
  const hasIsbn = values.includes('isbn')
  const hasEan = values.includes('ean')
  
  if (!hasSku && !hasIsbn && !hasEan) {
    return {
      valid: false,
      error: 'El mapeo debe incluir al menos un identificador: SKU, ISBN o EAN'
    }
  }
  
  // Debe tener title
  if (!values.includes('title')) {
    return {
      valid: false,
      error: 'El mapeo debe incluir el campo Título'
    }
  }
  
  // Debe tener price
  if (!values.includes('price')) {
    return {
      valid: false,
      error: 'El mapeo debe incluir el campo Precio'
    }
  }
  
  return { valid: true }
}
