import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { getValidToken } from "@/domains/shopify/auth"

// Llama a GraphQL para buscar en TODA la tienda por título, SKU o barcode/ISBN
async function searchProductsGraphQL(
  shop_domain: string,
  access_token: string,
  rawQuery: string,
  limit: number
) {
  // Construir el filtro: detectar si parece un número (ISBN/SKU numérico) o texto
  const q = rawQuery.trim()
  // Buscar en título, sku y barcode a la vez usando OR
  const gqlFilter = `title:*${q}* OR sku:${q} OR barcode:${q} OR tag:${q}`

  const graphqlQuery = `
    query searchProducts($query: String!, $first: Int!) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            status
            vendor
            productType
            tags
            createdAt
            updatedAt
            featuredImage { url }
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  inventoryQuantity
                  inventoryItem { id }
                  barcode
                }
              }
            }
          }
        }
      }
    }
  `

  const res = await fetch(
    `https://${shop_domain}/admin/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: graphqlQuery, variables: { query: gqlFilter, first: limit } }),
    }
  )

  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "GraphQL error")

  // Normalizar la respuesta GraphQL al mismo formato REST
  const products = (json.data?.products?.edges ?? []).map(({ node }: any) => ({
    id: Number(node.id.replace("gid://shopify/Product/", "")),
    title: node.title,
    status: node.status?.toLowerCase(),
    vendor: node.vendor,
    product_type: node.productType,
    tags: node.tags?.join?.(",") ?? node.tags ?? "",
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    image: node.featuredImage ? { src: node.featuredImage.url } : null,
    variants: (node.variants?.edges ?? []).map(({ node: v }: any) => ({
      id: Number(v.id.replace("gid://shopify/ProductVariant/", "")),
      title: v.title,
      sku: v.sku ?? "",
      price: v.price,
      inventory_quantity: v.inventoryQuantity ?? 0,
      inventory_item_id: Number((v.inventoryItem?.id ?? "").replace("gid://shopify/InventoryItem/", "")),
      barcode: v.barcode ?? "",
    })),
  }))

  return products
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const limit    = Math.min(Number(searchParams.get("limit") || "50"), 250)
    const page_info = searchParams.get("page_info") || ""
    const status   = searchParams.get("status") || "active"
    const query    = searchParams.get("query") || ""

    if (!store_id) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain, access_token, api_key, api_secret, token_expires_at")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    // Renovar token si expiró
    const token = await getValidToken(supabase, store)

    // ── BÚSQUEDA: usar GraphQL para buscar en toda la tienda ──────────────────
    if (query && !page_info) {
      const products = await searchProductsGraphQL(store.shop_domain, token, query, limit)
      return NextResponse.json({
        ok: true,
        products,
        total_count: products.length,
        is_search: true,
        pagination: { next_page_info: null, prev_page_info: null },
      })
    }

    // ── LISTADO NORMAL: REST con paginación cursor-based ──────────────────────
    const params = page_info
      ? new URLSearchParams({ page_info, limit: String(limit) })
      : new URLSearchParams({ status, limit: String(limit) })

    const res = await fetch(
      `https://${store.shop_domain}/admin/api/2024-01/products.json?${params}`,
      { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" } }
    )

    const text = await res.text()
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { msg = `HTTP ${res.status}: ${JSON.parse(text).errors ?? text.slice(0, 200)}` } catch {}
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const json = JSON.parse(text)
    const linkHeader = res.headers.get("link") || ""
    const nextMatch  = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    const prevMatch  = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="previous"/)

    // Total con count.json (solo primera página)
    let total_count: number | null = null
    if (!page_info) {
      try {
        const countRes = await fetch(
          `https://${store.shop_domain}/admin/api/2024-01/products/count.json?${new URLSearchParams({ status })}`,
          { headers: { "X-Shopify-Access-Token": token } }
        )
        if (countRes.ok) total_count = (await countRes.json()).count ?? null
      } catch { /* no fatal */ }
    }

    return NextResponse.json({
      ok: true,
      products: json.products ?? [],
      total_count,
      pagination: {
        next_page_info: nextMatch?.[1] ?? null,
        prev_page_info: prevMatch?.[1] ?? null,
      },
    })
  } catch (e: any) {
    console.error("[SHOPIFY-PRODUCTS] Unhandled:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
