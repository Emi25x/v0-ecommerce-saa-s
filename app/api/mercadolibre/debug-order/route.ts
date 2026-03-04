import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

  const { data: ml } = await supabase
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

  // Paso 2: GET /orders/billing-info/MLA/{billing_info_id} → datos fiscales reales
  let billingData = null
  let billingStatus = null
  if (billingInfoId) {
    const billingRes = await fetch(
      `https://api.mercadolibre.com/orders/billing-info/MLA/${billingInfoId}`,
      { headers: { Authorization: auth } }
    )
    billingStatus = billingRes.status
    billingData   = billingRes.ok ? await billingRes.json() : await billingRes.text()
  }

  return NextResponse.json({
    order_status:     orderRes.status,
    order_buyer:      orderData?.buyer,
    billing_info_id:  billingInfoId,
    billing_status:   billingStatus,
    // Aquí deben estar: first_name, last_name, identification.type/number, address
    billing_data:     billingData,
  })
}
