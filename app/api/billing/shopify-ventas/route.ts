import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

// GET — lista órdenes de Shopify enriquecidas con estado de facturación
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const store_id = searchParams.get("store_id")
    const financial_status = searchParams.get("financial_status") || "paid"
    const facturado = searchParams.get("facturado") || "all"
    const page_info = searchParams.get("page_info") || ""
    const fecha_desde = searchParams.get("fecha_desde") || ""
    const fecha_hasta = searchParams.get("fecha_hasta") || ""
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 250)

    if (!store_id) return NextResponse.json({ error: "store_id requerido" }, { status: 400 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: store } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token, id")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    // Shopify: con page_info NO se pueden enviar otros filtros
    const params = new URLSearchParams({ limit: String(limit) })
    if (page_info) {
      params.set("page_info", page_info)
    } else {
      if (financial_status !== "any") params.set("financial_status", financial_status)
      if (fecha_desde) params.set("created_at_min", fecha_desde)
      if (fecha_hasta) params.set("created_at_max", fecha_hasta)
    }

    const shopifyUrl = `https://${store.shop_domain}/admin/api/2024-01/orders.json?${params}`
    const res = await fetch(shopifyUrl, {
      headers: { "X-Shopify-Access-Token": store.access_token },
    })

    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        msg = `HTTP ${res.status}: ${(await res.json()).errors ?? ""}`
      } catch {}
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const json = await res.json()
    const orders = (json.orders ?? []) as any[]

    // Cursor de paginación desde el header Link
    const linkHeader = res.headers.get("link") || ""
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    const prevMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="previous"/)

    // Enriquecer con estado de facturación desde nuestra DB
    const orderIds = orders.map((o) => String(o.id))
    const facturadaMap: Record<string, any> = {}
    if (orderIds.length > 0) {
      const { data: facturas } = await supabase
        .from("shopify_order_facturas")
        .select("shopify_order_id, factura_id, facturado_at, empresa_id")
        .eq("store_id", store_id)
        .in("shopify_order_id", orderIds)
      for (const f of facturas ?? []) {
        facturadaMap[f.shopify_order_id] = f
      }
    }

    const enriched = orders.map((o) => {
      const ba = o.billing_address || {}
      const nombre = [ba.first_name, ba.last_name].filter(Boolean).join(" ") || o.customer?.email || "Desconocido"
      const facInfo = facturadaMap[String(o.id)] ?? null
      return {
        id: o.id,
        fecha: o.created_at,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        total: parseFloat(o.total_price || "0"),
        moneda: o.currency,
        comprador: nombre,
        email: o.customer?.email || null,
        items: (o.line_items ?? []).map((li: any) => ({
          titulo: li.title || li.name || "",
          sku: li.sku || null,
          cantidad: li.quantity,
          precio: parseFloat(li.price || "0"),
        })),
        billing_address: ba,
        note_attributes: o.note_attributes || [],
        note: o.note || null,
        facturada: !!facInfo,
        factura_info: facInfo,
      }
    })

    // Aplicar filtro de facturado (server-side sobre la página devuelta por Shopify)
    let filtered = enriched
    if (facturado === "no") filtered = enriched.filter((o) => !o.facturada)
    else if (facturado === "si") filtered = enriched.filter((o) => o.facturada)

    return NextResponse.json({
      ok: true,
      orders: filtered,
      pagination: {
        next_page_info: nextMatch?.[1] ?? null,
        prev_page_info: prevMatch?.[1] ?? null,
        page_size: orders.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — marcar órdenes como facturadas
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { shopify_order_ids, store_id, factura_id, empresa_id } = await request.json()

    if (!shopify_order_ids?.length || !store_id) {
      return NextResponse.json({ error: "shopify_order_ids y store_id requeridos" }, { status: 400 })
    }

    const rows = (shopify_order_ids as string[]).map((order_id) => ({
      user_id: user.id,
      shopify_order_id: String(order_id),
      store_id,
      factura_id: factura_id || null,
      empresa_id: empresa_id || null,
    }))

    const { error } = await supabase
      .from("shopify_order_facturas")
      .upsert(rows, { onConflict: "shopify_order_id,store_id" })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
