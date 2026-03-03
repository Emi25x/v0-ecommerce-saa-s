import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("arca_config")
      .select("id, user_id, cuit, razon_social, domicilio_fiscal, punto_venta, condicion_iva, ambiente, cert_pem, certificado_pem, clave_pem, private_key_pem, wsaa_token, wsaa_sign, wsaa_expires_at, created_at")
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
    const { cuit, razon_social, domicilio_fiscal, punto_venta, condicion_iva, ambiente, cert_pem, clave_pem } = body

    if (!cuit || !razon_social || !punto_venta) {
      return NextResponse.json({ error: "CUIT, razón social y punto de venta son requeridos" }, { status: 400 })
    }

    const payload: any = {
      user_id:         user.id,
      cuit:            cuit.replace(/-/g, ""),
      razon_social,
      domicilio_fiscal: domicilio_fiscal || null,
      punto_venta:     parseInt(punto_venta),
      condicion_iva:   condicion_iva || "responsable_inscripto",
      tipo_emisor:     condicion_iva || "responsable_inscripto",
      ambiente:        ambiente || "homologacion",
      modo:            ambiente || "homologacion",
      updated_at:      new Date().toISOString(),
      // Limpiar token al cambiar config
      wsaa_token:      null,
      wsaa_sign:       null,
      wsaa_expires_at: null,
    }

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
