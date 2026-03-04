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

  // Paso 1: obtener la orden para sacar el buyer.id
  const orderRes  = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers: { Authorization: auth } })
  const orderData = await orderRes.json()
  const buyerId   = orderData.buyer?.id

  // Paso 2: GET /users/{buyer_id} → nombre, apellido, identification
  const userRes  = buyerId
    ? await fetch(`https://api.mercadolibre.com/users/${buyerId}`, { headers: { Authorization: auth } })
    : null
  const userData = userRes?.ok ? await userRes.json() : null

  // Paso 3: billing_info → dirección fiscal
  const billingRes  = await fetch(`https://api.mercadolibre.com/orders/${orderId}/billing_info`, { headers: { Authorization: auth } })
  const billingData = billingRes.ok ? await billingRes.json() : { status: billingRes.status }

  return NextResponse.json({
    order_buyer_id:   buyerId,
    order_status:     orderRes.status,
    // GET /users/{buyer_id} → aquí están first_name, last_name, identification
    user_data:        userData,
    billing_status:   billingRes.status,
    billing_info:     billingData,
  })
}
