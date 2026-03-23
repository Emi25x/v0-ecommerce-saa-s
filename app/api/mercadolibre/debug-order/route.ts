/**
 * @internal Development-only diagnostic endpoint.
 * Used by: app/(dashboard)/billing/debug/page.tsx
 * Protected by requireUser() — only authenticated users can access.
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { requireUser } from "@/lib/auth/require-auth"

// GET /api/mercadolibre/debug-order?account_id=xxx&order_id=yyy
export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (auth.error) return auth.response

  const accountId = request.nextUrl.searchParams.get("account_id")
  const orderId = request.nextUrl.searchParams.get("order_id")

  if (!accountId || !orderId) {
    return NextResponse.json({ error: "account_id y order_id requeridos" }, { status: 400 })
  }

  // adminClient para evitar RLS en cuentas con user_id=null
  const adminClient = createAdminClient()
  const { data: ml } = await adminClient
    .from("ml_accounts")
    .select("access_token, ml_user_id")
    .eq("id", accountId)
    .single()

  if (!ml) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const mlAuth = `Bearer ${ml.access_token}`

  // Paso 1: GET /orders/{id} → leer buyer.billing_info.id
  const orderRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers: { Authorization: mlAuth } })
  const orderData = await orderRes.json()
  const billingInfoId = orderData?.buyer?.billing_info?.id
  const contentMissing = orderRes.headers.get("x-content-missing") ?? null

  // Paso 2a: GET /orders/billing-info/MLA/{billing_info_id} → datos fiscales (flat)
  let billingDataA = null
  let billingStatusA = null
  if (billingInfoId) {
    const billingRes = await fetch(`https://api.mercadolibre.com/orders/billing-info/MLA/${billingInfoId}`, {
      headers: { Authorization: mlAuth },
    })
    billingStatusA = billingRes.status
    billingDataA = billingRes.ok ? await billingRes.json() : await billingRes.text()
  }

  // Paso 2b V2: GET /orders/{id}/billing_info con x-version: 2
  const billingResBv2 = await fetch(`https://api.mercadolibre.com/orders/${orderId}/billing_info`, {
    headers: { Authorization: mlAuth, "x-version": "2" },
  })
  const billingStatusBv2 = billingResBv2.status
  const billingDataBv2 = billingResBv2.ok ? await billingResBv2.json() : await billingResBv2.text()

  // Paso 2b V1: GET /orders/{id}/billing_info sin header (legacy)
  const billingResBv1 = await fetch(`https://api.mercadolibre.com/orders/${orderId}/billing_info`, {
    headers: { Authorization: mlAuth },
  })
  const billingStatusBv1 = billingResBv1.status
  const billingDataBv1 = billingResBv1.ok ? await billingResBv1.json() : await billingResBv1.text()

  return NextResponse.json({
    order_status: orderRes.status,
    order_buyer: orderData?.buyer,
    order_content_missing: contentMissing, // "buyer" si ML devuelve respuesta parcial
    billing_info_id: billingInfoId,
    buyer_identification: orderData?.buyer?.identification ?? null,
    // Endpoint A (flat, requiere billingInfoId)
    billing_a_status: billingStatusA,
    billing_a_data: billingDataA,
    // Endpoint B V2 (x-version: 2) → buyer.billing_info.identification
    billing_b_v2_status: billingStatusBv2,
    billing_b_v2_data: billingDataBv2,
    // Endpoint B V1 legacy → billing_info.doc_type / doc_number
    billing_b_v1_status: billingStatusBv1,
    billing_b_v1_data: billingDataBv1,
  })
}
