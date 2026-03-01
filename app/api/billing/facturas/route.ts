import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getWSAAToken } from "@/lib/arca/wsaa"
import { getUltimoComprobante, solicitarCAE } from "@/lib/arca/wsfe"
import { buildFacturaHTML, buildQRUrl } from "@/lib/arca/pdf"
import type { ArcaConfig } from "@/lib/arca/wsaa"
import type { SolicitudFactura } from "@/lib/arca/wsfe"

// GET — listar facturas del usuario con paginación
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const page  = Number(searchParams.get("page")  ?? 1)
    const limit = Number(searchParams.get("limit") ?? 20)
    const estado = searchParams.get("estado") ?? ""

    let query = supabase
      .from("facturas")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (estado) query = query.eq("estado", estado)

    const { data, count, error } = await query.range((page - 1) * limit, page * limit - 1)
    if (error) throw error

    return NextResponse.json({ ok: true, facturas: data ?? [], total: count ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — emitir nueva factura electrónica
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      tipo_comprobante,
      receptor_nombre,
      receptor_tipo_doc,
      receptor_nro_doc,
      receptor_domicilio,
      receptor_condicion_iva,
      items,
      order_id,
    } = body

    if (!receptor_nombre || !items?.length) {
      return NextResponse.json({ error: "Receptor y al menos un ítem son obligatorios" }, { status: 400 })
    }

    // Traer config ARCA del usuario
    const { data: configRaw, error: configErr } = await supabase
      .from("arca_config")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (configErr || !configRaw) {
      return NextResponse.json({ error: "Configuración ARCA no encontrada. Completá los datos en Facturación > Configuración." }, { status: 400 })
    }

    const config = configRaw as ArcaConfig

    // Obtener token WSAA (del caché o renovar)
    const { token, sign } = await getWSAAToken(config)

    const tipoComp   = Number(tipo_comprobante) || 11  // default Factura C
    const puntoVenta = config.punto_venta

    // Obtener próximo número de comprobante
    const ultimoNro = await getUltimoComprobante(config, token, sign, tipoComp, puntoVenta)
    const numero    = ultimoNro + 1

    // Preparar solicitud
    const fechaHoy  = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const solicitud: SolicitudFactura = {
      tipo_comprobante:       tipoComp,
      punto_venta:            puntoVenta,
      fecha_emision:          fechaHoy,
      receptor_tipo_doc:      Number(receptor_tipo_doc) || 96,
      receptor_nro_doc:       receptor_nro_doc ?? "0",
      condicion_iva_receptor: receptor_condicion_iva === "responsable_inscripto" ? 1
                            : receptor_condicion_iva === "exento" ? 4 : 5,
      items,
      moneda: "PES",
    }

    // Solicitar CAE a ARCA
    const resultado = await solicitarCAE(config, token, sign, solicitud, numero)

    const fechaEmisionFmt = `${fechaHoy.slice(6, 8)}/${fechaHoy.slice(4, 6)}/${fechaHoy.slice(0, 4)}`
    const caeVtoFmt = resultado.cae_vto
      ? `${resultado.cae_vto.slice(6, 8)}/${resultado.cae_vto.slice(4, 6)}/${resultado.cae_vto.slice(0, 4)}`
      : ""

    // Guardar en DB
    const { data: factura, error: saveErr } = await supabase
      .from("facturas")
      .insert({
        user_id:               user.id,
        arca_config_id:        config.id,
        punto_venta:           puntoVenta,
        tipo_comprobante:      tipoComp,
        numero,
        cae:                   resultado.cae,
        cae_vto:               resultado.cae_vto ? `${resultado.cae_vto.slice(0,4)}-${resultado.cae_vto.slice(4,6)}-${resultado.cae_vto.slice(6,8)}` : null,
        receptor_tipo_doc:     solicitud.receptor_tipo_doc,
        receptor_nro_doc:      receptor_nro_doc ?? null,
        receptor_nombre,
        receptor_domicilio:    receptor_domicilio ?? null,
        receptor_condicion_iva,
        moneda:                "PES",
        subtotal:              resultado.subtotal,
        iva_105:               resultado.iva_105,
        iva_21:                resultado.iva_21,
        iva_27:                resultado.iva_27,
        total:                 resultado.total,
        items:                 items,
        estado:                "emitida",
        order_id:              order_id ?? null,
      })
      .select("*")
      .single()

    if (saveErr) throw saveErr

    // Generar HTML del PDF
    const pdfHtml = buildFacturaHTML({
      cuit_emisor:          config.cuit,
      razon_social:         config.razon_social,
      domicilio_fiscal:     config.domicilio_fiscal ?? undefined,
      condicion_iva_emisor: config.condicion_iva ?? "Responsable Inscripto",
      punto_venta:          puntoVenta,
      tipo_comprobante:     tipoComp,
      numero,
      receptor_nombre,
      receptor_nro_doc:     receptor_nro_doc ?? undefined,
      receptor_tipo_doc:    solicitud.receptor_tipo_doc,
      receptor_domicilio:   receptor_domicilio ?? undefined,
      receptor_condicion_iva,
      fecha_emision:        fechaEmisionFmt,
      cae:                  resultado.cae,
      cae_vto:              caeVtoFmt,
      moneda:               "PES",
      subtotal:             resultado.subtotal,
      iva_105:              resultado.iva_105,
      iva_21:               resultado.iva_21,
      iva_27:               resultado.iva_27,
      total:                resultado.total,
      items:                items.map((it: any) => ({
        ...it,
        subtotal: it.cantidad * it.precio_unit,
      })),
    })

    return NextResponse.json({
      ok: true,
      factura,
      cae:      resultado.cae,
      cae_vto:  caeVtoFmt,
      numero,
      pdf_html: pdfHtml,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
