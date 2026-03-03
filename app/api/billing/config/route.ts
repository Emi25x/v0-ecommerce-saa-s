import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("arca_config")
      .select("id, user_id, cuit, razon_social, domicilio_fiscal, punto_venta, condicion_iva, ambiente, cert_pem, certificado_pem, clave_pem, private_key_pem, wsaa_token, wsaa_sign, wsaa_expires_at, logo_url, telefono, email, web, instagram, facebook, whatsapp, nota_factura, datos_pago, factura_opciones, iva_default, created_at")
      .eq("user_id", user.id)
      .single()

    if (error && error.code !== "PGRST116") throw error
    return NextResponse.json({ ok: true, config: data ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      cuit, razon_social, domicilio_fiscal, punto_venta, condicion_iva, ambiente,
      cert_pem, clave_pem,
      telefono, email, web, instagram, facebook, whatsapp,
      nota_factura, datos_pago, logo_url, factura_opciones, iva_default,
    } = body

    if (!cuit || !razon_social || !punto_venta) {
      return NextResponse.json({ error: "CUIT, razón social y punto de venta son requeridos" }, { status: 400 })
    }

    // Verificar si cambiaron datos críticos (CUIT, ambiente, cert, clave)
    // Solo en ese caso invalidar el token WSAA cacheado
    const { data: existing } = await supabase
      .from("arca_config")
      .select("cuit, ambiente, cert_pem, private_key_pem, wsaa_token, wsaa_sign, wsaa_expires_at")
      .eq("user_id", user.id)
      .single()

    const newCuit    = cuit.replace(/-/g, "")
    const newAmbiente = ambiente || "homologacion"
    const criticalChanged =
      !existing ||
      existing.cuit     !== newCuit     ||
      existing.ambiente !== newAmbiente ||
      (cert_pem  && cert_pem  !== existing.cert_pem) ||
      (clave_pem && clave_pem !== existing.private_key_pem)

    const payload: any = {
      user_id:          user.id,
      cuit:             newCuit,
      razon_social,
      domicilio_fiscal: domicilio_fiscal || null,
      punto_venta:      parseInt(punto_venta),
      condicion_iva:    condicion_iva || "responsable_inscripto",
      tipo_emisor:      condicion_iva || "responsable_inscripto",
      ambiente:         newAmbiente,
      modo:             newAmbiente,
      updated_at:       new Date().toISOString(),
      // Contacto / redes
      telefono:         telefono  || null,
      email:            email     || null,
      web:              web       || null,
      instagram:        instagram || null,
      facebook:         facebook  || null,
      whatsapp:         whatsapp  || null,
      // Contenido factura
      iva_default:      iva_default != null ? Number(iva_default) : 21,
      nota_factura:     nota_factura || null,
      datos_pago:       datos_pago   || null,
    }

    // Solo invalidar token si cambió algo crítico
    if (criticalChanged) {
      payload.wsaa_token      = null
      payload.wsaa_sign       = null
      payload.wsaa_expires_at = null
    }

    if (logo_url)          payload.logo_url         = logo_url
    if (factura_opciones)  payload.factura_opciones  = factura_opciones
    if (cert_pem)  { payload.cert_pem = cert_pem; payload.certificado_pem = cert_pem }
    if (clave_pem) { payload.clave_pem = clave_pem; payload.private_key_pem = clave_pem }

    const { data, error } = await supabase
      .from("arca_config")
      .upsert(payload, { onConflict: "user_id" })
      .select("id, cuit, razon_social, punto_venta, ambiente, condicion_iva")
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, config: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
