import { describe, it, expect } from "vitest"
import { mapItemsToPublications } from "../domain/publication-mapper"
import type { MlRawItem } from "../domain/types"

const NOW = "2026-03-19T12:00:00.000Z"
const ACCOUNT_ID = "test-account-id"

function makeItem(overrides: Partial<MlRawItem["body"]> = {}): MlRawItem {
  return {
    code: 200,
    body: {
      id: "MLA123456",
      title: "Test Product",
      price: 9999,
      available_quantity: 10,
      sold_quantity: 5,
      status: "active",
      permalink: "https://articulo.mercadolibre.com.ar/MLA-123456",
      listing_type_id: "gold_special",
      thumbnail: "https://example.com/thumb.jpg",
      seller_custom_field: null,
      attributes: [],
      variations: [],
      shipping: null,
      tags: [],
      catalog_listing: false,
      catalog_listing_eligible: false,
      ...overrides,
    },
  }
}

describe("mapItemsToPublications", () => {
  it("maps basic item fields correctly", () => {
    const items = [makeItem()]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      account_id: ACCOUNT_ID,
      ml_item_id: "MLA123456",
      title: "Test Product",
      price: 9999,
      current_stock: 10,
      sold_quantity: 5,
      status: "active",
      last_sync_at: NOW,
      updated_at: NOW,
    })
  })

  it("skips items with null body", () => {
    const items: MlRawItem[] = [{ code: 200, body: null }]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows).toHaveLength(0)
  })

  it("extracts SKU from seller_custom_field", () => {
    const items = [makeItem({ seller_custom_field: "MY-SKU-001" })]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].sku).toBe("MY-SKU-001")
  })

  it("extracts SKU from SELLER_SKU attribute", () => {
    const items = [
      makeItem({
        attributes: [{ id: "SELLER_SKU", value_name: "ATTR-SKU-001" }],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    // seller_custom_field takes priority, but when null, attribute wins
    expect(rows[0].sku).toBe("ATTR-SKU-001")
  })

  it("seller_custom_field overrides SELLER_SKU attribute", () => {
    const items = [
      makeItem({
        seller_custom_field: "FIELD-SKU",
        attributes: [{ id: "SELLER_SKU", value_name: "ATTR-SKU" }],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].sku).toBe("FIELD-SKU")
  })

  it("extracts ISBN from attributes", () => {
    const items = [
      makeItem({
        attributes: [{ id: "ISBN", value_name: "978-3-16-148410-0" }],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].isbn).toBe("978-3-16-148410-0")
  })

  it("extracts EAN from attributes", () => {
    const items = [
      makeItem({
        attributes: [{ id: "EAN", value_name: "7790001234567" }],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].ean).toBe("7790001234567")
  })

  it("falls back to GTIN when EAN is missing", () => {
    const items = [
      makeItem({
        attributes: [{ id: "GTIN", value_name: "0012345678901" }],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].ean).toBe("0012345678901")
    expect(rows[0].gtin).toBe("0012345678901")
  })

  it("prefers EAN over GTIN as fallback", () => {
    const items = [
      makeItem({
        attributes: [
          { id: "GTIN", value_name: "GTIN-VALUE" },
          { id: "EAN", value_name: "EAN-VALUE" },
        ],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].ean).toBe("EAN-VALUE")
  })

  it("extracts weight from attribute value_struct (grams)", () => {
    const items = [
      makeItem({
        attributes: [
          { id: "WEIGHT", value_name: "500 g", value_struct: { number: 500, unit: "g" } },
        ],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].meli_weight_g).toBe(500)
  })

  it("converts weight from kg to grams", () => {
    const items = [
      makeItem({
        attributes: [
          { id: "WEIGHT", value_name: "1.5 kg", value_struct: { number: 1.5, unit: "kg" } },
        ],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].meli_weight_g).toBe(1500)
  })

  it("extracts weight from string value when no value_struct", () => {
    const items = [
      makeItem({
        attributes: [{ id: "WEIGHT", value_name: "350g" }],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].meli_weight_g).toBe(350)
  })

  it("extracts weight from shipping dimensions", () => {
    const items = [
      makeItem({
        shipping: { dimensions: { weight: 750 } },
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].meli_weight_g).toBe(750)
  })

  it("extracts identifiers from variations", () => {
    const items = [
      makeItem({
        variations: [
          {
            seller_custom_field: "VAR-SKU-001",
            attributes: [{ id: "EAN", value_name: "7791234567890" }],
          },
        ],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].sku).toBe("VAR-SKU-001")
    expect(rows[0].ean).toBe("7791234567890")
  })

  it("detects catalog_listing_eligible from tags", () => {
    const items = [
      makeItem({
        catalog_listing_eligible: false,
        tags: ["catalog_listing_eligible", "other_tag"],
      }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].catalog_listing_eligible).toBe(true)
  })

  it("handles multiple items in a single batch", () => {
    const items = [
      makeItem({ id: "MLA001", title: "Product 1" }),
      makeItem({ id: "MLA002", title: "Product 2" }),
      makeItem({ id: "MLA003", title: "Product 3" }),
    ]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.ml_item_id)).toEqual(["MLA001", "MLA002", "MLA003"])
  })

  it("defaults available_quantity to 0 when missing", () => {
    const items = [makeItem({ available_quantity: undefined as any })]
    const rows = mapItemsToPublications(items, ACCOUNT_ID, NOW)
    expect(rows[0].current_stock).toBe(0)
  })
})
