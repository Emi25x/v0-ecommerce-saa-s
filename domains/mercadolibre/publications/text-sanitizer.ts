/**
 * Text sanitization for MercadoLibre publications.
 * ML only accepts plain text (no HTML) with basic ASCII + extended latin characters.
 */

/**
 * Sanitizes text to plain text suitable for ML descriptions.
 * Strips HTML tags, converts HTML entities, removes problematic Unicode characters,
 * and normalizes whitespace.
 */
export function sanitizeToPlainText(text: string): string {
  return (
    text
      // Quitar tags HTML
      .replace(/<[^>]*>/g, " ")
      // Convertir entidades HTML comunes
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&aacute;/gi, "a")
      .replace(/&eacute;/gi, "e")
      .replace(/&iacute;/gi, "i")
      .replace(/&oacute;/gi, "o")
      .replace(/&uacute;/gi, "u")
      .replace(/&ntilde;/gi, "n")
      .replace(/&#\d+;/g, "") // Quitar entidades numéricas
      // Quitar cualquier otra entidad HTML
      .replace(/&[a-zA-Z]+;/g, "")
      // Reemplazar caracteres Unicode problemáticos
      .replace(/[""]/g, '"') // Comillas tipográficas
      .replace(/['']/g, "'") // Apóstrofes tipográficos
      .replace(/[–—]/g, "-") // Guiones largos
      .replace(/[…]/g, "...") // Puntos suspensivos
      .replace(/[•·]/g, "-") // Viñetas
      .replace(/[©®™]/g, "") // Símbolos de copyright
      .replace(/[€£¥]/g, "$") // Símbolos de moneda
      .replace(/[°]/g, " grados ") // Símbolo de grados
      .replace(/[½¼¾]/g, "") // Fracciones
      .replace(/[←→↑↓↔]/g, "") // Flechas
      .replace(/[★☆♠♣♥♦]/g, "") // Símbolos especiales
      // Quitar caracteres de control y no imprimibles
      .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
      // Quitar caracteres Unicode fuera del rango latino básico extendido
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "")
      // Normalizar saltos de linea
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Quitar espacios múltiples
      .replace(/[ \t]+/g, " ")
      // Quitar lineas vacias multiples
      .replace(/\n{3,}/g, "\n\n")
      // Quitar espacios al inicio/fin de líneas
      .replace(/^[ \t]+|[ \t]+$/gm, "")
      .trim()
  )
}

/**
 * Applies template variable substitution for ML title.
 * Replaces {title}, {author}, {brand}, {ean} placeholders and truncates to 60 chars.
 */
export function buildMlTitle(
  titleTemplate: string | null,
  product: { title?: string; author?: string; brand?: string; ean?: string },
): string {
  const defaultTitle = product.title || "Libro"
  let mlTitle = titleTemplate || defaultTitle
  mlTitle = mlTitle.replace(/{title}/g, product.title || "")
  mlTitle = mlTitle.replace(/{author}/g, product.author || "")
  mlTitle = mlTitle.replace(/{brand}/g, product.brand || "")
  mlTitle = mlTitle.replace(/{ean}/g, product.ean || "")
  // Limpiar espacios múltiples y truncar a 60 caracteres (límite de ML para family_name)
  mlTitle = mlTitle.replace(/\s+/g, " ").trim().substring(0, 60)
  return mlTitle
}

/**
 * Applies template variable substitution for ML description.
 * Replaces all product field placeholders and sanitizes the result.
 */
export function buildMlDescription(descriptionTemplate: string | null, product: Record<string, any>): string {
  const defaultDescription = `${product.title || "Libro"}

Autor: ${product.author || "No especificado"}
Editorial: ${product.brand || "No especificada"}
ISBN: ${product.ean || product.isbn || "No especificado"}
Idioma: ${product.language || "Español"}
${product.pages ? `Páginas: ${product.pages}` : ""}
${product.binding ? `Encuadernación: ${product.binding}` : ""}
${product.year_edition ? `Año de edición: ${product.year_edition}` : ""}
${product.subject ? `Materia: ${product.subject}` : ""}
${product.category ? `Categoría: ${product.category}` : ""}
${product.width && product.height && product.thickness ? `Dimensiones: ${product.width} x ${product.height} x ${product.thickness} cm` : ""}
${product.canonical_weight_g ? `Peso: ${product.canonical_weight_g} gramos` : ""}

${product.description || ""}

Libro nuevo. Envíos a todo el país.`

  let description = descriptionTemplate || defaultDescription
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
  return sanitizeToPlainText(description)
}
