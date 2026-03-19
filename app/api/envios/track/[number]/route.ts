import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { createFastMailClient } from "@/domains/shipping/carriers/fastmail"
import { createCabifyClient, mapCabifyStatus } from "@/domains/shipping/carriers/cabify"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params
  try {
    const trackingNumber = decodeURIComponent(number)
    const carrierSlug = req.nextUrl.searchParams.get("carrier") ?? "fastmail"
    const supabase = createAdminClient()

    // Cargar carrier
    const { data: carrier } = await supabase.from("carriers").select("*").eq("slug", carrierSlug).single()

    if (!carrier?.active) {
      return NextResponse.json({ error: `${carrierSlug}: transportista no configurado` }, { status: 503 })
    }

    let tracking: {
      numero_guia?: string
      tracking_code?: string
      estado?: string
      status?: string
      eventos?: Array<{ estado: string; descripcion: string; ubicacion?: string; fecha: string }>
      events?: Array<{ status: string; description: string; location?: string; timestamp: string }>
      error?: string
    }

    // ── Dispatch por carrier ────────────────────────────────────────────────────
    if (carrierSlug === "cabify") {
      // Cabify requiere el package_id interno — si tenemos el shipment en DB lo usamos
      const { data: shipment } = await supabase
        .from("shipments")
        .select("external_id, status")
        .eq("tracking_number", trackingNumber)
        .eq("carrier_slug", "cabify")
        .maybeSingle()

      const packageId = shipment?.external_id ?? trackingNumber
      const client = createCabifyClient(carrier.config, carrier.credentials)
      const res = await client.getTracking(packageId)
      tracking = {
        tracking_code: res.tracking_code,
        estado: res.status,
        events: res.events,
        error: res.error,
      }
    } else {
      // FastMail
      const client = createFastMailClient(carrier.config, carrier.credentials)
      const res = await client.getTracking(trackingNumber)
      tracking = {
        numero_guia: res.numero_guia,
        estado: res.estado,
        eventos: res.eventos,
        error: res.error,
      }
    }

    if (tracking.error) {
      return NextResponse.json({ error: tracking.error }, { status: 502 })
    }

    // Actualizar shipment en DB si existe
    const { data: shipment } = await supabase
      .from("shipments")
      .select("id, status")
      .eq("tracking_number", trackingNumber)
      .eq("carrier_slug", carrierSlug)
      .maybeSingle()

    if (shipment) {
      const newStatus =
        carrierSlug === "cabify" ? mapCabifyStatus(tracking.estado ?? "") : mapFastMailStatus(tracking.estado ?? "")

      await supabase
        .from("shipments")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", shipment.id)

      // Normalizar eventos a formato unificado
      const events =
        carrierSlug === "cabify"
          ? (tracking.events ?? []).map((e) => ({
              shipment_id: shipment.id,
              status: e.status,
              description: e.description,
              location: e.location ?? null,
              occurred_at: e.timestamp,
              raw: e,
            }))
          : (tracking.eventos ?? []).map((e) => ({
              shipment_id: shipment.id,
              status: e.estado,
              description: e.descripcion,
              location: e.ubicacion ?? null,
              occurred_at: e.fecha,
              raw: e,
            }))

      if (events.length) {
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

function mapFastMailStatus(estado: string): string {
  const s = estado?.toLowerCase() ?? ""
  if (s.includes("entregad")) return "delivered"
  if (s.includes("transit") || s.includes("camino") || s.includes("distribuc")) return "in_transit"
  if (s.includes("devuelt") || s.includes("retorn")) return "returned"
  if (s.includes("fallid") || s.includes("error") || s.includes("no entregad")) return "failed"
  return "pending"
}
