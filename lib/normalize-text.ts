/**
 * Normaliza texto para búsqueda sin tildes
 * Compatible con búsquedas en el cliente y filtros locales
 */
export function normalizeText(text: string): string {
  if (!text) return ""
  
  return text
    .toLowerCase()
    .normalize('NFD') // Descomponer caracteres unicode
    .replace(/[\u0300-\u036f]/g, '') // Quitar marcas diacríticas (tildes)
    .trim()
}

/**
 * Verifica si un texto contiene una búsqueda (accent-insensitive)
 */
export function searchIncludes(text: string, search: string): boolean {
  return normalizeText(text).includes(normalizeText(search))
}
