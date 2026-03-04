import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/billing/ml-order-billing?account_id=X&order_id=Y
// Obtiene los datos fiscales del comprador de UNA orden de ML.
//
// Flujo según doc oficial ML:
//   GET /orders/{id}
//   → buyer.billing_info: { name, last_name, identification: { type, number } }
//
// Este endpoint se llama UNA VEZ por orden, al momento de facturar.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id") || ""
  const order_id   = searchParams.get("order_id")   || ""

  if (!account_id || !order_id) {
    return NextResponse.json({ ok: false, error: "Faltan parámetros" }, { status: 400 })
  }

  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token")
    .eq("id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta ML no encontrada" }, { status: 404 })
  }

  const auth = `Bearer ${mlAccount.access_token}`

  // GET /orders/{id} — buyer.billing_info tiene name, last_name, identification
  const orderRes = await fetch(
    `https://api.mercadolibre.com/orders/${order_id}`,
    { headers: { Authorization: auth }, signal: AbortSignal.timeout(8000) }
  )

  if (!orderRes.ok) {
    const err = await orderRes.json()
    return NextResponse.json({ ok: false, error: err.message || "Error ML" }, { status: 502 })
  }

  const orderData = await orderRes.json()
  const bi    = orderData?.buyer?.billing_info || {}
  const ident = bi.identification || {}

  // name = primer nombre, last_name = apellido
  const nombre = [bi.name, bi.last_name].filter(Boolean).join(" ").trim()

  return NextResponse.json({
    ok:         true,
    nombre,
    doc_tipo:   ident.type   || null,  // "DNI", "CUIT", "CUIL"
    doc_numero: ident.number || null,
    // Para debug — la estructura completa de buyer
    _raw_billing_info: bi,
  })
}
