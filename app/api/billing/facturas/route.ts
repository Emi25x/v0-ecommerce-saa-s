import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getWSAATicket } from "@/lib/arca/wsaa"
import { requestCAE } from "@/lib/arca/wsfe"
import type { FacturaItem } from "@/lib/arca/wsfe"
import { getMLOrderBilling } from "@/lib/billing/get-ml-order-billing"

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
    let {
      tipo_comprobante, concepto,
      tipo_doc_receptor, nro_doc_receptor, receptor_nombre, receptor_domicilio, receptor_condicion_iva,
      items, moneda, orden_id,
      origen,                  // "ml" | "manual" | undefined — mapea a columna `origen`
      billing_info_snapshot,   // raw billing_info de ML para auditoría
      account_id: bodyAccountId,
    } = body

    if (!items?.length) return NextResponse.json({ error: "La factura debe tener al menos un ítem" }, { status: 400 })

    // ── Auto-enrich datos fiscales desde ML si viene orden_id ────────────────
    // Se ejecuta siempre que haya orden_id + account_id, independientemente de
    // lo que mandó el frontend. El resultado de /billing_info es la fuente
    // primaria; los valores del frontend solo se usan como último fallback.
    let billing_info_warning: string | null = null

    if (orden_id && bodyAccountId) {
      try {
        const bi = await getMLOrderBilling(supabase, bodyAccountId, orden_id)

        if (bi.ok) {
          // Guardar solo los campos fiscales en el snapshot (sin metadatos del endpoint)
          billing_info_snapshot = {
            nombre:        bi.nombre,
            doc_tipo:      bi.doc_tipo,
            doc_numero:    bi.doc_numero,
            condicion_iva: bi.condicion_iva,
            direccion:     bi.direccion,
            missing:       bi.billing_info_missing ?? false,
          }

          if (!bi.billing_info_missing) {
            // Datos fiscales reales — sobrescriben siempre el input del frontend
            // porque /billing_info es la fuente de verdad fiscal de ML.
            receptor_nombre        = bi.nombre        || receptor_nombre
            receptor_domicilio     = bi.direccion     || receptor_domicilio     || null
            receptor_condicion_iva = bi.condicion_iva || receptor_condicion_iva || "consumidor_final"

            // doc_tipo → tipo_doc_receptor numérico (ARCA: 80=CUIT, 86=CUIL, 96=DNI, 99=sin identificar)
            if (bi.doc_numero) {
              const docTipoRaw = (bi.doc_tipo || "").toUpperCase().trim()
              tipo_doc_receptor = docTipoRaw === "CUIT" ? "80"
                : docTipoRaw === "CUIL"                 ? "86"
                : docTipoRaw === "DNI"                  ? "96"
                : docTipoRaw === "CI"                   ? "96"
                : "96"   // default: DNI si hay número pero tipo desconocido
              nro_doc_receptor  = String(bi.doc_numero).replace(/\D/g, "")
            }
          } else {
            // billing_info_missing: ML no tiene datos fiscales del comprador.
            // Permitir consumidor final con warning — no bloquear la factura.
            billing_info_warning  = "billing_info_missing: se emite como Consumidor Final"
            receptor_nombre       = receptor_nombre       || "Consumidor Final"
            tipo_doc_receptor     = tipo_doc_receptor     || "99"
            nro_doc_receptor      = nro_doc_receptor      || "0"
            receptor_condicion_iva = receptor_condicion_iva || "consumidor_final"
          }
        }
      } catch {
        // Si falla, continuar con los datos que mandó el frontend.
        // No bloquear la emisión — el operador puede haber ingresado los datos manualmente.
        billing_info_warning = "billing_info_fetch_failed: se usan los datos del formulario"
      }
    }

    // Último fallback: si no hay nombre (sin orden ML y sin datos del frontend)
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

    // Calcular subtotal e iva si no vienen precalculados (ej: desde ML)
    const r2 = (n: number) => Math.round(n * 100) / 100
    const typedItems: FacturaItem[] = items.map((item: any) => {
      const qty   = Number(item.cantidad) || 1
      const price = r2(Number(item.precio_unitario) || 0)
      const aliq  = Number(item.alicuota_iva) || 0
      const base  = r2(qty * price)
      const iva   = r2(base * aliq / 100)
      return {
        descripcion:     item.descripcion || "",
        cantidad:        qty,
        precio_unitario: price,
        alicuota_iva:    aliq as 0 | 10.5 | 21 | 27,
        subtotal:        base,
        iva:             iva,
      } satisfies FacturaItem
    })

    let subtotal = 0, iva_105 = 0, iva_21 = 0, iva_27 = 0
    for (const item of typedItems) {
      subtotal += item.subtotal
      if (item.alicuota_iva === 10.5) iva_105 += item.iva
      else if (item.alicuota_iva === 21) iva_21 += item.iva
      else if (item.alicuota_iva === 27) iva_27 += item.iva
    }
    subtotal = r2(subtotal)
    const total = r2(subtotal + iva_105 + iva_21 + iva_27)

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
        origen:                origen || (orden_id ? "ml" : "manual"),
        billing_info_snapshot: billing_info_snapshot || null,
        fecha:                 new Date().toISOString().slice(0, 10),
        concepto:              concepto || 1,
      })
      .select()
      .single()

    if (saveErr) throw saveErr

    return NextResponse.json({
      ok: true,
      factura,
      ...(billing_info_warning ? { warning: billing_info_warning } : {}),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
