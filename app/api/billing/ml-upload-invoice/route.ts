import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildFacturaHTML } from "@/lib/arca/pdf"

// POST /api/billing/ml-upload-invoice
// Sube la factura emitida a MercadoLibre usando el endpoint oficial.
//
// Endpoint ML: POST /packs/{pack_id}/fiscal_documents
// Si la orden no tiene pack_id, se usa order_id como pack_id (ML acepta ambos).
// Ref: https://developers.mercadolibre.com.ar/en_us/upload-invoices
//
// Body: { account_id, order_id, factura_id }
//
// El servidor genera el HTML de la factura directamente desde DB (sin round-trip HTTP)
// para evitar el problema de autenticación al intentar descargar el PDF desde una URL
// que requiere sesión de usuario.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 })
  }

  const { account_id, order_id, factura_id } = body

  if (!account_id || !order_id) {
    return NextResponse.json({ ok: false, error: "Faltan account_id / order_id" }, { status: 400 })
  }
  if (!factura_id) {
    return NextResponse.json({ ok: false, error: "Se requiere factura_id" }, { status: 400 })
  }

  // ── Obtener access_token ─────────────────────────────────────────────────
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id")
    .eq("id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta ML no encontrada" }, { status: 404 })
  }

  // ── Obtener factura + config ARCA desde DB (sin round-trip HTTP) ─────────
  const { data: factura, error: facErr } = await supabase
    .from("facturas")
    .select("*, arca_config:arca_config_id(*)")
    .eq("id", factura_id)
    .single()

  if (facErr || !factura) {
    return NextResponse.json({ ok: false, error: "Factura no encontrada" }, { status: 404 })
  }

  // Verificar que la factura pertenece al usuario
  const config = factura.arca_config as any
  if (!config || config.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 })
  }

  // ── Obtener pack_id de la orden en ML ────────────────────────────────────
  // ML requiere endpoint /packs/{pack_id}/fiscal_documents.
  // Si la orden no tiene pack_id, ML acepta usar el order_id como pack_id.
  let packId: string = String(order_id)
  try {
    const orderRes  = await fetch(`https://api.mercadolibre.com/orders/${order_id}`, {
      headers: { Authorization: `Bearer ${mlAccount.access_token}` },
      signal:  AbortSignal.timeout(10_000),
    })
    if (orderRes.ok) {
      const orderData = await orderRes.json()
      if (orderData?.pack_id) packId = String(orderData.pack_id)
    }
  } catch {
    // Si falla, usar order_id como fallback
  }

  // ── Generar HTML de la factura directamente en el servidor ───────────────
  let fileBuffer: Buffer
  let fileName: string
  try {
    const numStr = factura.numero
      ? `${String(factura.punto_venta).padStart(4, "0")}-${String(factura.numero).padStart(8, "0")}`
      : factura_id.slice(0, 8)

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
      cae_vto:                (factura.cae_vencimiento || "").replace(/-/g, ""),
      receptor_nombre:        factura.razon_social_receptor,
      receptor_tipo_doc:      factura.tipo_doc_receptor,
      receptor_nro_doc:       factura.nro_doc_receptor,
      receptor_condicion_iva: factura.receptor_condicion_iva || "consumidor_final",
      receptor_domicilio:     factura.receptor_domicilio,
      items: (factura.items || []).map((it: any) => {
        const qty      = Number(it.cantidad        || 1)
        const price    = Number(it.precio_unitario || it.precio || 0)
        const alicuota = Number(it.alicuota_iva    || 0)
        const subtotal = it.subtotal != null ? Number(it.subtotal) : qty * price
        const iva      = it.iva      != null ? Number(it.iva)      : Math.round(subtotal * (alicuota / 100) * 100) / 100
        return { descripcion: it.descripcion || it.titulo || "", cantidad: qty, precio_unitario: price, alicuota_iva: alicuota, subtotal, iva }
      }),
      subtotal: Number(factura.importe_neto),
      iva_105:  Number(factura.importe_iva_105),
      iva_21:   Number(factura.importe_iva_21),
      iva_27:   Number(factura.importe_iva_27),
      total:    Number(factura.importe_total),
      moneda:   factura.moneda || "PES",
    })

    fileBuffer = Buffer.from(html, "utf-8")
    fileName   = `factura_${numStr}.html`
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Error generando archivo: ${e.message}` }, { status: 500 })
  }

  // ── Crear/actualizar registro de upload (estado pending) ─────────────────
  const { data: uploadRecord, error: insertErr } = await supabase
    .from("ml_invoices_uploads")
    .upsert({
      account_id,
      order_id:       String(order_id),
      factura_id:     factura_id || null,
      invoice_number: factura.numero ? `${String(factura.punto_venta).padStart(4,"0")}-${String(factura.numero).padStart(8,"0")}` : null,
      invoice_date:   factura.fecha || null,
      total_amount:   Number(factura.importe_total),
      pdf_url:        null,
      status:         "pending",
      updated_at:     new Date().toISOString(),
    }, { onConflict: "account_id,order_id" })
    .select("id")
    .single()

  if (insertErr) {
    return NextResponse.json({ ok: false, error: `DB error: ${insertErr.message}` }, { status: 500 })
  }

  // ── Llamar al endpoint ML correcto ────────────────────────────────────────
  // Endpoint: POST /packs/{pack_id}/fiscal_documents
  // Campo:    fiscal_document (multipart/form-data)
  // Ref: https://developers.mercadolibre.com.ar/en_us/upload-invoices
  const formData = new FormData()
  formData.append(
    "fiscal_document",
    new Blob([fileBuffer], { type: "application/pdf" }),
    fileName.replace(".html", ".pdf"),
  )

  const mlUrl = `https://api.mercadolibre.com/packs/${packId}/fiscal_documents`

  let mlResponse: any
  let mlStatus:   number
  try {
    const mlRes = await fetch(mlUrl, {
      method:  "POST",
      headers: { Authorization: `Bearer ${mlAccount.access_token}` },
      body:    formData,
      signal:  AbortSignal.timeout(20_000),
    })
    mlStatus   = mlRes.status
    mlResponse = await mlRes.json().catch(() => ({}))
  } catch (e: any) {
    await supabase.from("ml_invoices_uploads").update({
      status: "error", error_message: `ML request: ${e.message}`, updated_at: new Date().toISOString(),
    }).eq("id", uploadRecord.id)
    return NextResponse.json({ ok: false, error: `Error llamando a ML: ${e.message}` }, { status: 502 })
  }

  const success = mlStatus >= 200 && mlStatus < 300

  // ── Actualizar estado en DB ──────────────────────────────────────────────
  await supabase.from("ml_invoices_uploads").update({
    status:        success ? "uploaded" : "error",
    ml_response:   mlResponse,
    error_message: success ? null : (mlResponse?.message || `HTTP ${mlStatus}`),
    updated_at:    new Date().toISOString(),
  }).eq("id", uploadRecord.id)

  if (!success) {
    return NextResponse.json({
      ok:    false,
      error: mlResponse?.message || `ML respondió con HTTP ${mlStatus}`,
      ml_response: mlResponse,
      pack_id_used: packId,
    }, { status: 502 })
  }

  return NextResponse.json({
    ok:           true,
    upload_id:    uploadRecord.id,
    pack_id_used: packId,
    ml_response:  mlResponse,
  })
}

// GET /api/billing/ml-upload-invoice?account_id=X&order_id=Y
// Consulta el estado de un upload existente.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id") || ""
  const order_id   = searchParams.get("order_id")   || ""

  if (!account_id || !order_id) {
    return NextResponse.json({ ok: false, error: "Faltan parámetros" }, { status: 400 })
  }

  const { data } = await supabase
    .from("ml_invoices_uploads")
    .select("id, status, invoice_number, invoice_date, total_amount, error_message, updated_at")
    .eq("account_id", account_id)
    .eq("order_id",   order_id)
    .maybeSingle()

  return NextResponse.json({ ok: true, upload: data || null })
}
