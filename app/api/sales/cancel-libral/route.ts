import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { cancelOrderInLibral } from "@/domains/integrations/libral-orders/service"

/**
 * POST /api/sales/cancel-libral
 *
 * Cancel an order in Libral (delete by reference).
 * Body: { order_id: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { order_id } = await request.json()
  if (!order_id) return NextResponse.json({ error: "order_id requerido" }, { status: 400 })

  const result = await cancelOrderInLibral(order_id)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
