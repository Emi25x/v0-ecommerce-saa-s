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

  // Fetch las dos fuentes de datos del comprador
  const [orderRes, billingRes] = await Promise.all([
    fetch(`https://api.mercadolibre.com/orders/${orderId}`,
      { headers: { Authorization: auth } }),
    fetch(`https://api.mercadolibre.com/orders/${orderId}/billing_info`,
      { headers: { Authorization: auth } }),
  ])

  const orderData   = await orderRes.json()
  const billingData = billingRes.ok ? await billingRes.json() : { status: billingRes.status, error: "not ok" }

  return NextResponse.json({
    order_status:   orderRes.status,
    billing_status: billingRes.status,
    // Solo el buyer del detalle de la orden
    order_buyer:    orderData.buyer,
    // Todo el billing_info
    billing_info:   billingData,
  })
}
