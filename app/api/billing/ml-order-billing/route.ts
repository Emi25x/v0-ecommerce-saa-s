import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMLOrderBilling } from "@/lib/billing/get-ml-order-billing"

// GET /api/billing/ml-order-billing?account_id=X&order_id=Y[&debug=1]
//
// Thin HTTP wrapper over getMLOrderBilling() — la lógica real vive en
// lib/billing/get-ml-order-billing.ts para poder llamarla server-to-server
// sin necesitar una URL absoluta (evita depender de APP_URL / VERCEL_URL).
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id    = searchParams.get("account_id") || ""
  const order_id      = searchParams.get("order_id")   || ""
  const forceRefresh  = searchParams.get("force") === "1"

  if (!account_id || !order_id) {
    return NextResponse.json({ ok: false, error: "Faltan parámetros account_id / order_id" }, { status: 400 })
  }

  const result = await getMLOrderBilling(supabase, account_id, order_id, { forceRefresh })

  if (!result.ok) {
    return NextResponse.json(result, { status: result.error?.includes("no encontrada") ? 404 : 502 })
  }

  return NextResponse.json(result)
}
