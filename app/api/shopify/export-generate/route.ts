/**
 * POST /api/shopify/export-generate
 * Body: { store_id, eans: string[], warehouse_id?: string }
 * Returns: JSON array of rows matching the store's template columns.
 * The client converts this to XLSX using the xlsx package.
 */
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Default Shopify column set used when no template is configured
const DEFAULT_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Qty",
  "Variant Price",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "SEO Title",
  "SEO Description",
]

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { store_id, eans, warehouse_id } = await request.json() as {
      store_id: string
      eans: string[]
      warehouse_id?: string
    }

    if (!store_id || !eans?.length) {
      return NextResponse.json({ error: "store_id y eans son requeridos" }, { status: 400 })
    }

    // 1. Verify store ownership & get defaults
    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain, name")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .maybeSingle()
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    // 2. Load template
    const { data: tpl } = await supabase
      .from("shopify_export_templates")
      .select("template_columns_json, defaults_json")
      .eq("shopify_store_id", store_id)
      .maybeSingle()

    const columns: string[] = (tpl?.template_columns_json as string[] | null) ?? DEFAULT_COLUMNS
    const defaults: Record<string, string> = (tpl?.defaults_json as Record<string, string> | null) ?? {}

    // 3. Load products by EAN/ISBN
    const { data: products, error: prodError } = await supabase
      .from("products")
      .select(
        "id, title, description, brand, sku, ean, isbn, price, canonical_weight_g, image_url, category, custom_fields, height, width, thickness",
      )
      .or(eans.map((e) => `ean.eq.${e},isbn.eq.${e}`).join(","))

    if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })
    if (!products?.length) return NextResponse.json({ error: "No se encontraron productos para los EANs ingresados" }, { status: 404 })

    // 4. Load stock from supplier_catalog_items for the selected warehouse (or default)
    const productIds = products.map((p) => p.id)
    let stockQuery = supabase
      .from("supplier_catalog_items")
      .select("product_id, stock_quantity, warehouse_id")
      .in("product_id", productIds)
      .order("stock_quantity", { ascending: false })

    if (warehouse_id) stockQuery = stockQuery.eq("warehouse_id", warehouse_id)

    const { data: stockRows } = await stockQuery

    // Build product_id -> best stock map
    const stockMap: Record<string, number> = {}
    for (const s of stockRows ?? []) {
      if (s.product_id && !(s.product_id in stockMap)) {
        stockMap[s.product_id] = s.stock_quantity ?? 0
      }
    }

    // 5. Build export rows
    const rows: Record<string, string | number>[] = []

    for (const p of products) {
      const handle = slugify(p.title ?? p.ean ?? "producto")
      const barcode = p.ean || p.isbn || ""
      const weightG = p.canonical_weight_g ?? ""
      const stock   = stockMap[p.id] ?? 0
      const price   = p.price ?? ""

      // Custom / metafield columns from custom_fields or dimensions
      const customFields = (p.custom_fields as Record<string, unknown> | null) ?? {}

      const metaHeight    = (customFields.alto_mm    ?? (p.height    ? p.height * 10    : "")) as string | number
      const metaWidth     = (customFields.ancho_mm   ?? (p.width     ? p.width * 10     : "")) as string | number
      const metaThickness = (customFields.espesor_mm ?? (p.thickness ? p.thickness * 10 : "")) as string | number

      // Helpers to fill any column name
      const cellValue = (col: string): string | number => {
        const c = col.toLowerCase().trim()

        if (c === "handle")                      return handle
        if (c === "title")                       return p.title ?? ""
        if (c === "body (html)")                 return p.description ? `<p>${p.description}</p>` : ""
        if (c === "vendor")                      return defaults.Vendor ?? p.brand ?? ""
        if (c === "type")                        return defaults.Type ?? p.category ?? ""
        if (c === "tags")                        return defaults.Tags ?? ""
        if (c === "published")                   return defaults.Published ?? "TRUE"
        if (c === "variant sku")                 return p.sku ?? ""
        if (c === "variant grams")               return weightG
        if (c === "variant inventory qty")       return stock
        if (c === "variant price")               return price
        if (c === "variant barcode")             return barcode
        if (c === "image src")                   return p.image_url ?? ""
        if (c === "image position")              return "1"
        if (c === "seo title")                   return p.title ?? ""
        if (c === "seo description")             return p.description?.slice(0, 160) ?? ""

        // Metafields: match by common patterns
        if (c.includes("alto") || c.includes("height"))     return metaHeight
        if (c.includes("ancho") || c.includes("width"))     return metaWidth
        if (c.includes("espesor") || c.includes("thick"))   return metaThickness
        if (c.includes("peso") || c.includes("weight"))     return weightG

        // Fall back to defaults then custom_fields
        return defaults[col] ?? (customFields[col] as string | number | null) ?? ""
      }

      const row: Record<string, string | number> = {}
      for (const col of columns) row[col] = cellValue(col)
      rows.push(row)
    }

    return NextResponse.json({ ok: true, columns, rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
