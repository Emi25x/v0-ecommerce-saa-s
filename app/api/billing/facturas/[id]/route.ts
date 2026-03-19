import { createClient } from "@/lib/db/server"
import { NextResponse } from "next/server"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: factura, error } = await supabase
      .from("facturas")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error || !factura) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, factura })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — corregir datos del receptor en una factura ya emitida.
// Solo se pueden actualizar campos del receptor (nombre, doc, domicilio, IVA).
// Los datos fiscales de ARCA (CAE, número, totales) son inmutables.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Verificar que la factura pertenece al usuario
    const { data: factura, error: fetchErr } = await supabase
      .from("facturas")
      .select("id, user_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (fetchErr || !factura) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    const body = await request.json()

    // Solo permitir actualizar campos del receptor — nunca CAE, numero, totales, etc.
    const allowed = [
      "razon_social_receptor",
      "tipo_doc_receptor",
      "nro_doc_receptor",
      "receptor_domicilio",
      "receptor_condicion_iva",
      "billing_info_snapshot",
    ]
    const patch: Record<string, any> = {}
    for (const key of allowed) {
      if (key in body) patch[key] = body[key]
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Sin campos válidos para actualizar" }, { status: 400 })
    }

    const { data: updated, error: updateErr } = await supabase
      .from("facturas")
      .update(patch)
      .eq("id", id)
      .select()
      .single()

    if (updateErr) throw updateErr

    return NextResponse.json({ ok: true, factura: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
