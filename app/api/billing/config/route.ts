import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET — traer config ARCA del usuario autenticado
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("arca_config")
      .select("id, cuit, razon_social, domicilio_fiscal, punto_venta, tipo_emisor, condicion_iva, modo, ambiente, wsaa_expires_at, created_at")
      .eq("user_id", user.id)
      .single()

    if (error && error.code !== "PGRST116") throw error

    return NextResponse.json({ ok: true, config: data ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear o actualizar config ARCA (upsert)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      cuit, razon_social, domicilio_fiscal,
      punto_venta, condicion_iva, ambiente,
      certificado_pem, clave_pem,
    } = body

    if (!cuit || !razon_social) {
      return NextResponse.json({ error: "CUIT y razón social son obligatorios" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("arca_config")
      .upsert({
        user_id:         user.id,
        cuit:            cuit.trim(),
        razon_social:    razon_social.trim(),
        domicilio_fiscal: domicilio_fiscal?.trim() ?? null,
        punto_venta:     Number(punto_venta) || 1,
        condicion_iva:   condicion_iva ?? "responsable_inscripto",
        ambiente:        ambiente ?? "homologacion",
        // Solo actualizar cert/key si se envían (no pisar con vacío)
        ...(certificado_pem ? { certificado_pem: certificado_pem.trim() } : {}),
        ...(clave_pem       ? { clave_pem:       clave_pem.trim()       } : {}),
        // Resetear token WSAA cuando cambian credenciales
        ...(certificado_pem || clave_pem ? { wsaa_token: null, wsaa_sign: null, wsaa_expires_at: null } : {}),
        updated_at:      new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select("id, cuit, razon_social, punto_venta, condicion_iva, ambiente")
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, config: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
