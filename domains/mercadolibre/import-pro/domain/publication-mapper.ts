/**
 * Publication Mapper
 *
 * Extracts structured publication data from raw ML API responses.
 * Pure function — no side effects, fully testable.
 */

import type { MlRawItem, MlAttribute, PublicationRow } from "./types"

/**
 * Maps an array of raw ML multiget items into PublicationRow objects
 * ready for database upsert.
 */
export function mapItemsToPublications(
  items: MlRawItem[],
  accountId: string,
  now: string,
): PublicationRow[] {
  const rows: PublicationRow[] = []

  for (const item of items) {
    const b = item.body
    if (!b) continue

    const extracted = extractIdentifiers(b.attributes, b.variations, b.seller_custom_field, b.shipping)

    let catalogEligible = b.catalog_listing_eligible ?? false
    if (!catalogEligible && Array.isArray(b.tags)) {
      catalogEligible = b.tags.includes("catalog_listing_eligible")
    }

    const row: PublicationRow = {
      account_id: accountId,
      ml_item_id: b.id,
      title: b.title,
      price: b.price,
      current_stock: b.available_quantity ?? 0,
      sold_quantity: b.sold_quantity ?? 0,
      status: b.status,
      permalink: b.permalink,
      listing_type_id: b.listing_type_id ?? null,
      thumbnail: b.thumbnail ?? null,
      sku: extracted.sku,
      isbn: extracted.isbn,
      gtin: extracted.gtin,
      ean: extracted.ean ?? extracted.gtin, // EAN fallback: use GTIN
      catalog_listing: b.catalog_listing ?? false,
      catalog_listing_eligible: catalogEligible,
      last_sync_at: now,
      updated_at: now,
    }

    if (extracted.weightG != null) {
      row.meli_weight_g = extracted.weightG
    }

    rows.push(row)
  }

  return rows
}

// ── Internal helpers ────────────────────────────────────────────────────────

interface ExtractedIdentifiers {
  sku: string | null
  isbn: string | null
  gtin: string | null
  ean: string | null
  weightG: number | null
}

function extractIdentifiers(
  attributes: MlAttribute[] | undefined,
  variations: Array<{ seller_custom_field?: string | null; attributes?: MlAttribute[] }> | undefined,
  sellerCustomField: string | null,
  shipping: { dimensions?: { weight?: number | string } } | null,
): ExtractedIdentifiers {
  let sku: string | null = null
  let isbn: string | null = null
  let gtin: string | null = null
  let ean: string | null = null
  let weightG: number | null = null

  // 1. Item-level attributes
  if (Array.isArray(attributes)) {
    const result = extractFromAttributes(attributes)
    sku = result.sku
    isbn = result.isbn
    gtin = result.gtin
    ean = result.ean
    weightG = result.weightG
  }

  // 2. seller_custom_field (most reliable SKU source)
  if (sellerCustomField) sku = sellerCustomField

  // 3. shipping.dimensions.weight
  if (weightG == null && shipping?.dimensions?.weight != null) {
    const w = shipping.dimensions.weight
    const n = typeof w === "string" ? parseFloat(w) : w
    if (isFinite(n) && n > 0) weightG = Math.round(n)
  }

  // 4. Variations
  if (Array.isArray(variations)) {
    for (const v of variations) {
      if (!sku && v.seller_custom_field) sku = v.seller_custom_field
      if (Array.isArray(v.attributes)) {
        const r = extractFromAttributes(v.attributes)
        if (!isbn && r.isbn) isbn = r.isbn
        if (!gtin && r.gtin) gtin = r.gtin
        if (!ean && r.ean) ean = r.ean
        if (!sku && r.sku) sku = r.sku
        if (weightG == null && r.weightG != null) weightG = r.weightG
      }
      if (sku && ean && isbn && gtin && weightG != null) break
    }
  }

  return { sku, isbn, gtin, ean, weightG }
}

function extractFromAttributes(attrs: MlAttribute[]): ExtractedIdentifiers {
  let sku: string | null = null
  let isbn: string | null = null
  let gtin: string | null = null
  let ean: string | null = null
  let weightG: number | null = null

  for (const attr of attrs) {
    const val = attr.value_name ?? null
    if (!val) continue

    switch (attr.id) {
      case "SELLER_SKU":
        if (!sku) sku = val
        break
      case "ISBN":
        if (!isbn) isbn = val
        break
      case "GTIN":
      case "GTIN_CODE":
        if (!gtin) gtin = val
        break
      case "EAN":
        if (!ean) ean = val
        break
      case "WEIGHT": {
        if (weightG != null) break
        const vs = attr.value_struct
        if (vs?.number != null && isFinite(vs.number) && vs.number > 0) {
          const unit = (vs.unit ?? "g").toLowerCase()
          weightG = unit === "kg" ? Math.round(vs.number * 1000) : Math.round(vs.number)
        } else {
          const m = val.match(/^([\d.]+)\s*(g|kg)?/i)
          if (m) {
            const n = parseFloat(m[1])
            weightG = (m[2] ?? "g").toLowerCase() === "kg" ? Math.round(n * 1000) : Math.round(n)
          }
        }
        break
      }
    }
  }

  return { sku, isbn, gtin, ean, weightG }
}
