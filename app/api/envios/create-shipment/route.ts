import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient } from "@/lib/carriers/fastmail"

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
    const { data: carrier } = await supabase
      .from("carriers")
      .select("*")
      .eq("slug", carrier_slug)
      .single()

    if (!carrier) {
      return NextResponse.json({ error: "Transportista no encontrado" }, { status: 404 })
    }
    if (!carrier.active) {
      return NextResponse.json({ error: "Transportista inactivo — configurar credenciales primero" }, { status: 400 })
    }

    const client = createFastMailClient(carrier.config, carrier.credentials)
    const result = await client.createShipment(shipment)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    // Guardar en DB
    const { data: saved, error: dbErr } = await supabase
      .from("shipments")
      .insert({
        carrier_id:      carrier.id,
        carrier_slug:    carrier_slug,
        external_id:     result.id,
        tracking_number: result.numero_guia,
        status:          result.estado ?? "pending",
        origin:          shipment.remitente,
        destination:     shipment.destinatario,
        items:           shipment.items,
        weight_g:        shipment.peso_total_g,
        declared_value:  shipment.valor_declarado,
        cost:            result.costo ?? null,
        label_url:       result.url_etiqueta ?? null,
        tracking_url:    result.url_seguimiento ?? null,
        metadata:        { referencia: shipment.referencia ?? null },
      })
      .select()
      .single()

    if (dbErr) {
      console.error("[CREATE-SHIPMENT] DB error:", dbErr.message)
    }

    return NextResponse.json({
      ok: true,
      shipment_id:     saved?.id ?? null,
      tracking_number: result.numero_guia,
      label_url:       result.url_etiqueta,
      tracking_url:    result.url_seguimiento,
      costo:           result.costo,
      estado:          result.estado,
    })
  } catch (err: any) {
    console.error("[CREATE-SHIPMENT] Error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
