import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient()

    const { data: shipment, error } = await supabase
      .from("shipments")
      .select("*")
      .eq("id", params.id)
      .single()

    if (error || !shipment) {
      return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 })
    }

    const { data: events } = await supabase
      .from("shipment_events")
      .select("*")
      .eq("shipment_id", params.id)
      .order("occurred_at", { ascending: false })

    return NextResponse.json({ data: { shipment, events: events ?? [] } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
