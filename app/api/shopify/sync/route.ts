import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// POST /api/shopify/sync
// Recorre todos los productos de una tienda Shopify y los vincula con la DB
// por EAN (barcode), ISBN o SKU. Soporta múltiples tiendas.
export async function POST(request: Request) {
  try {
    const { store_id } = await request.json()
    if (!store_id) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Verificar que la tienda pertenece al usuario
    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain, access_token")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    // Traer TODOS los productos de Shopify con paginación cursor
    const allVariants: Array<{
      shopify_product_id: number
      shopify_variant_id: number
      shopify_title: string
      shopify_sku: string
      shopify_barcode: string
      shopify_price: string
      shopify_status: string
      shopify_image_url: string | null
    }> = []

    let nextPageInfo: string | null = null
    let page = 0

    do {
      const params = nextPageInfo
        ? new URLSearchParams({ page_info: nextPageInfo, limit: "250" })
        : new URLSearchParams({ status: "active", limit: "250" })

      const res = await fetch(
        `https://${store.shop_domain}/admin/api/2024-01/products.json?${params}`,
        { headers: { "X-Shopify-Access-Token": store.access_token } }
      )
      if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`)

      const json = await res.json()
      const products = json.products ?? []

      for (const p of products) {
        for (const v of p.variants ?? []) {
          allVariants.push({
            shopify_product_id: p.id,
            shopify_variant_id: v.id,
            shopify_title: p.title,
            shopify_sku: v.sku ?? "",
            shopify_barcode: v.barcode ?? "",
            shopify_price: v.price ?? "0",
            shopify_status: p.status ?? "active",
            shopify_image_url: p.image?.src ?? null,
          })
        }
      }

      const link = res.headers.get("link") ?? ""
      const m = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
      nextPageInfo = m?.[1] ?? null
      page++
    } while (nextPageInfo && page < 100)

    console.log(`[SHOPIFY-SYNC] Tienda ${store.shop_domain}: ${allVariants.length} variantes encontradas`)

    // Matching EXCLUSIVO: EAN de nuestra DB = SKU de Shopify
    // El SKU de Shopify almacena el EAN/ISBN del producto
    const byShopifySku = new Map<string, typeof allVariants[0]>()
    for (const v of allVariants) {
      if (v.shopify_sku) byShopifySku.set(v.shopify_sku.trim(), v)
    }

    // Traer todos los productos de nuestra DB que tengan EAN o ISBN
    const { data: dbProducts } = await supabase
      .from("products")
      .select("id, ean, isbn")
      .or("ean.not.is.null,isbn.not.is.null")

    const toUpsert: any[] = []
    let matched = 0
    let skipped = 0

    for (const p of dbProducts ?? []) {
      let variant: typeof allVariants[0] | undefined
      let matchedBy = ""
      let matchedValue = ""

      // EAN de la DB buscado en el SKU de Shopify (único criterio)
      const ean   = p.ean?.trim()
      const isbn  = p.isbn?.trim()

      if (ean && byShopifySku.has(ean)) {
        variant      = byShopifySku.get(ean)
        matchedBy    = "ean_vs_sku"
        matchedValue = ean
      } else if (isbn && byShopifySku.has(isbn)) {
        variant      = byShopifySku.get(isbn)
        matchedBy    = "isbn_vs_sku"
        matchedValue = isbn
      }

      if (!variant) { skipped++; continue }

      toUpsert.push({
        product_id:          p.id,
        store_id:            store.id,
        shopify_product_id:  variant.shopify_product_id,
        shopify_variant_id:  variant.shopify_variant_id,
        shopify_title:       variant.shopify_title,
        shopify_sku:         variant.shopify_sku,
        shopify_barcode:     variant.shopify_barcode,
        shopify_price:       Number(variant.shopify_price),
        shopify_status:      variant.shopify_status,
        shopify_image_url:   variant.shopify_image_url,
        matched_by:          matchedBy,
        matched_value:       matchedValue,
        sync_status:         "linked",
        last_synced_at:      new Date().toISOString(),
        sync_error:          null,
      })
      matched++
    }

    // Upsert en lotes de 500
    let upserted = 0
    const BATCH = 500
    for (let i = 0; i < toUpsert.length; i += BATCH) {
      const batch = toUpsert.slice(i, i + BATCH)
      const { error } = await supabase
        .from("shopify_product_links")
        .upsert(batch, { onConflict: "product_id,store_id,shopify_variant_id" })
      if (error) console.error("[SHOPIFY-SYNC] Upsert error:", error.message)
      else upserted += batch.length
    }

    console.log(`[SHOPIFY-SYNC] ${upserted} vínculos guardados, ${skipped} sin match`)

    return NextResponse.json({
      ok: true,
      store_id: store.id,
      shop_domain: store.shop_domain,
      shopify_variants_total: allVariants.length,
      db_products_scanned: (dbProducts ?? []).length,
      matched,
      upserted,
      skipped,
    })
  } catch (e: any) {
    console.error("[SHOPIFY-SYNC] Error:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET /api/shopify/sync?store_id=xxx  — estadísticas de sincronización de una tienda
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    if (!store_id) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { count: total } = await supabase
      .from("shopify_product_links")
      .select("*", { count: "exact", head: true })
      .eq("store_id", store_id)

    const { count: linked } = await supabase
      .from("shopify_product_links")
      .select("*", { count: "exact", head: true })
      .eq("store_id", store_id)
      .eq("sync_status", "linked")

    const { data: lastSync } = await supabase
      .from("shopify_product_links")
      .select("last_synced_at")
      .eq("store_id", store_id)
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      ok: true,
      total: total ?? 0,
      linked: linked ?? 0,
      last_synced_at: lastSync?.last_synced_at ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
