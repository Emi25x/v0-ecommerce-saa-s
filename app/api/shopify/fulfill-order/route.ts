/**
 * POST /api/shopify/fulfill-order
 *
 * Marca un pedido de Shopify como enviado (fulfilled) con número de tracking.
 * Shopify envía automáticamente el email de confirmación de envío al cliente.
 *
 * Body:
 *   store_id        — ID de la tienda en nuestra DB
 *   order_id        — ID numérico del pedido en Shopify (ej: 5678901234567)
 *   tracking_number — Número de seguimiento del transportista
 *   tracking_url    — URL de seguimiento para el cliente (opcional)
 *   carrier_name    — Nombre del transportista (ej: "Cabify Logistics")
 *   notify_customer — true por defecto (envía email al cliente)
 */

import { createClient } from "@/lib/supabase/server"
import { getValidToken } from "@/lib/shopify-auth"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      store_id,
      order_id,
      tracking_number,
      tracking_url,
      carrier_name    = "Cabify Logistics",
      notify_customer = true,
    } = body

    if (!store_id || !order_id || !tracking_number) {
      return NextResponse.json(
        { error: "store_id, order_id y tracking_number son requeridos" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Cargar tienda con credenciales
    const { data: store, error: storeError } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token, api_key, api_secret, token_expires_at, id")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (storeError || !store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })
    }

    const accessToken = await getValidToken(supabase, store)
    const domain      = store.shop_domain
    const apiBase     = `https://${domain}/admin/api/2024-01`
    const headers     = {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type":           "application/json",
    }

    // ── Paso 1: Obtener fulfillment_order_id ──────────────────────────────────
    const foRes = await fetch(`${apiBase}/orders/${order_id}/fulfillment_orders.json`, { headers })
    if (!foRes.ok) {
      const txt = await foRes.text()
      return NextResponse.json(
        { error: `No se pudo obtener fulfillment orders: HTTP ${foRes.status} — ${txt.slice(0, 200)}` },
        { status: foRes.status }
      )
    }

    const foJson = await foRes.json()
    const fulfillmentOrders: any[] = foJson.fulfillment_orders ?? []

    // Solo los que están en estado "open" (pendientes de enviar)
    const openFOs = fulfillmentOrders.filter(fo => fo.status === "open")

    if (openFOs.length === 0) {
      return NextResponse.json(
        { error: "Este pedido no tiene líneas pendientes de envío (ya está fulfillado o cancelado)" },
        { status: 400 }
      )
    }

    // ── Paso 2: Crear fulfillment con tracking ────────────────────────────────
    const fulfillmentBody = {
      fulfillment: {
        line_items_by_fulfillment_order: openFOs.map(fo => ({
          fulfillment_order_id: fo.id,
        })),
        tracking_info: {
          number:  tracking_number,
          url:     tracking_url ?? null,
          company: carrier_name,
        },
        notify_customer,
      },
    }

    const fulfillRes = await fetch(`${apiBase}/fulfillments.json`, {
      method:  "POST",
      headers,
      body:    JSON.stringify(fulfillmentBody),
    })

    const fulfillText = await fulfillRes.text()
    let fulfillJson: any = {}
    try { fulfillJson = JSON.parse(fulfillText) } catch {}

    if (!fulfillRes.ok) {
      const msg = fulfillJson?.errors
        ? JSON.stringify(fulfillJson.errors)
        : fulfillText.slice(0, 300)
      return NextResponse.json(
        { error: `Shopify fulfillment error ${fulfillRes.status}: ${msg}` },
        { status: fulfillRes.status }
      )
    }

    const fulfillment = fulfillJson.fulfillment

    return NextResponse.json({
      ok:             true,
      fulfillment_id: fulfillment?.id,
      status:         fulfillment?.status,
      tracking_number: fulfillment?.tracking_number ?? tracking_number,
      tracking_url:   fulfillment?.tracking_url     ?? tracking_url,
      notify_customer,
      message:        notify_customer
        ? "Pedido marcado como enviado. El cliente recibirá un email con el tracking."
        : "Pedido marcado como enviado (sin notificación al cliente).",
    })
  } catch (err: any) {
    console.error("[FULFILL-ORDER]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
