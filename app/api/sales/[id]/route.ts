/**
 * GET /api/sales/[id]
 *
 * Detalle de una venta con items y exports a Libral.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Fetch order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 })
  }

  // Fetch items
  const { data: items } = await supabase
    .from("order_items")
    .select("id, ean, sku, title, quantity, unit_price, total_price, item_data")
    .eq("order_id", id)
    .order("created_at", { ascending: true })

  // Fetch export audit trail
  const { data: exports } = await supabase
    .from("libral_order_exports")
    .select("id, action, status, reference, payload_json, response_text, attempts, last_error, sent_at, cancelled_at, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false })

  // Fetch empresa name if empresa_id is set
  let empresaName: string | null = null
  if (order.empresa_id) {
    const { data: empresa } = await supabase
      .from("arca_config")
      .select("razon_social, nombre_empresa")
      .eq("id", order.empresa_id)
      .single()
    empresaName = empresa?.nombre_empresa || empresa?.razon_social || null
  }

  return NextResponse.json({
    order: {
      ...order,
      empresa_name: empresaName,
    },
    items: items ?? [],
    exports: exports ?? [],
  })
}
