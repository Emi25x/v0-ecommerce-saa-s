/**
 * Maps ML document type strings to ARCA numeric codes.
 *
 * ARCA codes: 80 = CUIT, 86 = CUIL, 96 = DNI/CI, 99 = sin identificar
 */
export function normalizeDocType(docTipo: string | null | undefined): number {
  const raw = (docTipo || "").toUpperCase().trim()
  switch (raw) {
    case "CUIT":
      return 80
    case "CUIL":
      return 86
    case "DNI":
      return 96
    case "CI":
      return 96
    default:
      return 96
  }
}
