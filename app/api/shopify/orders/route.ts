import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const status = searchParams.get("status") || "any"
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 250)
    const page_info = searchParams.get("page_info") || ""

    if (!store_id) {
      return NextResponse.json({ error: "store_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Buscar la tienda y su token
    const { data: store, error: storeError } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token, id")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })
    }

    // Construir URL de Shopify — soporta paginación cursor-based
    const params = new URLSearchParams({
      status,
      limit: String(limit),
      ...(page_info ? { page_info } : {}),
    })

    const shopifyUrl = `https://${store.shop_domain}/admin/api/2024-01/orders.json?${params}`

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
      console.error("[SHOPIFY-ORDERS]", msg)
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const json = JSON.parse(text)

    // Extraer cursor de paginación del header Link de Shopify
    const linkHeader = res.headers.get("link") || ""
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    const prevMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="previous"/)

    return NextResponse.json({
      ok: true,
      orders: json.orders ?? [],
      pagination: {
        next_page_info: nextMatch?.[1] ?? null,
        prev_page_info: prevMatch?.[1] ?? null,
      },
    })
  } catch (e: any) {
    console.error("[SHOPIFY-ORDERS] Unhandled:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
