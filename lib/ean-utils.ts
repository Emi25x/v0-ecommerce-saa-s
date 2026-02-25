/**
 * EAN/ISBN Normalization Utilities
 * Prevents scientific notation conversion and normalizes identifiers
 */

/**
 * Normalizes EAN/ISBN to string format, preventing scientific notation
 * @param ean - Raw EAN from CSV/API (can be string or number)
 * @returns Normalized EAN as string with leading zeros preserved
 */
export function normalizeEan(ean: string | number | null | undefined): string {
  if (!ean) return ""
  
  // Convert to string while preserving all digits
  let eanStr = String(ean).trim()

  // Manejar notación científica de Excel: 9.78845E+12 → 9788450000000
  if (/^[0-9]+\.?[0-9]*[eE][+\-][0-9]+$/.test(eanStr)) {
    eanStr = Number(eanStr).toFixed(0)
  }

  // Remove any non-digit characters (spaces, dashes, etc.)
  eanStr = eanStr.replace(/\D/g, "")
  
  // If empty after cleaning, return empty string
  if (!eanStr) return ""
  
  // Pad ISBN-10 to ISBN-13 format (prepend 978)
  if (eanStr.length === 10) {
    eanStr = "978" + eanStr
  }
  
  // Pad short EANs with leading zeros to standard length (13 digits)
  if (eanStr.length < 13 && eanStr.length > 0) {
    eanStr = eanStr.padStart(13, "0")
  }
  
  return eanStr
}

/**
 * Validates if an EAN is properly formatted
 * @param ean - EAN to validate
 * @returns True if valid EAN-13 format
 */
export function isValidEan(ean: string): boolean {
  if (!ean) return false
  
  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(ean)) return false
  
  // Check EAN-13 checksum
  const digits = ean.split("").map(Number)
  const checksum = digits.slice(0, 12).reduce((sum, digit, idx) => {
    return sum + digit * (idx % 2 === 0 ? 1 : 3)
  }, 0)
  
  const calculatedCheck = (10 - (checksum % 10)) % 10
  return calculatedCheck === digits[12]
}

/**
 * Extracts and normalizes EAN from product data
 * Tries multiple fields: ean, isbn, gtin
 */
export function extractEan(product: { ean?: any; isbn?: any; gtin?: any }): string {
  const rawEan = product.ean || product.isbn || product.gtin
  return normalizeEan(rawEan)
}
