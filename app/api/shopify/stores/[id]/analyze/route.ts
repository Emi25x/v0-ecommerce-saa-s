/**
 * GET /api/shopify/stores/[id]/analyze
 *
 * Reverse-engineers a Shopify store's product structure by fetching
 * a sample of existing products with their metafields.
 *
 * Returns:
 *   - fields_detected: all fields/metafields found across products
 *   - suggested_mapping: auto-map from Shopify fields → our DB columns
 *   - sample_products: a few products for preview
 *   - vendors/types/tags: unique values found (useful for defaults)
 */

import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getValidToken } from "@/domains/shopify/auth"

// GraphQL query that fetches products WITH metafields
const PRODUCTS_WITH_METAFIELDS_QUERY = `
  query AnalyzeProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          descriptionHtml
          vendor
          productType
          tags
          status
          handle
          createdAt
          updatedAt
          publishedAt
          templateSuffix
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                sku
                barcode
                inventoryQuantity
                taxable
              }
            }
          }
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          metafields(first: 50) {
            edges {
              node {
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    }
  }
`

// Known mappings from Shopify metafield keys → our DB product columns
const METAFIELD_TO_DB: Record<string, string> = {
  "custom.autor": "author",
  "custom.editorial": "brand",
  "custom.idioma": "language",
  "custom.isbn": "isbn",
  "custom.tematica": "category",
  "custom.tematica_especifica": "ibic_subjects",
  "custom.paginas": "pages",
  "custom.encuadernacion": "binding",
  "custom.fecha_de_publicacion": "edition_date",
  "custom.alto_mm": "height",
  "custom.ancho_mm": "width",
  "custom.espesor_mm": "thickness",
  "custom.peso": "canonical_weight_g",
  "custom.pais_de_origen": "country_of_origin",
  "custom.ean": "ean",
  "custom.materia": "subject",
  "custom.curso": "course",
  "custom.condicion": "condition",
  "custom.codigo_ibic": "ibic_subjects",
  "custom.n_edicion": "year_edition",
  "custom.short_description": "description",
}

// Core Shopify fields → our DB columns
const CORE_FIELD_TO_DB: Record<string, string> = {
  title: "title",
  descriptionHtml: "description",
  vendor: "brand",
  productType: "category",
  "variant.sku": "sku",
  "variant.barcode": "ean",
  "variant.price": "price",
  "variant.compareAtPrice": "compare_at_price",
  "variant.inventoryQuantity": "stock",
  "variant.weight": "canonical_weight_g",
  "image.url": "image_url",
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Load store with credentials
    const { data: store, error: storeError } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain, access_token, api_key, api_secret, token_expires_at, name")
      .eq("id", storeId)
      .eq("owner_user_id", user.id)
      .maybeSingle()

    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })
    }

    // Get valid token (auto-renews if expired)
    const accessToken = await getValidToken(supabase, store)

    // How many products to sample
    const sampleSize = parseInt(request.nextUrl.searchParams.get("sample") || "25", 10)
    const limitedSample = Math.min(Math.max(sampleSize, 5), 50)

    // Fetch products with metafields from Shopify
    const apiUrl = `https://${store.shop_domain}/admin/api/2024-01/graphql.json`
    const gqlRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: PRODUCTS_WITH_METAFIELDS_QUERY,
        variables: { first: limitedSample },
      }),
    })

    if (!gqlRes.ok) {
      const text = await gqlRes.text()
      return NextResponse.json(
        { error: `Shopify API error: ${gqlRes.status} — ${text.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const gqlData = await gqlRes.json()
    if (gqlData.errors) {
      return NextResponse.json(
        { error: `GraphQL error: ${JSON.stringify(gqlData.errors)}` },
        { status: 502 }
      )
    }

    const edges = gqlData.data?.products?.edges ?? []

    // Analyze the products
    const vendors = new Set<string>()
    const productTypes = new Set<string>()
    const allTags = new Set<string>()
    const metafieldKeys = new Map<string, { type: string; count: number; sample_values: string[] }>()
    const coreFieldsUsed = new Set<string>()
    const sampleProducts: any[] = []

    for (const { node: product } of edges) {
      // Core fields
      if (product.vendor) vendors.add(product.vendor)
      if (product.productType) productTypes.add(product.productType)
      if (product.tags) {
        for (const tag of product.tags) allTags.add(tag)
      }

      coreFieldsUsed.add("title")
      if (product.descriptionHtml) coreFieldsUsed.add("descriptionHtml")
      if (product.vendor) coreFieldsUsed.add("vendor")
      if (product.productType) coreFieldsUsed.add("productType")
      if (product.publishedAt) coreFieldsUsed.add("publishedAt")

      // Variants
      const variants = product.variants?.edges?.map((v: any) => v.node) ?? []
      for (const v of variants) {
        if (v.sku) coreFieldsUsed.add("variant.sku")
        if (v.barcode) coreFieldsUsed.add("variant.barcode")
        if (v.price) coreFieldsUsed.add("variant.price")
        if (v.compareAtPrice) coreFieldsUsed.add("variant.compareAtPrice")
      }

      // Images
      const images = product.images?.edges?.map((i: any) => i.node) ?? []
      if (images.length > 0) coreFieldsUsed.add("image.url")

      // Metafields
      const metafields = product.metafields?.edges?.map((m: any) => m.node) ?? []
      for (const mf of metafields) {
        const fullKey = `${mf.namespace}.${mf.key}`
        const existing = metafieldKeys.get(fullKey)
        if (existing) {
          existing.count++
          if (existing.sample_values.length < 3 && mf.value) {
            existing.sample_values.push(String(mf.value).slice(0, 100))
          }
        } else {
          metafieldKeys.set(fullKey, {
            type: mf.type,
            count: 1,
            sample_values: mf.value ? [String(mf.value).slice(0, 100)] : [],
          })
        }
      }

      // Build sample product
      sampleProducts.push({
        id: product.id,
        title: product.title,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags,
        status: product.status,
        variant_count: variants.length,
        first_variant: variants[0] ? {
          sku: variants[0].sku,
          barcode: variants[0].barcode,
          price: variants[0].price,
          inventory_quantity: variants[0].inventoryQuantity,
        } : null,
        image_count: images.length,
        metafield_count: metafields.length,
        metafields: metafields.map((mf: any) => ({
          key: `${mf.namespace}.${mf.key}`,
          type: mf.type,
          value: String(mf.value).slice(0, 100),
        })),
      })
    }

    // Build suggested mapping
    const suggestedMapping: Record<string, { shopify_field: string; db_column: string; confidence: string }> = {}

    // Core fields
    for (const field of coreFieldsUsed) {
      const dbCol = CORE_FIELD_TO_DB[field]
      if (dbCol) {
        suggestedMapping[field] = {
          shopify_field: field,
          db_column: dbCol,
          confidence: "high",
        }
      }
    }

    // Metafields
    for (const [fullKey, info] of metafieldKeys) {
      const dbCol = METAFIELD_TO_DB[fullKey]
      suggestedMapping[`metafield:${fullKey}`] = {
        shopify_field: `metafield:${fullKey}`,
        db_column: dbCol || "",
        confidence: dbCol ? "high" : "unknown",
      }
    }

    // Build fields_detected summary
    const fieldsDetected = {
      core: Array.from(coreFieldsUsed).sort(),
      metafields: Array.from(metafieldKeys.entries()).map(([key, info]) => ({
        key,
        type: info.type,
        usage_count: info.count,
        usage_pct: Math.round((info.count / edges.length) * 100),
        sample_values: info.sample_values,
        suggested_db_column: METAFIELD_TO_DB[key] || null,
      })).sort((a, b) => b.usage_count - a.usage_count),
    }

    return NextResponse.json({
      store_id: storeId,
      store_name: store.name || store.shop_domain,
      products_analyzed: edges.length,
      has_more: gqlData.data?.products?.pageInfo?.hasNextPage ?? false,

      fields_detected: fieldsDetected,
      suggested_mapping: suggestedMapping,

      unique_vendors: Array.from(vendors).sort(),
      unique_types: Array.from(productTypes).sort(),
      unique_tags: Array.from(allTags).sort().slice(0, 50),

      sample_products: sampleProducts,
    })
  } catch (e: any) {
    console.error("[shopify/analyze]", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
