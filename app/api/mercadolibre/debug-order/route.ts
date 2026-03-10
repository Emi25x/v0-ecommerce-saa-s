import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Endpoint temporal de diagnóstico — muestra la estructura real de ML para una orden
// GET /api/mercadolibre/debug-order?account_id=xxx&order_id=yyy
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const accountId = request.nextUrl.searchParams.get("account_id")
  const orderId   = request.nextUrl.searchParams.get("order_id")

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

  const auth = `Bearer ${ml.access_token}`

  // Paso 1: GET /orders/{id} → leer buyer.billing_info.id
  const orderRes  = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers: { Authorization: auth } })
  const orderData = await orderRes.json()
  const billingInfoId = orderData?.buyer?.billing_info?.id

  // Paso 2a: GET /orders/billing-info/MLA/{billing_info_id} → datos fiscales (flat)
  let billingDataA = null
  let billingStatusA = null
  if (billingInfoId) {
    const billingRes = await fetch(
      `https://api.mercadolibre.com/orders/billing-info/MLA/${billingInfoId}`,
      { headers: { Authorization: auth } }
    )
    billingStatusA = billingRes.status
    billingDataA   = billingRes.ok ? await billingRes.json() : await billingRes.text()
  }

  // Paso 2b: GET /orders/{id}/billing_info → datos fiscales (wrapped en buyer/seller)
  const billingResB  = await fetch(`https://api.mercadolibre.com/orders/${orderId}/billing_info`, { headers: { Authorization: auth } })
  const billingStatusB = billingResB.status
  const billingDataB   = billingResB.ok ? await billingResB.json() : await billingResB.text()

  return NextResponse.json({
    order_status:        orderRes.status,
    order_buyer:         orderData?.buyer,
    billing_info_id:     billingInfoId,
    // Endpoint A (flat, requiere billingInfoId)
    billing_a_status:    billingStatusA,
    billing_a_data:      billingDataA,
    // Endpoint B (wrapped en {buyer, seller})
    billing_b_status:    billingStatusB,
    billing_b_data:      billingDataB,
  })
}
