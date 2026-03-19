/**
 * Shared CSV parsing helpers.
 * Used by inventory batch import, Arnoia stock import, and other CSV-based imports.
 */

/** Strip BOM, normalize to lowercase ASCII, replace spaces with underscores */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
}

/** Auto-detect CSV delimiter by counting occurrences in the first line */
export function detectDelimiter(firstLine: string): string {
  const candidates = ["|", ";", "\t", ","]
  const counts = candidates.map((d) => ({
    delimiter: d,
    count: (firstLine.match(new RegExp(`\\${d === "\t" ? "t" : d}`, "g")) || []).length,
  }))
  const best = counts.reduce((max, curr) => (curr.count > max.count ? curr : max))
  return best.count > 0 ? best.delimiter : ","
}
