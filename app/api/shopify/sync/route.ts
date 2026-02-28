import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { renewAndPersistToken } from "@/lib/shopify-auth"

// POST /api/shopify/sync
// Usa streaming NDJSON para evitar timeouts con catálogos grandes.
// El cliente lee línea a línea y muestra progreso en tiempo real.
export async function POST(request: Request) {
  const { store_id } = await request.json().catch(() => ({}))
  if (!store_id) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

  const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController, obj: object) => {
    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { send(controller, { error: "Unauthorized" }); controller.close(); return }

        const { data: storeRaw } = await supabase
          .from("shopify_stores")
          .select("id, shop_domain, access_token, api_key, api_secret, token_expires_at")
          .eq("id", store_id)
          .eq("owner_user_id", user.id)
          .single()

        if (!storeRaw) { send(controller, { error: "Tienda no encontrada" }); controller.close(); return }

        let store = storeRaw
        if (storeRaw.api_key && storeRaw.api_secret) {
          const expiresAt = storeRaw.token_expires_at ? new Date(storeRaw.token_expires_at) : new Date(0)
          if (expiresAt <= new Date()) {
            const newToken = await renewAndPersistToken(supabase, storeRaw)
            store = { ...storeRaw, access_token: newToken }
          }
        }

        // ── FASE 1: Traer todas las variantes de Shopify ──────────────────────
        send(controller, { phase: "shopify", message: "Descargando productos de Shopify..." })

        type Variant = {
          shopify_product_id: number; shopify_variant_id: number; shopify_title: string
          shopify_sku: string; shopify_barcode: string; shopify_price: string
          shopify_status: string; shopify_image_url: string | null
        }
        const allVariants: Variant[] = []
        let nextPageInfo: string | null = null
        let shopifyPage = 0

        do {
          const params = nextPageInfo
            ? new URLSearchParams({ page_info: nextPageInfo, limit: "250" })
            : new URLSearchParams({ status: "active", limit: "250" })

          let res = await fetch(
            `https://${store.shop_domain}/admin/api/2024-01/products.json?${params}`,
            { headers: { "X-Shopify-Access-Token": store.access_token } }
          )

          if (res.status === 401 && store.api_key && store.api_secret) {
            const newToken = await renewAndPersistToken(supabase, store)
            store = { ...store, access_token: newToken }
            res = await fetch(
              `https://${store.shop_domain}/admin/api/2024-01/products.json?${params}`,
              { headers: { "X-Shopify-Access-Token": newToken } }
            )
          }

          if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`)

          const json = await res.json()
          for (const p of json.products ?? []) {
            for (const v of p.variants ?? []) {
              allVariants.push({
                shopify_product_id: p.id, shopify_variant_id: v.id,
                shopify_title: p.title, shopify_sku: v.sku ?? "",
                shopify_barcode: v.barcode ?? "", shopify_price: v.price ?? "0",
                shopify_status: p.status ?? "active", shopify_image_url: p.image?.src ?? null,
              })
            }
          }

          const link = res.headers.get("link") ?? ""
          const m = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
          nextPageInfo = m?.[1] ?? null
          shopifyPage++

          // Enviar progreso cada 10 páginas (cada ~2500 variantes)
          if (shopifyPage % 10 === 0) {
            send(controller, { phase: "shopify", variants_fetched: allVariants.length })
          }
        } while (nextPageInfo)

        send(controller, { phase: "shopify_done", variants_fetched: allVariants.length })

        // ── FASE 2: Traer todos los productos de la DB ────────────────────────
        send(controller, { phase: "db", message: "Cargando productos de la base de datos..." })

        const byShopifySku = new Map<string, Variant>()
        for (const v of allVariants) {
          if (v.shopify_sku) byShopifySku.set(v.shopify_sku.trim(), v)
        }

        const DB_PAGE = 1000
        let dbOffset = 0
        const dbProducts: Array<{ id: string; ean: string | null; isbn: string | null }> = []
        while (true) {
          const { data: batch, error: dbErr } = await supabase
            .from("products").select("id, ean, isbn")
            .or("ean.not.is.null,isbn.not.is.null")
            .range(dbOffset, dbOffset + DB_PAGE - 1)
          if (dbErr || !batch || batch.length === 0) break
          dbProducts.push(...batch)
          if (batch.length < DB_PAGE) break
          dbOffset += DB_PAGE
        }

        send(controller, { phase: "db_done", db_count: dbProducts.length })

        // ── FASE 3: Matching y upsert ─────────────────────────────────────────
        send(controller, { phase: "matching", message: "Vinculando productos..." })

        const toUpsert: any[] = []
        let matched = 0; let skipped = 0
        const now = new Date().toISOString()

        for (const p of dbProducts) {
          const ean = p.ean?.trim(); const isbn = p.isbn?.trim()
          let variant: Variant | undefined; let matchedBy = ""; let matchedValue = ""

          if (ean && byShopifySku.has(ean)) {
            variant = byShopifySku.get(ean); matchedBy = "ean_vs_sku"; matchedValue = ean
          } else if (isbn && byShopifySku.has(isbn)) {
            variant = byShopifySku.get(isbn); matchedBy = "isbn_vs_sku"; matchedValue = isbn
          }

          if (!variant) { skipped++; continue }

          toUpsert.push({
            product_id: p.id, store_id: store.id,
            shopify_product_id: variant.shopify_product_id,
            shopify_variant_id: variant.shopify_variant_id,
            shopify_title: variant.shopify_title, shopify_sku: variant.shopify_sku,
            shopify_barcode: variant.shopify_barcode,
            shopify_price: Number(variant.shopify_price),
            shopify_status: variant.shopify_status,
            shopify_image_url: variant.shopify_image_url,
            matched_by: matchedBy, matched_value: matchedValue,
            sync_status: "linked", last_synced_at: now, sync_error: null,
          })
          matched++
        }

        // Upsert en lotes de 500
        let upserted = 0
        const BATCH = 500
        for (let i = 0; i < toUpsert.length; i += BATCH) {
          const { error } = await supabase
            .from("shopify_product_links")
            .upsert(toUpsert.slice(i, i + BATCH), { onConflict: "product_id,store_id,shopify_variant_id" })
          if (!error) upserted += Math.min(BATCH, toUpsert.length - i)
          send(controller, { phase: "upserting", upserted, total_to_upsert: toUpsert.length })
        }

        // Resultado final
        send(controller, {
          ok: true, phase: "done",
          store_id: store.id, shop_domain: store.shop_domain,
          shopify_variants_total: allVariants.length,
          db_products_scanned: dbProducts.length,
          matched, upserted, skipped,
        })
      } catch (e: any) {
        send(controller, { error: e.message })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  })
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
