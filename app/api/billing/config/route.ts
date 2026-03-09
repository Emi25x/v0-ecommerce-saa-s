import { createClient } from "@/lib/supabase/server"
import { NextResponse, NextRequest } from "next/server"

const SELECT_COLS = "id, user_id, cuit, razon_social, nombre_empresa, domicilio_fiscal, punto_venta, condicion_iva, ambiente, cert_pem, certificado_pem, clave_pem, private_key_pem, wsaa_token, wsaa_sign, wsaa_expires_at, logo_url, telefono, email, web, instagram, facebook, whatsapp, nota_factura, datos_pago, factura_opciones, iva_default, created_at"

// GET — devuelve ARRAY de todas las empresas del usuario
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("arca_config")
      .select(SELECT_COLS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (error) throw error
    return NextResponse.json({ ok: true, empresas: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crea nueva empresa (sin id) o actualiza existente (con id)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      id,
      cuit, razon_social, nombre_empresa, domicilio_fiscal, punto_venta, condicion_iva, ambiente,
      cert_pem, clave_pem,
      telefono, email, web, instagram, facebook, whatsapp,
      nota_factura, datos_pago, logo_url, factura_opciones, iva_default,
    } = body

    if (!cuit || !razon_social || !punto_venta) {
      return NextResponse.json({ error: "CUIT, razón social y punto de venta son requeridos" }, { status: 400 })
    }

    const newCuit     = cuit.replace(/-/g, "")
    const newAmbiente = ambiente || "homologacion"

    // Verificar cambios críticos solo si es update
    let criticalChanged = !id
    if (id) {
      const { data: existing } = await supabase
        .from("arca_config")
        .select("cuit, ambiente, cert_pem, private_key_pem")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

      criticalChanged =
        !existing ||
        existing.cuit     !== newCuit     ||
        existing.ambiente !== newAmbiente ||
        (cert_pem  && cert_pem  !== existing.cert_pem) ||
        (clave_pem && clave_pem !== existing.private_key_pem)
    }

    const payload: any = {
      user_id:          user.id,
      cuit:             newCuit,
      razon_social,
      nombre_empresa:   nombre_empresa || null,
      domicilio_fiscal: domicilio_fiscal || null,
      punto_venta:      parseInt(punto_venta),
      condicion_iva:    condicion_iva || "responsable_inscripto",
      ambiente:         newAmbiente,
      updated_at:       new Date().toISOString(),
      telefono:         telefono  || null,
      email:            email     || null,
      web:              web       || null,
      instagram:        instagram || null,
      facebook:         facebook  || null,
      whatsapp:         whatsapp  || null,
      iva_default:      iva_default != null ? Number(iva_default) : 21,
      nota_factura:     nota_factura || null,
      datos_pago:       datos_pago   || null,
    }

    if (criticalChanged) {
      payload.wsaa_token      = null
      payload.wsaa_sign       = null
      payload.wsaa_expires_at = null
    }
    if (logo_url)         payload.logo_url        = logo_url
    if (factura_opciones) payload.factura_opciones = factura_opciones
    if (cert_pem)  { payload.cert_pem = cert_pem; payload.certificado_pem = cert_pem }
    if (clave_pem) { payload.clave_pem = clave_pem; payload.private_key_pem = clave_pem }

    let data, error
    if (id) {
      // Update empresa existente
      ;({ data, error } = await supabase
        .from("arca_config")
        .update(payload)
        .eq("id", id)
        .eq("user_id", user.id)
        .select(SELECT_COLS)
        .single())
    } else {
      // Insert nueva empresa
      ;({ data, error } = await supabase
        .from("arca_config")
        .insert(payload)
        .select(SELECT_COLS)
        .single())
    }

    if (error) throw error
    return NextResponse.json({ ok: true, empresa: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — elimina empresa (solo si no tiene facturas)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const id = request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

    // Verificar que pertenece al usuario
    const { data: emp } = await supabase
      .from("arca_config")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (!emp) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 })

    // Verificar que no tenga facturas
    const { count } = await supabase
      .from("facturas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", id)

    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: `No se puede eliminar: tiene ${count} factura(s) asociada(s).` }, { status: 409 })
    }

    const { error } = await supabase.from("arca_config").delete().eq("id", id).eq("user_id", user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
