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
    // Normalizar items: asegurar que tengan subtotal e iva calculados
    items: (factura.items || []).map((it: any) => {
      const qty      = Number(it.cantidad        || 1)
      const price    = Number(it.precio_unitario || it.precio || 0)
      const alicuota = Number(it.alicuota_iva    || 0)
      const subtotal = it.subtotal != null ? Number(it.subtotal) : qty * price
      const iva      = it.iva      != null ? Number(it.iva)      : Math.round(subtotal * (alicuota / 100) * 100) / 100
      return {
        descripcion:     it.descripcion || it.titulo || "",
        cantidad:        qty,
        precio_unitario: price,
        alicuota_iva:    alicuota,
        subtotal,
        iva,
      }
    }),
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

    // 1. Buscar la factura
    const { data: factura, error: facturaError } = await supabase
      .from("facturas")
      .select("*")
      .eq("id", params.id)
      .maybeSingle()

    if (facturaError || !factura) {
      console.log("[v0] PDF - Factura not found, id:", params.id, "error:", facturaError?.message)
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    // 2. Buscar arca_config y verificar autorización en una sola query
    const configId = factura.arca_config_id || factura.empresa_id
    if (!configId) {
      return NextResponse.json({ error: "Factura sin configuración ARCA asociada" }, { status: 404 })
    }

    const { data: config, error: configError } = await supabase
      .from("arca_config")
      .select("*")
      .eq("id", configId)
      .single()

    if (configError || !config) {
      return NextResponse.json({ error: "Configuración ARCA no encontrada" }, { status: 404 })
    }

    // Autorización: user_id de la config debe coincidir (cubre también facturas con user_id nulo)
    if (config.user_id !== user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    return buildPDFResponse({ ...factura, arca_config: config })
  } catch (e: any) {
    console.log("[v0] PDF - Unexpected error:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
