import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 250)
    const page_info = searchParams.get("page_info") || ""
    const status = searchParams.get("status") || "active"

    if (!store_id) {
      return NextResponse.json({ error: "store_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: store, error: storeError } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })
    }

    // No mezclar status con page_info (mismo fix que orders)
    const params = page_info
      ? new URLSearchParams({ page_info, limit: String(limit) })
      : new URLSearchParams({ status, limit: String(limit) })

    const shopifyUrl = `https://${store.shop_domain}/admin/api/2024-01/products.json?${params}`

    const res = await fetch(shopifyUrl, {
      headers: {
        "X-Shopify-Access-Token": store.access_token,
        "Content-Type": "application/json",
      },
    })

    const text = await res.text()
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { msg = `HTTP ${res.status}: ${JSON.parse(text).errors ?? text.slice(0, 200)}` } catch {}
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const json = JSON.parse(text)

    const linkHeader = res.headers.get("link") || ""
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    const prevMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="previous"/)

    return NextResponse.json({
      ok: true,
      products: json.products ?? [],
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
