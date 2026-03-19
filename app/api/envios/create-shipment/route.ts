import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { createFastMailClient } from "@/domains/shipping/carriers/fastmail"
import { createCabifyClient, mapCabifyStatus } from "@/domains/shipping/carriers/cabify"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { carrier_slug = "fastmail", shipment } = body

    if (!shipment) {
      return NextResponse.json({ error: "shipment requerido" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Cargar carrier y credenciales
    const { data: carrier } = await supabase.from("carriers").select("*").eq("slug", carrier_slug).single()

    if (!carrier) {
      return NextResponse.json({ error: "Transportista no encontrado" }, { status: 404 })
    }
    if (!carrier.active) {
      return NextResponse.json({ error: "Transportista inactivo — configurar credenciales primero" }, { status: 400 })
    }

    let result: {
      id?: string
      numero_guia?: string
      tracking_code?: string
      estado?: string
      status?: string
      url_etiqueta?: string
      label_url?: string
      url_seguimiento?: string
      tracking_url?: string
      costo?: number
      estimated_cost?: number
      error?: string
    }

    // ── Dispatch por carrier ────────────────────────────────────────────────────
    if (carrier_slug === "cabify") {
      const client = createCabifyClient(carrier.config, carrier.credentials)
      const res = await client.createShipment(shipment)
      result = {
        id: res.id,
        tracking_code: res.tracking_code,
        estado: res.status,
        label_url: res.label_url,
        tracking_url: res.tracking_url,
        estimated_cost: res.estimated_cost,
        error: res.error,
      }
    } else {
      // FastMail (default)
      const client = createFastMailClient(carrier.config, carrier.credentials)
      const res = await client.createShipment(shipment)
      result = {
        id: res.id,
        numero_guia: res.numero_guia,
        estado: res.estado,
        url_etiqueta: res.url_etiqueta,
        url_seguimiento: res.url_seguimiento,
        costo: res.costo,
        error: res.error,
      }
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    const trackingNumber = result.tracking_code ?? result.numero_guia ?? ""
    const labelUrl = result.label_url ?? result.url_etiqueta ?? null
    const trackingUrl = result.tracking_url ?? result.url_seguimiento ?? null
    const cost = result.estimated_cost ?? result.costo ?? null
    const status = carrier_slug === "cabify" ? mapCabifyStatus(result.estado ?? "") : (result.estado ?? "pending")

    // Guardar en DB
    const { data: saved, error: dbErr } = await supabase
      .from("shipments")
      .insert({
        carrier_id: carrier.id,
        carrier_slug,
        external_id: result.id ?? null,
        tracking_number: trackingNumber,
        status,
        origin: shipment.pickup ?? shipment.remitente,
        destination: shipment.delivery ?? shipment.destinatario,
        items: shipment.items,
        weight_g: shipment.weight_g ?? shipment.peso_total_g,
        declared_value: shipment.declared_value ?? shipment.valor_declarado,
        cost,
        label_url: labelUrl,
        tracking_url: trackingUrl,
        metadata: {
          referencia: shipment.reference ?? shipment.referencia ?? null,
          service: shipment.service ?? null,
        },
      })
      .select()
      .single()

    if (dbErr) {
      console.error("[CREATE-SHIPMENT] DB error:", dbErr.message)
    }

    return NextResponse.json({
      ok: true,
      shipment_id: saved?.id ?? null,
      tracking_number: trackingNumber,
      label_url: labelUrl,
      tracking_url: trackingUrl,
      costo: cost,
      estado: result.estado ?? result.status,
    })
  } catch (err: any) {
    console.error("[CREATE-SHIPMENT] Error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
