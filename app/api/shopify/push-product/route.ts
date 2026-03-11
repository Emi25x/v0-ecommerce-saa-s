/**
 * POST /api/shopify/push-product
 *
 * Sube un producto de nuestra BD directamente a una tienda Shopify.
 * Crea el producto si no existe, o actualiza si ya está publicado.
 *
 * Mapeo respeta exactamente el template Excel de importación:
 *   - Handle, Title, Body HTML, Vendor, Product Category, Type, Tags
 *   - Variant: SKU=ISBN, Barcode=EAN, Price (configurable), Grams, Inventory
 *   - Metafields: autor, editorial, idioma, isbn, tematica, tematica_especifica,
 *                 numero_de_paginas, encuadernacion, fecha_de_publicacion, n_edicion,
 *                 pais_de_origen, alto_mm, ancho_mm, dimensiones, peso,
 *                 short_description, sucursal_stock, ean
 *
 * Body: { store_id, ean, dry_run?: boolean }
 */

import { createClient }  from "@/lib/supabase/server"
import { getValidToken } from "@/lib/shopify-auth"
import { NextRequest, NextResponse } from "next/server"

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
  ["A", "C"], ["D", "F"], ["G", "I"], ["J", "L"],
  ["M", "O"], ["P", "R"], ["S", "U"], ["V", "Z"],
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

/**
 * Construye los tags según el template:
 *   pages, editorial, "catalogo", autor, Titulo A-C, flags...
 */
function buildTags(p: any, flags: string[]): string {
  const parts: string[] = []
  if (p.pages)  parts.push(String(p.pages))   // número de páginas como tag
  if (p.brand)  parts.push(p.brand)             // editorial
  parts.push("catalogo")                         // siempre
  if (p.author) parts.push(p.author)             // autor
  parts.push(titleRangeTag(p.title ?? ""))       // rango por letra
  for (const f of flags) if (f) parts.push(f)  // flags custom (ej: "Más Vendidos")
  return [...new Set(parts.filter(Boolean))].join(", ")
}

async function shopifyRest(
  method: string,
  path: string,
  token: string,
  domain: string,
  body?: any,
): Promise<any> {
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
    try { msg += `: ${JSON.parse(text).errors ?? text.slice(0, 300)}` } catch {}
    throw new Error(msg)
  }
  return text ? JSON.parse(text) : {}
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { store_id, ean, dry_run = false } = body

    if (!store_id || !ean)
      return NextResponse.json({ ok: false, error: "store_id y ean son requeridos" }, { status: 400 })

    // ── 1. Tienda + configuración de exportación ───────────────────────────
    const { data: store, error: storeErr } = await supabase
      .from("shopify_stores")
      .select(`
        id, shop_domain, access_token, api_key, api_secret, token_expires_at,
        currency, vendor, product_category, price_source, price_list_id,
        default_warehouse_id, sucursal_stock_code
      `)
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (storeErr || !store)
      return NextResponse.json({ ok: false, error: "Tienda no encontrada" }, { status: 404 })

    const token = await getValidToken(supabase, store)

    // ── 2. Producto en nuestra BD ──────────────────────────────────────────
    const cleanEan = String(ean).trim()
    const { data: product } = await supabase
      .from("products")
      .select(`
        id, title, description, brand, category, author, sku, ean, isbn,
        price, cost_price, canonical_weight_g, image_url, language, binding,
        pages, year_edition, edition_date, ibic_subjects, subject, course,
        height, width, thickness, condition, custom_fields
      `)
      .or(`ean.eq.${cleanEan},isbn.eq.${cleanEan}`)
      .limit(1)
      .single()

    if (!product)
      return NextResponse.json(
        { ok: false, error: `No se encontró producto con EAN/ISBN: ${cleanEan}` },
        { status: 404 },
      )

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

    // Precio en ARS desde custom_fields (para tiendas/almacenes con moneda ARS)
    if (store.price_source === "custom_fields_precio_ars") {
      const arsPrice = Number(cf.precio_ars)
      if (arsPrice > 0) salePrice = String(arsPrice)
    }

    // ── 4. Stock desde el almacén configurado ──────────────────────────────
    // Locations mapeados para inventario por location en Shopify
    const warehouseId = store.default_warehouse_id
    const { data: mappings } = await supabase
      .from("shopify_location_mappings")
      .select("warehouse_id, shopify_location_id, location_name")
      .eq("store_id", store_id)

    const inventoryByLocation: { location_id: string; qty: number }[] = []
    if (mappings?.length) {
      for (const m of mappings) {
        // Si hay almacén configurado, priorizar ese; sino tomar todos los mapeados
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
          qty:         stockRow?.stock_quantity ?? 0,
        })
      }
    }

    // Stock total para el variant (suma de locations, o 0 si no hay mapping)
    const totalStock = inventoryByLocation.reduce((s, l) => s + l.qty, 0)

    // ── 5. Tags ────────────────────────────────────────────────────────────
    const flags: string[] = Array.isArray(cf.flags) ? cf.flags.filter(Boolean) : []
    const tags = buildTags(product, flags)

    // ── 6. Metafields completos ────────────────────────────────────────────
    // Dimensiones en cm: "alto x espesor x ancho"
    const dimensiones = [product.height, product.thickness ?? 0, product.width]
      .every(v => v != null)
      ? `${product.height} x ${product.thickness ?? 0} x ${product.width}`
      : (cf.dimensiones ?? "")

    // Peso en kg
    const pesoKg = product.canonical_weight_g
      ? `${(Number(product.canonical_weight_g) / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`
      : (cf.peso ? String(cf.peso) : "")

    // short_description: resumen corto (hasta 160 chars)
    const shortDesc = cf.short_description
      || (product.description ? product.description.slice(0, 160) : "")

    // Fecha de publicación: año de edición o fecha completa
    const fechaPublicacion =
      product.edition_date
      ?? (product.year_edition ? String(product.year_edition) : "")
      ?? (cf.fecha_de_publicacion ?? "")

    const metafields: { namespace: string; key: string; value: string; type: string }[] = [
      { namespace: "custom", key: "autor",               value: product.author    ?? "",               type: "single_line_text_field" },
      { namespace: "custom", key: "editorial",           value: product.brand     ?? "",               type: "single_line_text_field" },
      { namespace: "custom", key: "idioma",              value: product.language  ?? (cf.idioma ?? ""), type: "single_line_text_field" },
      { namespace: "custom", key: "isbn",                value: product.isbn      ?? "",               type: "single_line_text_field" },
      { namespace: "custom", key: "tematica",            value: product.category  ?? (cf.tematica ?? ""), type: "single_line_text_field" },
      { namespace: "custom", key: "tematica_especifica", value: cf.tematica_especifica ?? product.ibic_subjects ?? "", type: "single_line_text_field" },
      { namespace: "custom", key: "numero_de_paginas",   value: product.pages != null ? String(product.pages) : "", type: "number_integer" },
      { namespace: "custom", key: "encuadernacion",      value: product.binding   ?? (cf.encuadernacion ?? ""), type: "single_line_text_field" },
      { namespace: "custom", key: "fecha_de_publicacion",value: fechaPublicacion,                      type: "single_line_text_field" },
      { namespace: "custom", key: "n_edicion",           value: cf.n_edicion      ?? "",               type: "single_line_text_field" },
      { namespace: "custom", key: "pais_de_origen",      value: cf.pais_de_origen ?? "",               type: "single_line_text_field" },
      { namespace: "custom", key: "alto_mm",             value: product.height    != null ? String(Math.round(Number(product.height) * 10)) : "", type: "number_integer" },
      { namespace: "custom", key: "ancho_mm",            value: product.width     != null ? String(Math.round(Number(product.width) * 10))  : "", type: "number_integer" },
      { namespace: "custom", key: "dimensiones",         value: dimensiones,                           type: "single_line_text_field" },
      { namespace: "custom", key: "peso",                value: pesoKg,                                type: "single_line_text_field" },
      { namespace: "custom", key: "short_description",   value: shortDesc,                             type: "single_line_text_field" },
      { namespace: "custom", key: "sucursal_stock",      value: store.sucursal_stock_code ?? "",       type: "single_line_text_field" },
      { namespace: "custom", key: "ean",                 value: product.ean       ?? "",               type: "single_line_text_field" },
      { namespace: "custom", key: "materia",             value: product.subject   ?? (cf.materia ?? ""), type: "single_line_text_field" },
      { namespace: "custom", key: "curso",               value: product.course    ?? (cf.curso ?? ""),  type: "single_line_text_field" },
    ].filter(m => m.value !== "")

    // ── 7. Payload del producto Shopify ────────────────────────────────────
    const variantSku     = product.sku ?? product.isbn ?? product.ean ?? cleanEan
    const variantBarcode = product.ean  ?? product.isbn ?? cleanEan
    const weightG        = product.canonical_weight_g ?? 0

    const vendor   = store.vendor          ?? product.brand ?? ""
    const pCategory= store.product_category ?? "Media > Books > Print Books"

    const productPayload = {
      product: {
        title:        product.title,
        body_html:    product.description ? `<p>${product.description}</p>` : "",
        vendor,
        product_type: "Libro",
        tags,
        handle:       buildHandle(product.title ?? variantSku),
        status:       "active",
        variants: [{
          sku:                  variantSku,
          barcode:              variantBarcode,
          price:                salePrice,
          grams:                weightG,
          weight:               weightG,
          weight_unit:          "g",
          inventory_management: mappings?.length ? "shopify" : null,
          inventory_policy:     "deny",
          requires_shipping:    true,
          taxable:              true,
        }],
        images: product.image_url
          ? [{ src: product.image_url, alt: product.title }]
          : [],
      },
    }

    if (dry_run) {
      return NextResponse.json({
        ok:                   true,
        dry_run:              true,
        product_id:           product.id,
        payload:              productPayload,
        tags,
        metafields,
        inventory_by_location: inventoryByLocation,
        price_used:           salePrice,
        price_source:         store.price_source,
      })
    }

    // ── 8. ¿Ya existe en Shopify? ──────────────────────────────────────────
    let shopifyProductId: number | null = null
    let shopifyVariantId: number | null = null
    let action: "created" | "updated" = "created"

    // Revisar link guardado
    const { data: existingLink } = await supabase
      .from("shopify_product_links")
      .select("shopify_product_id, shopify_variant_id")
      .eq("product_id", product.id)
      .eq("store_id", store_id)
      .maybeSingle()

    if (existingLink?.shopify_product_id) {
      shopifyProductId = existingLink.shopify_product_id
      shopifyVariantId = existingLink.shopify_variant_id
      action = "updated"
    } else {
      // Buscar por barcode en Shopify
      const searchRes = await shopifyRest(
        "GET",
        `/products.json?barcode=${encodeURIComponent(variantBarcode)}&limit=1`,
        token, store.shop_domain,
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
      const res      = await shopifyRest("POST", "/products.json", token, store.shop_domain, productPayload)
      shopifyProduct   = res.product
      shopifyProductId = shopifyProduct.id
      shopifyVariantId = shopifyProduct.variants?.[0]?.id ?? null
      action = "created"
    } else {
      // Actualizar producto (preservar imágenes/variantes extra)
      await shopifyRest("PUT", `/products/${shopifyProductId}.json`, token, store.shop_domain, {
        product: {
          id:           shopifyProductId,
          title:        productPayload.product.title,
          body_html:    productPayload.product.body_html,
          vendor:       productPayload.product.vendor,
          product_type: "Libro",
          tags:         productPayload.product.tags,
          status:       "active",
        },
      })
      // Actualizar variante
      if (shopifyVariantId) {
        await shopifyRest("PUT", `/variants/${shopifyVariantId}.json`, token, store.shop_domain, {
          variant: {
            id:      shopifyVariantId,
            sku:     variantSku,
            barcode: variantBarcode,
            price:   salePrice,
            grams:   weightG,
          },
        })
      }
      shopifyProduct = { id: shopifyProductId }
    }

    // ── 10. Metafields ─────────────────────────────────────────────────────
    // Usamos metafieldsSet bulk si es posible, sino POST individual
    let metafieldsSet = 0
    for (const mf of metafields) {
      try {
        // Intentar PUT (update) primero, si falla hacer POST (create)
        await shopifyRest(
          "POST",
          `/products/${shopifyProductId}/metafields.json`,
          token, store.shop_domain,
          { metafield: mf },
        )
        metafieldsSet++
      } catch {
        // Puede ya existir con el mismo namespace+key, ignorar duplicado
      }
    }

    // ── 11. Inventario por location ────────────────────────────────────────
    let inventoryUpdated = 0
    if (shopifyVariantId && inventoryByLocation.length) {
      const varRes = await shopifyRest(
        "GET", `/variants/${shopifyVariantId}.json`, token, store.shop_domain,
      )
      const inventoryItemId = varRes.variant?.inventory_item_id ?? null

      if (inventoryItemId) {
        for (const loc of inventoryByLocation) {
          try {
            await shopifyRest("POST", "/inventory_levels/set.json", token, store.shop_domain, {
              location_id:       loc.location_id,
              inventory_item_id: inventoryItemId,
              available:         loc.qty,
            })
            inventoryUpdated++
          } catch {}
        }
      }
    }

    // ── 12. Guardar link en BD ─────────────────────────────────────────────
    await supabase.from("shopify_product_links").upsert({
      product_id:         product.id,
      store_id,
      shopify_product_id: shopifyProductId,
      shopify_variant_id: shopifyVariantId,
      shopify_sku:        variantSku,
      shopify_barcode:    variantBarcode,
      shopify_title:      product.title,
      shopify_price:      parseFloat(salePrice),
      shopify_status:     "active",
      shopify_image_url:  product.image_url ?? null,
      matched_by:         "ean",
      matched_value:      cleanEan,
      sync_status:        "synced",
      sync_error:         null,
      last_synced_at:     new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }, { onConflict: "product_id,store_id" })

    return NextResponse.json({
      ok:                   true,
      action,
      shopify_product_id:   shopifyProductId,
      shopify_variant_id:   shopifyVariantId,
      shopify_url:          `https://${store.shop_domain}/admin/products/${shopifyProductId}`,
      metafields_set:       metafieldsSet,
      inventory_updated:    inventoryUpdated,
      inventory_by_location: inventoryByLocation,
      tags,
      price_used:           salePrice,
      price_source:         store.price_source,
    })
  } catch (err: any) {
    console.error("[push-product]", err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
