import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getWSAATicket } from "@/lib/arca/wsaa"
import { requestCAE } from "@/lib/arca/wsfe"
import type { FacturaItem } from "@/lib/arca/wsfe"

// GET — listar facturas con paginación y filtros
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const page       = parseInt(searchParams.get("page") || "1")
    const limit      = parseInt(searchParams.get("limit") || "20")
    const estado     = searchParams.get("estado") || ""
    const q          = searchParams.get("q") || ""
    const empresa_id = searchParams.get("empresa_id") || ""
    const offset     = (page - 1) * limit

    let query = supabase
      .from("facturas")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)

    if (empresa_id) query = query.eq("empresa_id", empresa_id)
    if (estado) query = query.eq("estado", estado)
    if (q) query = query.or(`razon_social_receptor.ilike.%${q}%,nro_doc_receptor.ilike.%${q}%,cae.ilike.%${q}%`)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error
    return NextResponse.json({ ok: true, facturas: data ?? [], total: count ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — emitir nueva factura solicitando CAE a ARCA
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      tipo_comprobante, concepto,
      tipo_doc_receptor, nro_doc_receptor, receptor_nombre, receptor_domicilio, receptor_condicion_iva,
      items, moneda, orden_id,
    } = body

    if (!items?.length) return NextResponse.json({ error: "La factura debe tener al menos un ítem" }, { status: 400 })
    if (!receptor_nombre) return NextResponse.json({ error: "Nombre del receptor requerido" }, { status: 400 })

    // empresa_id puede venir en el body o tomamos la primera del usuario
    const empresa_id = body.empresa_id

    // Obtener configuración ARCA del usuario
    let cfgQuery = supabase.from("arca_config").select("*").eq("user_id", user.id)
    if (empresa_id) cfgQuery = cfgQuery.eq("id", empresa_id)
    else cfgQuery = cfgQuery.order("created_at", { ascending: true })

    const { data: config, error: cfgErr } = await cfgQuery.limit(1).single()

    if (cfgErr || !config) {
      return NextResponse.json({ error: "Configuración ARCA no encontrada. Completá los datos en Facturación > Configuración." }, { status: 400 })
    }

    // Obtener ticket WSAA (con caché)
    const { token, sign } = await getWSAATicket(config)

    // Calcular totales
    const typedItems: FacturaItem[] = items
    let subtotal = 0, iva_105 = 0, iva_21 = 0, iva_27 = 0
    for (const item of typedItems) {
      subtotal += item.subtotal
      if (item.alicuota_iva === 10.5) iva_105 += item.iva
      else if (item.alicuota_iva === 21)  iva_21  += item.iva
      else if (item.alicuota_iva === 27)  iva_27  += item.iva
    }
    const total = parseFloat((subtotal + iva_105 + iva_21 + iva_27).toFixed(2))

    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "")

    // Solicitar CAE a ARCA
    const caeResp = await requestCAE({
      cuit:             config.cuit,
      punto_venta:      config.punto_venta,
      tipo_comprobante: parseInt(tipo_comprobante),
      concepto:         concepto || 1,
      tipo_doc_receptor: parseInt(tipo_doc_receptor || "99"),
      nro_doc_receptor: nro_doc_receptor || "0",
      condicion_iva_receptor: receptor_condicion_iva || "consumidor_final",
      fecha,
      items:    typedItems,
      moneda:   moneda || "PES",
      token,
      sign,
      ambiente: config.ambiente || config.modo,
    })

    // Guardar factura en DB
    const { data: factura, error: saveErr } = await supabase
      .from("facturas")
      .insert({
        user_id:               user.id,
        empresa_id:            config.id,
        arca_config_id:        config.id,
        punto_venta:           config.punto_venta,
        tipo_comprobante:      parseInt(tipo_comprobante),
        numero:                caeResp.numero,
        cae:                   caeResp.cae,
        cae_vencimiento:       `${caeResp.cae_vto.slice(0,4)}-${caeResp.cae_vto.slice(4,6)}-${caeResp.cae_vto.slice(6,8)}`,
        tipo_doc_receptor:     parseInt(tipo_doc_receptor || "99"),
        nro_doc_receptor:      nro_doc_receptor || "0",
        razon_social_receptor: receptor_nombre,
        receptor_domicilio,
        receptor_condicion_iva: receptor_condicion_iva || "consumidor_final",
        moneda:                moneda || "PES",
        importe_neto:          subtotal,
        importe_iva_105:       iva_105,
        importe_iva_21:        iva_21,
        importe_iva_27:        iva_27,
        importe_iva:           parseFloat((iva_105 + iva_21 + iva_27).toFixed(2)),
        importe_total:         total,
        items,
        estado:                "emitida",
        orden_id:              orden_id || null,
        fecha:                 new Date().toISOString().slice(0, 10),
        concepto:              concepto || 1,
      })
      .select()
      .single()

    if (saveErr) throw saveErr

    return NextResponse.json({ ok: true, factura })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
