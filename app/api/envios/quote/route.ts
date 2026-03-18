import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createFastMailClient } from "@/domains/shipping/carriers/fastmail"
import { createCabifyClient } from "@/domains/shipping/carriers/cabify"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      carrier_slug = "fastmail",
      origen_cp,
      destino_cp,
      peso_g,
      valor,
      dimensiones,
    } = body

    if (!origen_cp || !destino_cp || !peso_g) {
      return NextResponse.json(
        { error: "origen_cp, destino_cp y peso_g son requeridos" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { data: carrier } = await supabase
      .from("carriers")
      .select("*")
      .eq("slug", carrier_slug)
      .single()

    if (!carrier?.active) {
      return NextResponse.json({ error: `${carrier_slug}: transportista no configurado` }, { status: 503 })
    }

    // ── Dispatch por carrier ────────────────────────────────────────────────────
    if (carrier_slug === "cabify") {
      const client = createCabifyClient(carrier.config, carrier.credentials)
      const quote  = await client.quote({
        pickup_postal_code:   origen_cp,
        delivery_postal_code: destino_cp,
        weight_g:             peso_g,
        declared_value:       valor ?? 0,
      })

      if (quote.error) {
        return NextResponse.json({ error: quote.error }, { status: 502 })
      }

      // Normalizar al formato de respuesta unificado
      // CabifyShippingType tiene: id, name, modality, description
      const servicios = quote.services.map(s => ({
        codigo:      s.modality ?? s.id,
        nombre:      s.name,
        plazo_dias:  null,
        precio:      null,
        descripcion: s.description,
      }))

      return NextResponse.json({ ok: true, servicios, carrier: "cabify" })
    } else {
      // FastMail (default)
      const client = createFastMailClient(carrier.config, carrier.credentials)
      const quote  = await client.quote({ origen_cp, destino_cp, peso_g, valor: valor ?? 0, dimensiones })

      if (quote.error) {
        return NextResponse.json({ error: quote.error }, { status: 502 })
      }

      return NextResponse.json({ ok: true, servicios: quote.servicios, carrier: "fastmail" })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
