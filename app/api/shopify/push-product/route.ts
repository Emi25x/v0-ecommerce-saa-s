/**
 * POST /api/shopify/push-product
 *
 * Busca un producto en nuestra DB por EAN/ISBN y lo crea o actualiza en
 * Shopify con:
 *   - title / body_html / vendor / product_type / tags
 *   - variant: sku, barcode, price, weight (grams)
 *   - image principal
 *   - metafields custom.* según template
 *   - inventario por location (warehouses mapeados)
 *
 * Body: { store_id, ean, dry_run?: boolean }
 * Response: { ok, action, shopify_product_id, shopify_variant_id, shopify_url, metafields_set, inventory_updated }
 */

import { createClient } from "@/lib/supabase/server"
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

function buildTags(p: any, flags: string[] = []): string {
  const parts: string[] = []
  if (p.category)      parts.push(String(p.category))
  if (p.brand)         parts.push(p.brand)
  parts.push("catalogo")
  if (p.author)        parts.push(p.author)

  // "Titulo A-C" rango por primera letra
  const first = (p.title ?? "").trim()[0]?.toUpperCase()
  if (first) {
    const RANGES = [
      ["A", "C"], ["D", "F"], ["G", "I"], ["J", "L"],
      ["M", "O"], ["P", "R"], ["S", "U"], ["V", "Z"],
    ]
    for (const [lo, hi] of RANGES) {
      if (first >= lo && first <= hi) {
        parts.push(`Titulo ${lo}-${hi}`)
        break
      }
    }
  }

  for (const f of flags) parts.push(f)

  return [...new Set(parts.filter(Boolean))].join(", ")
}

async function shopifyRest(
  method: string,
  path: string,
  token: string,
  domain: string,
  body?: any
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
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { store_id, ean, dry_run = false } = body

    if (!store_id || !ean) {
      return NextResponse.json({ ok: false, error: "store_id y ean son requeridos" }, { status: 400 })
    }

    // ── 1. Tienda ──────────────────────────────────────────────────────────
    const { data: store, error: storeErr } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain, access_token, api_key, api_secret, token_expires_at, currency")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (storeErr || !store) return NextResponse.json({ ok: false, error: "Tienda no encontrada" }, { status: 404 })

    const token = await getValidToken(supabase, store)

    // ── 2. Producto en nuestra DB ──────────────────────────────────────────
    const cleanEan = String(ean).trim()
    const { data: product } = await supabase
      .from("products")
      .select(`
        id, title, description, brand, category, author, sku, ean, isbn,
        price, canonical_weight_g, image_url, language, binding, pages,
        year_edition, ibic_subjects, subject, course, height, width,
        thickness, condition, custom_fields, ml_item_id
      `)
      .or(`ean.eq.${cleanEan},isbn.eq.${cleanEan}`)
      .limit(1)
      .single()

    if (!product) return NextResponse.json({ ok: false, error: `No se encontró producto con EAN/ISBN: ${cleanEan}` }, { status: 404 })

    // ── 3. Stock por warehouse mapeado ─────────────────────────────────────
    const { data: mappings } = await supabase
      .from("shopify_location_mappings")
      .select("warehouse_id, shopify_location_id, location_name, warehouses(name, country)")
      .eq("store_id", store_id)

    const inventoryByLocation: { location_id: string; qty: number; name: string }[] = []
    if (mappings?.length) {
      for (const m of mappings) {
        const { data: stockRow } = await supabase
          .from("supplier_catalog_items")
          .select("stock_quantity")
          .eq("product_id", product.id)
          .eq("warehouse_id", m.warehouse_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .single()

        inventoryByLocation.push({
          location_id: m.shopify_location_id,
          qty:         stockRow?.stock_quantity ?? 0,
          name:        (m as any).warehouses?.name ?? m.location_name ?? "Almacén",
        })
      }
    }

    // ── 4. Tags ────────────────────────────────────────────────────────────
    const flags: string[] = []
    const cf = product.custom_fields as any
    if (Array.isArray(cf?.flags)) flags.push(...cf.flags)
    const tags = buildTags(product, flags)

    // ── 5. Datos del producto Shopify ──────────────────────────────────────
    const variantSku     = product.sku ?? product.isbn ?? product.ean ?? cleanEan
    const variantBarcode = product.ean ?? product.isbn ?? cleanEan
    const weightG        = product.canonical_weight_g ?? 0

    const productPayload = {
      product: {
        title:        product.title,
        body_html:    product.description ?? "",
        vendor:       product.brand ?? "",
        product_type: "Libro",
        tags,
        handle:       buildHandle(product.title),
        status:       "active",
        variants: [{
          sku:                  variantSku,
          barcode:              variantBarcode,
          price:                String(product.price ?? "0"),
          grams:                weightG,
          weight:               weightG,
          weight_unit:          "g",
          inventory_management: mappings?.length ? "shopify" : null,
          inventory_policy:     "deny",
          requires_shipping:    true,
          taxable:              false,
        }],
        images: product.image_url
          ? [{ src: product.image_url, alt: product.title }]
          : [],
      },
    }

    if (dry_run) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        product_id: product.id,
        payload: productPayload,
        tags,
        inventory_by_location: inventoryByLocation,
      })
    }

    // ── 6. ¿Ya existe en Shopify? Buscar por barcode ───────────────────────
    let shopifyProductId: number | null = null
    let shopifyVariantId: number | null = null
    let shopifyInventoryItemId: number | null = null
    let action: "created" | "updated" = "created"

    // Primero revisar link guardado en DB
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
        token, store.shop_domain
      )
      if (searchRes.products?.length > 0) {
        const sp = searchRes.products[0]
        shopifyProductId = sp.id
        shopifyVariantId = sp.variants?.[0]?.id ?? null
        action = "updated"
      }
    }

    // ── 7. Crear o actualizar producto ─────────────────────────────────────
    let shopifyProduct: any
    if (action === "created" || !shopifyProductId) {
      const res = await shopifyRest("POST", "/products.json", token, store.shop_domain, productPayload)
      shopifyProduct   = res.product
      shopifyProductId = shopifyProduct.id
      shopifyVariantId = shopifyProduct.variants?.[0]?.id ?? null
      action = "created"
    } else {
      // Actualizar solo campos de producto (preservar variantes/imágenes existentes)
      const updateBody = {
        product: {
          id:           shopifyProductId,
          title:        productPayload.product.title,
          body_html:    productPayload.product.body_html,
          vendor:       productPayload.product.vendor,
          product_type: productPayload.product.product_type,
          tags:         productPayload.product.tags,
          status:       "active",
        },
      }
      const res = await shopifyRest("PUT", `/products/${shopifyProductId}.json`, token, store.shop_domain, updateBody)
      shopifyProduct = res.product

      // Actualizar variante (precio, sku, barcode, grams)
      if (shopifyVariantId) {
        await shopifyRest("PUT", `/variants/${shopifyVariantId}.json`, token, store.shop_domain, {
          variant: {
            id:      shopifyVariantId,
            sku:     variantSku,
            barcode: variantBarcode,
            price:   String(product.price ?? "0"),
            grams:   weightG,
          },
        })
      }
    }

    // ── 8. Metafields ──────────────────────────────────────────────────────
    const metafields = [
      { key: "autor",              value: product.author     ?? "", type: "single_line_text_field" },
      { key: "editorial",          value: product.brand      ?? "", type: "single_line_text_field" },
      { key: "idioma",             value: product.language   ?? "", type: "single_line_text_field" },
      { key: "isbn",               value: product.isbn       ?? "", type: "single_line_text_field" },
      { key: "tematica",           value: product.category   ?? "", type: "single_line_text_field" },
      { key: "tematica_especifica",value: product.subject    ?? "", type: "single_line_text_field" },
      { key: "paginas",            value: product.pages      ? String(product.pages) : "", type: "number_integer" },
      { key: "encuadernacion",     value: product.binding    ?? "", type: "single_line_text_field" },
      { key: "anio_edicion",       value: product.year_edition ?? "", type: "single_line_text_field" },
      { key: "alto_mm",            value: product.height     ? String(Math.round(Number(product.height))) : "", type: "number_integer" },
      { key: "ancho_mm",           value: product.width      ? String(Math.round(Number(product.width)))  : "", type: "number_integer" },
      { key: "espesor_mm",         value: product.thickness  ? String(Math.round(Number(product.thickness))) : "", type: "number_integer" },
      { key: "peso_g",             value: weightG ? String(weightG) : "", type: "number_integer" },
      { key: "condicion",          value: product.condition  ?? "nuevo", type: "single_line_text_field" },
      { key: "codigo_ibic",        value: product.ibic_subjects ?? "", type: "single_line_text_field" },
      { key: "ean",                value: product.ean        ?? "", type: "single_line_text_field" },
      { key: "materia",            value: product.subject    ?? "", type: "single_line_text_field" },
      { key: "curso",              value: product.course     ?? "", type: "single_line_text_field" },
    ].filter(m => m.value !== "")

    let metafieldsSet = 0
    for (const mf of metafields) {
      try {
        await shopifyRest("POST", `/products/${shopifyProductId}/metafields.json`, token, store.shop_domain, {
          metafield: { namespace: "custom", key: mf.key, value: mf.value, type: mf.type },
        })
        metafieldsSet++
      } catch { /* metafield may already exist — ignore duplicate errors */ }
    }

    // ── 9. Inventario por location ─────────────────────────────────────────
    let inventoryUpdated = 0
    if (shopifyVariantId && inventoryByLocation.length) {
      // Obtener inventory_item_id de la variante
      const varRes = await shopifyRest(
        "GET", `/variants/${shopifyVariantId}.json`, token, store.shop_domain
      )
      shopifyInventoryItemId = varRes.variant?.inventory_item_id ?? null

      if (shopifyInventoryItemId) {
        for (const loc of inventoryByLocation) {
          try {
            await shopifyRest("POST", "/inventory_levels/set.json", token, store.shop_domain, {
              location_id:        loc.location_id,
              inventory_item_id:  shopifyInventoryItemId,
              available:          loc.qty,
            })
            inventoryUpdated++
          } catch { /* best-effort */ }
        }
      }
    }

    // ── 10. Guardar/actualizar link en nuestra DB ──────────────────────────
    await supabase.from("shopify_product_links").upsert({
      product_id:         product.id,
      store_id:           store_id,
      shopify_product_id: shopifyProductId,
      shopify_variant_id: shopifyVariantId,
      shopify_sku:        variantSku,
      shopify_barcode:    variantBarcode,
      shopify_title:      product.title,
      shopify_price:      product.price,
      shopify_status:     "active",
      shopify_image_url:  product.image_url ?? null,
      matched_by:         "ean",
      matched_value:      cleanEan,
      sync_status:        "synced",
      sync_error:         null,
      last_synced_at:     new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    }, { onConflict: "product_id,store_id" })

    const shopifyUrl = `https://${store.shop_domain}/admin/products/${shopifyProductId}`

    return NextResponse.json({
      ok:                 true,
      action,
      shopify_product_id: shopifyProductId,
      shopify_variant_id: shopifyVariantId,
      shopify_url:        shopifyUrl,
      metafields_set:     metafieldsSet,
      inventory_updated:  inventoryUpdated,
      inventory_by_location: inventoryByLocation,
      tags,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
