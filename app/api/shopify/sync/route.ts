import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"
import { renewAndPersistToken } from "@/domains/shopify/auth"
import { startRun } from "@/lib/process-runs"

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
      let run: Awaited<ReturnType<typeof startRun>> | null = null
      try {

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { send(controller, { error: "Unauthorized" }); controller.close(); return }

        run = await startRun(supabase, "shopify_sync", "Shopify Sync")

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

        // ── FASE 1: Descargar variantes de Shopify y guardar en cache ──────────
        send(controller, { phase: "shopify", message: "Descargando productos de Shopify..." })

        // Limpiar cache anterior de esta tienda
        await supabase.from("shopify_variants_cache").delete().eq("store_id", store.id)

        let nextPageInfo: string | null = null
        let shopifyPage = 0
        let totalVariants = 0
        const fetchedAt = new Date().toISOString()
        const CACHE_BATCH = 500

        do {
          const params: URLSearchParams = nextPageInfo
            ? new URLSearchParams({ page_info: nextPageInfo, limit: "250" })
            : new URLSearchParams({ status: "active", limit: "250" })

          let res: Response = await fetch(
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
          const rows: any[] = []
          for (const p of json.products ?? []) {
            for (const v of p.variants ?? []) {
              rows.push({
                store_id:           store.id,
                shopify_product_id: p.id,
                shopify_variant_id: v.id,
                shopify_title:      p.title,
                shopify_sku:        v.sku ?? "",
                shopify_barcode:    v.barcode ?? "",
                shopify_price:      Number(v.price ?? 0),
                shopify_status:     p.status ?? "active",
                shopify_image_url:  p.image?.src ?? null,
                fetched_at:         fetchedAt,
              })
            }
          }

          // Insertar en lotes en la tabla cache
          for (let i = 0; i < rows.length; i += CACHE_BATCH) {
            await supabase
              .from("shopify_variants_cache")
              .insert(rows.slice(i, i + CACHE_BATCH))
          }

          totalVariants += rows.length

          const link: string = res.headers.get("link") ?? ""
          const m: RegExpMatchArray | null = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
          nextPageInfo = m?.[1] ?? null
          shopifyPage++

          if (shopifyPage % 10 === 0) {
            send(controller, { phase: "shopify", variants_fetched: totalVariants })
          }
        } while (nextPageInfo)

        send(controller, { phase: "shopify_done", variants_fetched: totalVariants })

        // ── FASE 2: Matching SQL directo en la DB (instantáneo) ───────────────
        send(controller, { phase: "matching", message: "Ejecutando vinculación SQL..." })

        const { data: matchResult, error: matchError } = await supabase
          .rpc("run_shopify_matching_v2", { p_store_id: store.id })

        if (matchError) throw new Error(`Matching SQL: ${matchError.message}`)

        const r = matchResult as any

        // Resultado final
        await run.complete({
          rows_processed: totalVariants,
          rows_updated: r.total_linked ?? 0,
          log_json: {
            store_id: store.id,
            shop_domain: store.shop_domain,
            shopify_variants_total: totalVariants,
            db_products_scanned: r.db_count,
            matched_ean: r.matched_ean,
            matched_isbn: r.matched_isbn,
          },
        })

        send(controller, {
          ok: true, phase: "done",
          store_id:              store.id,
          shop_domain:           store.shop_domain,
          shopify_variants_total: totalVariants,
          db_products_scanned:   r.db_count,
          matched:               r.total_linked,
          matched_ean:           r.matched_ean,
          matched_isbn:          r.matched_isbn,
          skipped:               (r.db_count ?? 0) - (r.total_linked ?? 0),
        })
      } catch (e: any) {
        await run?.fail(e)
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

    const { data, error } = await supabase
      .rpc("get_sync_stats", { p_store_id: store_id })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
