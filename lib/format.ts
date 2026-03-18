/**
 * Consolidated formatting utilities.
 * Re-exports from format-helpers and normalize-text for gradual migration.
 */

export { fmtNumber, fmtPercent, fmtDate, fmtSpeed, fmtETA } from "./format-helpers"
export { normalizeText, searchIncludes } from "./normalize-text"

/** Format ARS currency */
export function fmtCurrency(amount: number | null | undefined, currency = "ARS"): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "$0"
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}
