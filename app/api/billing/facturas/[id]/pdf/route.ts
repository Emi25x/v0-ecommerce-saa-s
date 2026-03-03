import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { buildFacturaHTML } from "@/lib/arca/pdf"

// Extrae la lógica de construcción del HTML para poder reutilizarla
function buildPDFResponse(factura: any) {
  const config = factura.arca_config as any

  if (!config) {
    return NextResponse.json({ error: "Configuración ARCA no encontrada para esta factura" }, { status: 404 })
  }

  const html = buildFacturaHTML({
    razon_social:           config.razon_social,
    cuit:                   config.cuit,
    domicilio_fiscal:       config.domicilio_fiscal      || "",
    condicion_iva:          config.condicion_iva         || config.tipo_emisor,
    punto_venta:            factura.punto_venta,
    logo_url:               config.logo_url              || undefined,
    telefono:               config.telefono              || undefined,
    email:                  config.email                 || undefined,
    web:                    config.web                   || undefined,
    instagram:              config.instagram             || undefined,
    facebook:               config.facebook              || undefined,
    whatsapp:               config.whatsapp              || undefined,
    nota_factura:           config.nota_factura          || undefined,
    datos_pago:             config.datos_pago            || undefined,
    factura_opciones:       config.factura_opciones      || undefined,
    tipo_comprobante:       factura.tipo_comprobante,
    numero:                 factura.numero,
    fecha_emision:          factura.fecha,
    cae:                    factura.cae,
    cae_vto:                (factura.cae_vencimiento     || "").replace(/-/g, ""),
    receptor_nombre:        factura.razon_social_receptor,
    receptor_tipo_doc:      factura.tipo_doc_receptor,
    receptor_nro_doc:       factura.nro_doc_receptor,
    receptor_condicion_iva: factura.receptor_condicion_iva || "consumidor_final",
    receptor_domicilio:     factura.receptor_domicilio,
    items:                  factura.items                || [],
    subtotal:               Number(factura.importe_neto),
    iva_105:                Number(factura.importe_iva_105),
    iva_21:                 Number(factura.importe_iva_21),
    iva_27:                 Number(factura.importe_iva_27),
    total:                  Number(factura.importe_total),
    moneda:                 factura.moneda               || "PES",
  })

  return new Response(html, {
    headers: {
      "Content-Type":        "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="factura-${String(factura.punto_venta).padStart(4, "0")}-${String(factura.numero).padStart(8, "0")}.html"`,
    },
  })
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Dos FK apuntan a arca_config desde facturas (arca_config_id y empresa_id).
    // Supabase no puede inferir el join sin el hint explícito de la FK.
    const SELECT = "*, arca_config!facturas_arca_config_id_fkey(*)"

    const { data: factura } = await supabase
      .from("facturas")
      .select(SELECT)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (factura) return buildPDFResponse(factura)

    // Fallback: la factura puede existir con user_id diferente (multiempresa/legacy)
    // Se verifica que la arca_config pertenezca al usuario autenticado
    const { data: facturaAny, error } = await supabase
      .from("facturas")
      .select(SELECT)
      .eq("id", params.id)
      .maybeSingle()

    if (error || !facturaAny) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    const config = facturaAny.arca_config as any
    if (config?.user_id && config.user_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    return buildPDFResponse(facturaAny)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
