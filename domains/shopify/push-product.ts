/**
 * Core logic for pushing a product to Shopify.
 * Extracted from app/api/shopify/push-product/route.ts so it can be called
 * both from the HTTP route and from push-batch without self-fetch.
 */

import { getValidToken } from "@/domains/shopify/auth"
import { resolveProductStockForWarehouse } from "@/domains/inventory/stock-helpers"
import type { SupabaseClient } from "@supabase/supabase-js"

// ── Helpers ────────────────────────────────────────────────────────────────

function buildHandle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 255)
}

const TITLE_RANGES = [
  ["A", "C"],
  ["D", "F"],
  ["G", "I"],
  ["J", "L"],
  ["M", "O"],
  ["P", "R"],
  ["S", "U"],
  ["V", "Z"],
]

function titleRangeTag(title: string): string {
  const first = (title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .charAt(0)
  for (const [lo, hi] of TITLE_RANGES) {
    if (first >= lo && first <= hi) return `Titulo ${lo}-${hi}`
  }
  if (first >= "0" && first <= "9") return "Titulo 0-9"
  return "Titulo Otros"
}

function buildTags(p: any, flags: string[]): string {
  const parts: string[] = []
  if (p.category) parts.push(p.category)
  if (p.brand) parts.push(p.brand)
  parts.push("catalogo")
  if (p.author) parts.push(p.author)
  parts.push(titleRangeTag(p.title ?? ""))
  for (const f of flags) if (f) parts.push(f)
  return [...new Set(parts.filter(Boolean))].join(", ")
}

async function shopifyRest(method: string, path: string, token: string, domain: string, body?: any): Promise<any> {
  const url = `https://${domain}/admin/api/2024-01${path}`
  const res = await fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = `Shopify HTTP ${res.status}`
    try {
      msg += `: ${JSON.parse(text).errors ?? text.slice(0, 300)}`
    } catch {}
    throw new Error(msg)
  }
  return text ? JSON.parse(text) : {}
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PushProductResult {
  ok: boolean
  error?: string
  action?: "created" | "updated"
  shopify_product_id?: number | null
  shopify_variant_id?: number | null
  shopify_url?: string
  metafields_set?: number
  inventory_updated?: number
  inventory_by_location?: { location_id: string; qty: number }[]
  stock_mode?: "warehouse_consolidated" | "legacy_fallback"
  tags?: string
  price_used?: string
  price_source?: string
  dry_run?: boolean
  product_id?: string
  payload?: any
  metafields?: any[]
}

// ── Core function ──────────────────────────────────────────────────────────

export async function pushProductToShopify(
  supabase: SupabaseClient,
  storeId: string,
  ean: string,
  userId: string,
  dryRun = false,
): Promise<PushProductResult> {
  // ── 1. Tienda + configuración de exportación ───────────────────────────
  let store: any = null
  {
    const { data, error } = await supabase
      .from("shopify_stores")
      .select(
        `
        id, shop_domain, access_token, api_key, api_secret, token_expires_at,
        currency, vendor, product_category, price_source, price_list_id,
        default_warehouse_id, sucursal_stock_code
      `,
      )
      .eq("id", storeId)
      .eq("owner_user_id", userId)
      .single()

    if (data) {
      store = data
    } else if (error) {
      console.warn(`[push-product] select completo falló: ${error.message}, reintentando con columnas base`)
      const { data: fallback } = await supabase
        .from("shopify_stores")
        .select("id, shop_domain, access_token, api_key, api_secret, token_expires_at")
        .eq("id", storeId)
        .eq("owner_user_id", userId)
        .single()
      if (fallback) store = fallback
    }
  }

  if (!store) return { ok: false, error: "Tienda no encontrada" }

  const token = await getValidToken(supabase, store)

  // ── 2. Producto en nuestra BD ──────────────────────────────────────────
  const cleanEan = String(ean).trim()
  let product: any = null
  {
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id, title, description, brand, category, author, sku, ean, isbn,
        price, cost_price, canonical_weight_g, image_url, language, binding,
        pages, year_edition, edition_date, ibic_subjects, subject, course,
        height, width, thickness, condition, custom_fields
      `,
      )
      .or(`ean.eq.${cleanEan},isbn.eq.${cleanEan}`)
      .limit(1)
      .single()

    if (data) {
      product = data
    } else if (error && error.message?.includes("column")) {
      console.warn(`[push-product] product select falló: ${error.message}, reintentando con columnas base`)
      const { data: fallback } = await supabase
        .from("products")
        .select(
          "id, title, description, brand, category, sku, ean, price, stock, image_url, condition, custom_fields, canonical_weight_g",
        )
        .or(`ean.eq.${cleanEan},isbn.eq.${cleanEan}`)
        .limit(1)
        .single()
      if (fallback) product = fallback
    }
  }

  if (!product) return { ok: false, error: `No se encontró producto con EAN/ISBN: ${cleanEan}` }

  const cf = (product.custom_fields as Record<string, any>) ?? {}

  // ── 3. Precio según configuración de la tienda ─────────────────────────
  let salePrice: string = String(product.price ?? "0")

  if (store.price_source === "product_prices" && store.price_list_id) {
    const { data: pp } = await supabase
      .from("product_prices")
      .select("calculated_price")
      .eq("product_id", product.id)
      .eq("price_list_id", store.price_list_id)
      .maybeSingle()
    if (pp?.calculated_price != null) salePrice = String(pp.calculated_price)
  }

  if (store.price_source === "custom_fields_precio_ars") {
    const arsPrice = Number(cf.precio_ars)
    if (arsPrice > 0) salePrice = String(arsPrice)
  }

  // ── 4. Stock desde el almacén configurado ──────────────────────────────
  // Strategy: prefer warehouse-consolidated stock (from stock_by_source),
  // fall back to supplier_catalog_items if no warehouse mapping exists.
  const warehouseId = store.default_warehouse_id
  const { data: mappings } = await supabase
    .from("shopify_location_mappings")
    .select("warehouse_id, shopify_location_id, location_name")
    .eq("store_id", storeId)

  const inventoryByLocation: { location_id: string; qty: number }[] = []
  let stockMode: "warehouse_consolidated" | "legacy_fallback" = "legacy_fallback"

  if (mappings?.length) {
    // Try warehouse-consolidated stock first (from stock_by_source + import_sources)
    const warehouseIds = warehouseId
      ? [warehouseId]
      : [...new Set(mappings.map((m: any) => m.warehouse_id).filter(Boolean))]

    // Resolve consolidated stock per warehouse
    const warehouseStockByWh: Record<string, number> = {}
    let anyConsolidatedResolved = false

    for (const whId of warehouseIds) {
      const resolved = await resolveProductStockForWarehouse(supabase, whId, [product.id])
      if (resolved.mode === "warehouse_consolidated" && product.id in resolved.stockMap) {
        warehouseStockByWh[whId] = resolved.stockMap[product.id]
        anyConsolidatedResolved = true
      }
    }

    if (anyConsolidatedResolved) {
      // Use consolidated stock — populate inventoryByLocation from resolved values
      stockMode = "warehouse_consolidated"
      for (const m of mappings) {
        if (warehouseId && m.warehouse_id !== warehouseId) continue
        inventoryByLocation.push({
          location_id: m.shopify_location_id,
          qty: warehouseStockByWh[m.warehouse_id] ?? 0,
        })
      }
      console.log(
        `[push-product] stock_mode=warehouse_consolidated ean=${cleanEan} warehouse_ids=${warehouseIds.join(",")} stock=${JSON.stringify(warehouseStockByWh)}`,
      )
    } else {
      // Fallback: use supplier_catalog_items (legacy path)
      stockMode = "legacy_fallback"
      for (const m of mappings) {
        if (warehouseId && m.warehouse_id !== warehouseId) continue
        const { data: stockRow } = await supabase
          .from("supplier_catalog_items")
          .select("stock_quantity")
          .eq("product_id", product.id)
          .eq("warehouse_id", m.warehouse_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        inventoryByLocation.push({
          location_id: m.shopify_location_id,
          qty: stockRow?.stock_quantity ?? 0,
        })
      }
      console.log(
        `[push-product] stock_mode=legacy_fallback ean=${cleanEan} warehouse_id=${warehouseId ?? "none"}`,
      )
    }
  }

  const totalStock = inventoryByLocation.reduce((s, l) => s + l.qty, 0)

  // ── 5. Tags ────────────────────────────────────────────────────────────
  const flags: string[] = Array.isArray(cf.flags) ? cf.flags.filter(Boolean) : []
  const tags = buildTags(product, flags)

  // ── 6. Metafields completos ────────────────────────────────────────────
  const dimensiones =
    product.height != null && product.width != null
      ? `${product.height} x ${product.width} x ${product.thickness ?? 0}`
      : (cf.dimensiones ?? "")

  const pesoKg = product.canonical_weight_g
    ? `${(Number(product.canonical_weight_g) / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`
    : cf.peso
      ? String(cf.peso)
      : ""

  const shortDesc = cf.short_description || (product.description ? product.description.slice(0, 160) : "")

  const fechaPublicacion =
    product.edition_date ?? (product.year_edition ? String(product.year_edition) : "") ?? cf.fecha_de_publicacion ?? ""

  const metafields: { namespace: string; key: string; value: string; type: string }[] = [
    { namespace: "custom", key: "autor", value: product.author ?? "", type: "single_line_text_field" },
    { namespace: "custom", key: "editorial", value: product.brand ?? "", type: "single_line_text_field" },
    { namespace: "custom", key: "idioma", value: product.language ?? cf.idioma ?? "", type: "single_line_text_field" },
    { namespace: "custom", key: "isbn", value: product.isbn ?? "", type: "single_line_text_field" },
    {
      namespace: "custom",
      key: "tematica",
      value: product.category ?? cf.tematica ?? "",
      type: "single_line_text_field",
    },
    {
      namespace: "custom",
      key: "tematica_especifica",
      value: cf.tematica_especifica ?? product.ibic_subjects ?? "",
      type: "single_line_text_field",
    },
    {
      namespace: "custom",
      key: "paginas",
      value: product.pages != null ? String(product.pages) : "",
      type: "number_integer",
    },
    {
      namespace: "custom",
      key: "encuadernacion",
      value: product.binding ?? cf.encuadernacion ?? "",
      type: "single_line_text_field",
    },
    { namespace: "custom", key: "fecha_de_publicacion", value: fechaPublicacion, type: "single_line_text_field" },
    { namespace: "custom", key: "n_edicion", value: cf.n_edicion ?? "", type: "single_line_text_field" },
    { namespace: "custom", key: "pais_de_origen", value: cf.pais_de_origen ?? "", type: "single_line_text_field" },
    {
      namespace: "custom",
      key: "alto_mm",
      value: product.height != null ? String(Math.round(Number(product.height) * 10)) : "",
      type: "number_integer",
    },
    {
      namespace: "custom",
      key: "ancho_mm",
      value: product.width != null ? String(Math.round(Number(product.width) * 10)) : "",
      type: "number_integer",
    },
    {
      namespace: "custom",
      key: "espesor_mm",
      value: product.thickness != null ? String(Math.round(Number(product.thickness) * 10)) : "",
      type: "number_integer",
    },
    { namespace: "custom", key: "dimensiones", value: dimensiones, type: "single_line_text_field" },
    { namespace: "custom", key: "peso", value: pesoKg, type: "single_line_text_field" },
    { namespace: "custom", key: "short_description", value: shortDesc, type: "single_line_text_field" },
    {
      namespace: "custom",
      key: "condicion",
      value: product.condition ?? cf.condicion ?? "Nuevo",
      type: "single_line_text_field",
    },
    {
      namespace: "custom",
      key: "codigo_ibic",
      value: product.ibic_subjects ?? cf.codigo_ibic ?? "",
      type: "single_line_text_field",
    },
    {
      namespace: "custom",
      key: "sucursal_stock",
      value: store.sucursal_stock_code ?? cf.sucursal_stock ?? "",
      type: "single_line_text_field",
    },
    { namespace: "custom", key: "ean", value: product.ean ?? "", type: "single_line_text_field" },
    { namespace: "custom", key: "materia", value: product.subject ?? cf.materia ?? "", type: "single_line_text_field" },
    { namespace: "custom", key: "curso", value: product.course ?? cf.curso ?? "", type: "single_line_text_field" },
    {
      namespace: "mm-google-shopping",
      key: "google_product_category",
      value: cf.google_product_category ? String(cf.google_product_category) : "",
      type: "single_line_text_field",
    },
  ].filter((m) => m.value !== "")

  // ── 7. Payload del producto Shopify ────────────────────────────────────
  const variantSku = product.sku ?? product.isbn ?? product.ean ?? cleanEan
  const variantBarcode = product.ean ?? product.isbn ?? cleanEan
  const weightG = product.canonical_weight_g ?? 0

  const vendor = store.vendor ?? product.brand ?? ""
  const pCategory = store.product_category ?? "Media > Books > Print Books"

  const productPayload = {
    product: {
      title: product.title,
      body_html: product.description ? `<p>${product.description}</p>` : "",
      vendor,
      product_type: "Libro",
      tags,
      handle: buildHandle(product.title ?? variantSku),
      status: "active",
      variants: [
        {
          sku: variantSku,
          barcode: variantBarcode,
          price: salePrice,
          grams: weightG,
          weight: weightG,
          weight_unit: "g",
          inventory_management: mappings?.length ? "shopify" : null,
          inventory_policy: "deny",
          requires_shipping: true,
          taxable: true,
        },
      ],
      images: product.image_url ? [{ src: product.image_url, alt: product.title }] : [],
      metafields,
    },
  }

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      product_id: product.id,
      payload: productPayload,
      tags,
      metafields,
      inventory_by_location: inventoryByLocation,
      stock_mode: stockMode,
      price_used: salePrice,
      price_source: store.price_source,
    }
  }

  // ── 8. ¿Ya existe en Shopify? ──────────────────────────────────────────
  let shopifyProductId: number | null = null
  let shopifyVariantId: number | null = null
  let action: "created" | "updated" = "created"

  const { data: existingLink } = await supabase
    .from("shopify_product_links")
    .select("shopify_product_id, shopify_variant_id")
    .eq("product_id", product.id)
    .eq("store_id", storeId)
    .maybeSingle()

  if (existingLink?.shopify_product_id) {
    shopifyProductId = existingLink.shopify_product_id
    shopifyVariantId = existingLink.shopify_variant_id
    action = "updated"
  } else {
    const searchRes = await shopifyRest(
      "GET",
      `/products.json?barcode=${encodeURIComponent(variantBarcode)}&limit=1`,
      token,
      store.shop_domain,
    )
    if (searchRes.products?.length > 0) {
      const sp = searchRes.products[0]
      shopifyProductId = sp.id
      shopifyVariantId = sp.variants?.[0]?.id ?? null
      action = "updated"
    }
  }

  // ── 9. Crear o actualizar ──────────────────────────────────────────────
  let shopifyProduct: any
  if (action === "created" || !shopifyProductId) {
    const res = await shopifyRest("POST", "/products.json", token, store.shop_domain, productPayload)
    shopifyProduct = res.product
    shopifyProductId = shopifyProduct.id
    shopifyVariantId = shopifyProduct.variants?.[0]?.id ?? null
    action = "created"
  } else {
    await shopifyRest("PUT", `/products/${shopifyProductId}.json`, token, store.shop_domain, {
      product: {
        id: shopifyProductId,
        title: productPayload.product.title,
        body_html: productPayload.product.body_html,
        vendor: productPayload.product.vendor,
        product_type: "Libro",
        tags: productPayload.product.tags,
        status: "active",
      },
    })
    if (shopifyVariantId) {
      await shopifyRest("PUT", `/variants/${shopifyVariantId}.json`, token, store.shop_domain, {
        variant: {
          id: shopifyVariantId,
          sku: variantSku,
          barcode: variantBarcode,
          price: salePrice,
          grams: weightG,
        },
      })
    }
    shopifyProduct = { id: shopifyProductId }
  }

  // ── 10. Metafields ─────────────────────────────────────────────────────
  let metafieldsSet = action === "created" ? metafields.length : 0

  if (action === "updated" && metafields.length > 0) {
    let existingMfs: any[] = []
    try {
      const mfsRes = await shopifyRest(
        "GET",
        `/products/${shopifyProductId}/metafields.json?limit=250`,
        token,
        store.shop_domain,
      )
      existingMfs = mfsRes.metafields ?? []
    } catch {}

    for (const mf of metafields) {
      const existing = existingMfs.find((e: any) => e.namespace === mf.namespace && e.key === mf.key)
      try {
        if (existing) {
          await shopifyRest(
            "PUT",
            `/products/${shopifyProductId}/metafields/${existing.id}.json`,
            token,
            store.shop_domain,
            { metafield: { id: existing.id, value: mf.value, type: mf.type } },
          )
        } else {
          await shopifyRest("POST", `/products/${shopifyProductId}/metafields.json`, token, store.shop_domain, {
            metafield: mf,
          })
        }
        metafieldsSet++
      } catch (e: any) {
        console.error(`[push-product] metafield ${mf.key} error:`, e.message)
      }
    }
  }

  // ── 11. Inventario por location ────────────────────────────────────────
  let inventoryUpdated = 0
  if (shopifyVariantId && inventoryByLocation.length) {
    const varRes = await shopifyRest("GET", `/variants/${shopifyVariantId}.json`, token, store.shop_domain)
    const inventoryItemId = varRes.variant?.inventory_item_id ?? null

    if (inventoryItemId) {
      for (const loc of inventoryByLocation) {
        try {
          await shopifyRest("POST", "/inventory_levels/set.json", token, store.shop_domain, {
            location_id: loc.location_id,
            inventory_item_id: inventoryItemId,
            available: loc.qty,
          })
          inventoryUpdated++
        } catch {}
      }
    }
  }

  // ── 12. Guardar link en BD ─────────────────────────────────────────────
  await supabase.from("shopify_product_links").upsert(
    {
      product_id: product.id,
      store_id: storeId,
      shopify_product_id: shopifyProductId,
      shopify_variant_id: shopifyVariantId,
      shopify_sku: variantSku,
      shopify_barcode: variantBarcode,
      shopify_title: product.title,
      shopify_price: parseFloat(salePrice),
      shopify_status: "active",
      shopify_image_url: product.image_url ?? null,
      matched_by: "ean",
      matched_value: cleanEan,
      sync_status: "synced",
      sync_error: null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,store_id" },
  )

  return {
    ok: true,
    action,
    shopify_product_id: shopifyProductId,
    shopify_variant_id: shopifyVariantId,
    shopify_url: `https://${store.shop_domain}/admin/products/${shopifyProductId}`,
    metafields_set: metafieldsSet,
    inventory_updated: inventoryUpdated,
    inventory_by_location: inventoryByLocation,
    stock_mode: stockMode,
    tags,
    price_used: salePrice,
    price_source: store.price_source,
  }
}
