import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient } from "@/lib/carriers/fastmail"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: { number: string } }
) {
  try {
    const trackingNumber = decodeURIComponent(params.number)
    const supabase = createAdminClient()

    // Cargar carrier fastmail
    const { data: carrier } = await supabase
      .from("carriers")
      .select("*")
      .eq("slug", "fastmail")
      .single()

    if (!carrier?.active) {
      return NextResponse.json({ error: "FastMail no configurado" }, { status: 503 })
    }

    const client = createFastMailClient(carrier.config, carrier.credentials)
    const tracking = await client.getTracking(trackingNumber)

    if (tracking.error) {
      return NextResponse.json({ error: tracking.error }, { status: 502 })
    }

    // Guardar eventos en shipment_events si tenemos el shipment en DB
    const { data: shipment } = await supabase
      .from("shipments")
      .select("id, status")
      .eq("tracking_number", trackingNumber)
      .maybeSingle()

    if (shipment) {
      // Actualizar status
      await supabase
        .from("shipments")
        .update({ status: mapStatus(tracking.estado), updated_at: new Date().toISOString() })
        .eq("id", shipment.id)

      // Insertar eventos nuevos
      if (tracking.eventos?.length) {
        const events = tracking.eventos.map(e => ({
          shipment_id:  shipment.id,
          status:       e.estado,
          description:  e.descripcion,
          location:     e.ubicacion ?? null,
          occurred_at:  e.fecha,
          raw:          e,
        }))
        await supabase.from("shipment_events").upsert(events, {
          onConflict: "shipment_id,occurred_at",
          ignoreDuplicates: true,
        })
      }
    }

    return NextResponse.json({ ok: true, tracking })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function mapStatus(estado: string): string {
  const s = estado?.toLowerCase() ?? ""
  if (s.includes("entregad")) return "delivered"
  if (s.includes("transit") || s.includes("camino") || s.includes("distribuc")) return "in_transit"
  if (s.includes("devuelt") || s.includes("retorn")) return "returned"
  if (s.includes("fallid") || s.includes("error") || s.includes("no entregad")) return "failed"
  return "pending"
}
