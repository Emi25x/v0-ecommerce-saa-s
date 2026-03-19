/**
 * Shopify Export Builder
 *
 * Generates row sets matching the exact 78-column Shopify products import
 * format. Extracted from the /api/shopify/export-generate route handler.
 *
 * Tag construction (comma + space separated):
 *   - Temática     → products.category        (e.g. "144")
 *   - Editorial    → products.brand           (e.g. "Anaya")
 *   - literal      → "catalogo"
 *   - Autor        → products.author
 *   - Rango título → "Titulo A-C" based on first letter of title
 *   - flags        → from custom_fields.flags[] if present
 */

// ── The canonical 78-column Shopify products export header ────────────────
export const SHOPIFY_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Google Shopping / Google Product Category",
  "Google Shopping / Gender",
  "Google Shopping / Age Group",
  "Google Shopping / MPN",
  "Google Shopping / AdWords Grouping",
  "Google Shopping / AdWords Labels",
  "Google Shopping / Condition",
  "Google Shopping / Custom Product",
  "Google Shopping / Custom Label 0",
  "Google Shopping / Custom Label 1",
  "Google Shopping / Custom Label 2",
  "Google Shopping / Custom Label 3",
  "Google Shopping / Custom Label 4",
  "Variant Image",
  "Variant Weight Unit",
  "Variant Tax Code",
  "Cost per item",
  "Included / Argentina",
  "Price / Argentina",
  "Compare At Price / Argentina",
  "Included / International",
  "Price / International",
  "Compare At Price / International",
  "Status",
  // Metafields
  "Metafield: custom.autor [single_line_text_field]",
  "Metafield: custom.editorial [single_line_text_field]",
  "Metafield: custom.idioma [single_line_text_field]",
  "Metafield: custom.isbn [single_line_text_field]",
  "Metafield: custom.tematica [single_line_text_field]",
  "Metafield: custom.tematica_especifica [single_line_text_field]",
  "Metafield: custom.paginas [number_integer]",
  "Metafield: custom.encuadernacion [single_line_text_field]",
  "Metafield: custom.fecha_de_publicacion [single_line_text_field]",
  "Metafield: custom.alto_mm [number_integer]",
  "Metafield: custom.ancho_mm [number_integer]",
  "Metafield: custom.espesor_mm [number_integer]",
  "Metafield: custom.peso [single_line_text_field]",
  "Metafield: custom.dimensiones [single_line_text_field]",
  "Metafield: custom.pais_de_origen [single_line_text_field]",
  "Metafield: custom.sucursal_stock [single_line_text_field]",
  "Metafield: custom.n_edicion [single_line_text_field]",
  "Metafield: custom.short_description [single_line_text_field]",
  "Metafield: custom.condicion [single_line_text_field]",
  "Metafield: custom.codigo_ibic [single_line_text_field]",
  "Metafield: custom.ean [single_line_text_field]",
  "Metafield: custom.materia [single_line_text_field]",
  "Metafield: custom.curso [single_line_text_field]",
  "Metafield: mm-google-shopping.google_product_category [single_line_text_field]",
]

// ── Title-range tag helper ────────────────────────────────────────────────
const TITLE_RANGES = [
  { tag: "Titulo A-C", from: "a", to: "c" },
  { tag: "Titulo D-F", from: "d", to: "f" },
  { tag: "Titulo G-I", from: "g", to: "i" },
  { tag: "Titulo J-L", from: "j", to: "l" },
  { tag: "Titulo M-O", from: "m", to: "o" },
  { tag: "Titulo P-R", from: "p", to: "r" },
  { tag: "Titulo S-U", from: "s", to: "u" },
  { tag: "Titulo V-Z", from: "v", to: "z" },
  { tag: "Titulo 0-9", from: "0", to: "9" },
]

function titleRangeTag(title: string): string {
  const first = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .charAt(0)
  for (const r of TITLE_RANGES) {
    if (first >= r.from && first <= r.to) return r.tag
  }
  return "Titulo Otros"
}

// ── Slug helper ───────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80)
}

// ── Types ─────────────────────────────────────────────────────────────────

/** Minimal store shape needed by the export builder */
export interface ExportStore {
  sucursal_stock_code?: string | null
}

export interface ExportBuildParams {
  products: any[]
  stockMap: Record<string, number>
  columns: string[]
  defaults: Record<string, string>
  store: ExportStore
}

export interface ExportBuildResult {
  columns: string[]
  rows: Record<string, string | number>[]
}

// ── Resolve columns from template ─────────────────────────────────────────

export function resolveColumns(templateColumns: string[] | null | undefined): string[] {
  return templateColumns?.length ? templateColumns : SHOPIFY_COLUMNS
}

// ── Main builder ──────────────────────────────────────────────────────────

export function buildExportRows(params: ExportBuildParams): ExportBuildResult {
  const { products, stockMap, columns, defaults, store } = params
  const rows: Record<string, string | number>[] = []

  for (const p of products) {
    const customFields = (p.custom_fields as Record<string, unknown> | null) ?? {}

    // ── Identifiers ────────────────────────────────────────────────────
    const barcode = p.ean || p.isbn || ""
    // SKU: prefer internal sku, fallback to EAN, then ISBN
    const variantSku = p.sku || p.ean || p.isbn || ""
    const handle = slugify(p.title ?? barcode ?? "producto")
    const weightG = p.canonical_weight_g ?? ""
    const stock = stockMap[p.id] ?? p.stock ?? 0
    const price = p.price != null ? String(p.price) : ""
    const precioArs = customFields.precio_ars != null ? String(customFields.precio_ars) : price

    // ── Dimensions (mm) from DB or custom_fields ───────────────────────
    const alto = p.height != null ? Math.round(p.height * 10) : (customFields.alto_mm ?? "")
    const ancho = p.width != null ? Math.round(p.width * 10) : (customFields.ancho_mm ?? "")
    const espesor = p.thickness != null ? Math.round(p.thickness * 10) : (customFields.espesor_mm ?? "")

    // ── Peso en kg (string) ────────────────────────────────────────────
    const pesoKg = p.canonical_weight_g
      ? `${(Number(p.canonical_weight_g) / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`
      : customFields.peso
        ? String(customFields.peso)
        : ""

    // ── Dimensiones como string "alto x ancho x espesor" ──────────────
    const dimensionesStr =
      p.height != null && p.width != null
        ? `${p.height} x ${p.width} x ${p.thickness ?? 0}`
        : ((customFields.dimensiones as string) ?? "")

    // ── Fecha de publicación ────────────────────────────────────────────
    const fechaPublicacion =
      p.edition_date ??
      (p.year_edition ? String(p.year_edition) : "") ??
      (customFields.fecha_de_publicacion as string) ??
      ""

    // ── Short description ──────────────────────────────────────────────
    const shortDesc = (customFields.short_description as string) || (p.description ? p.description.slice(0, 160) : "")

    // ── Tags ─────────────────────────────────────────────────────────
    const tagParts: string[] = []
    if (p.category) tagParts.push(p.category)
    if (p.brand) tagParts.push(p.brand)
    tagParts.push("catalogo")
    if (p.author) tagParts.push(p.author)
    tagParts.push(titleRangeTag(p.title ?? ""))

    // Extra flags from custom_fields.flags[]
    const flags = customFields.flags
    if (Array.isArray(flags)) {
      for (const f of flags) if (typeof f === "string") tagParts.push(f)
    }

    const tags = tagParts.filter(Boolean).join(", ")

    // ── Vendor / Type ─────────────────────────────────────────────────
    const vendor = defaults["Vendor"] || p.brand || ""
    const type = defaults["Type"] || p.category || ""

    // ── Body HTML ────────────────────────────────────────────────────
    const bodyHtml = p.description ? `<p>${p.description}</p>` : ""

    // ── SEO ──────────────────────────────────────────────────────────
    const seoTitle = p.title ?? ""
    const seoDesc = p.description?.slice(0, 320) ?? ""

    // ── Cell resolver: maps every column name to its value ──────────
    const cell = (col: string): string | number => {
      switch (col) {
        // Core product fields
        case "Handle":
          return handle
        case "Title":
          return p.title ?? ""
        case "Body (HTML)":
          return bodyHtml
        case "Vendor":
          return vendor
        case "Product Category":
          return defaults["Product Category"] ?? ""
        case "Type":
          return type
        case "Tags":
          return tags
        case "Published":
          return defaults["Published"] ?? "TRUE"
        case "Status":
          return defaults["Status"] ?? "active"

        // Options (single variant — no options needed for books)
        case "Option1 Name":
          return "Title"
        case "Option1 Value":
          return "Default Title"
        case "Option2 Name":
          return ""
        case "Option2 Value":
          return ""
        case "Option3 Name":
          return ""
        case "Option3 Value":
          return ""

        // Variant
        case "Variant SKU":
          return variantSku
        case "Variant Grams":
          return weightG
        case "Variant Inventory Tracker":
          return "shopify"
        case "Variant Inventory Qty":
          return stock
        case "Variant Inventory Policy":
          return "deny"
        case "Variant Fulfillment Service":
          return "manual"
        case "Variant Price":
          return price
        case "Variant Compare At Price":
          return ""
        case "Variant Requires Shipping":
          return "TRUE"
        case "Variant Taxable":
          return defaults["Variant Taxable"] ?? "TRUE"
        case "Variant Barcode":
          return barcode
        case "Variant Weight Unit":
          return "g"
        case "Variant Tax Code":
          return ""
        case "Variant Image":
          return ""

        // Image
        case "Image Src":
          return p.image_url ?? ""
        case "Image Position":
          return p.image_url ? "1" : ""
        case "Image Alt Text":
          return p.title ?? ""

        // Cost
        case "Cost per item":
          return p.cost_price != null ? String(p.cost_price) : ""

        // Pricing by market
        case "Included / Argentina":
          return "TRUE"
        case "Price / Argentina":
          return precioArs
        case "Compare At Price / Argentina":
          return ""
        case "Included / International":
          return "FALSE"
        case "Price / International":
          return ""
        case "Compare At Price / International":
          return ""

        // Gift card / SEO
        case "Gift Card":
          return "FALSE"
        case "SEO Title":
          return seoTitle
        case "SEO Description":
          return seoDesc

        // Google Shopping — left mostly empty for books
        case "Google Shopping / Google Product Category":
          return defaults["Google Shopping / Google Product Category"] ?? ""
        case "Google Shopping / Gender":
          return ""
        case "Google Shopping / Age Group":
          return ""
        case "Google Shopping / MPN":
          return barcode
        case "Google Shopping / AdWords Grouping":
          return ""
        case "Google Shopping / AdWords Labels":
          return ""
        case "Google Shopping / Condition":
          return p.condition ?? "new"
        case "Google Shopping / Custom Product":
          return "FALSE"
        case "Google Shopping / Custom Label 0":
          return p.brand ?? ""
        case "Google Shopping / Custom Label 1":
          return p.category ?? ""
        case "Google Shopping / Custom Label 2":
          return p.author ?? ""
        case "Google Shopping / Custom Label 3":
          return ""
        case "Google Shopping / Custom Label 4":
          return ""

        // Metafields
        case "Metafield: custom.autor [single_line_text_field]":
          return p.author ?? ""
        case "Metafield: custom.editorial [single_line_text_field]":
          return p.brand ?? ""
        case "Metafield: custom.idioma [single_line_text_field]":
          return p.language ?? (customFields.idioma as string) ?? ""
        case "Metafield: custom.isbn [single_line_text_field]":
          return p.isbn ?? ""
        case "Metafield: custom.tematica [single_line_text_field]":
          return p.category ?? (customFields.tematica as string) ?? ""
        case "Metafield: custom.tematica_especifica [single_line_text_field]":
          return (customFields.tematica_especifica as string) ?? p.ibic_subjects ?? ""
        case "Metafield: custom.paginas [number_integer]":
          return p.pages != null ? p.pages : ((customFields.paginas as number) ?? "")
        case "Metafield: custom.encuadernacion [single_line_text_field]":
          return p.binding ?? (customFields.encuadernacion as string) ?? ""
        case "Metafield: custom.fecha_de_publicacion [single_line_text_field]":
          return fechaPublicacion
        case "Metafield: custom.alto_mm [number_integer]":
          return alto as string | number
        case "Metafield: custom.ancho_mm [number_integer]":
          return ancho as string | number
        case "Metafield: custom.espesor_mm [number_integer]":
          return espesor as string | number
        case "Metafield: custom.peso [single_line_text_field]":
          return pesoKg
        case "Metafield: custom.dimensiones [single_line_text_field]":
          return dimensionesStr
        case "Metafield: custom.pais_de_origen [single_line_text_field]":
          return (customFields.pais_de_origen as string) ?? ""
        case "Metafield: custom.sucursal_stock [single_line_text_field]":
          return (store as any)?.sucursal_stock_code ?? (customFields.sucursal_stock as string) ?? ""
        case "Metafield: custom.n_edicion [single_line_text_field]":
          return (customFields.n_edicion as string) ?? ""
        case "Metafield: custom.short_description [single_line_text_field]":
          return shortDesc
        case "Metafield: custom.condicion [single_line_text_field]":
          return p.condition ?? (customFields.condicion as string) ?? "Nuevo"
        case "Metafield: custom.codigo_ibic [single_line_text_field]":
          return p.ibic_subjects ?? (customFields.codigo_ibic as string) ?? ""
        case "Metafield: custom.ean [single_line_text_field]":
          return barcode
        case "Metafield: custom.materia [single_line_text_field]":
          return p.subject ?? (customFields.materia as string) ?? ""
        case "Metafield: custom.curso [single_line_text_field]":
          return p.course ?? (customFields.curso as string) ?? ""
        case "Metafield: mm-google-shopping.google_product_category [single_line_text_field]":
          return (
            (customFields.google_product_category as string) ??
            defaults["Google Shopping / Google Product Category"] ??
            ""
          )

        default:
          // Fall back to defaults, then custom_fields
          return defaults[col] ?? (customFields[col] as string | number | null) ?? ""
      }
    }

    const row: Record<string, string | number> = {}
    for (const col of columns) row[col] = cell(col)
    rows.push(row)
  }

  return { columns, rows }
}
