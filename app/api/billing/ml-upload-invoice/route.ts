import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST /api/billing/ml-upload-invoice
// Sube la factura emitida a MercadoLibre usando el endpoint oficial de "upload invoices".
//
// Endpoint ML: POST /packs/{pack_id}/invoice  o  POST /orders/{order_id}/invoice
// Ref: https://developers.mercadolibre.com/es_ar/recibir-pagos#upload-invoices
//
// Body: {
//   account_id, order_id, factura_id?,
//   invoice_number, invoice_date (YYYY-MM-DD), total_amount,
//   pdf_url? (URL pública) | pdf_base64? (base64 sin prefijo)
// }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 })
  }

  const {
    account_id, order_id, factura_id,
    invoice_number, invoice_date, total_amount,
    pdf_url, pdf_base64,
  } = body

  if (!account_id || !order_id) {
    return NextResponse.json({ ok: false, error: "Faltan account_id / order_id" }, { status: 400 })
  }
  if (!invoice_number || !invoice_date || !total_amount) {
    return NextResponse.json({ ok: false, error: "Faltan invoice_number / invoice_date / total_amount" }, { status: 400 })
  }
  if (!pdf_url && !pdf_base64) {
    return NextResponse.json({ ok: false, error: "Se requiere pdf_url o pdf_base64" }, { status: 400 })
  }

  // ── Obtener access_token ─────────────────────────────────────────────────
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token, ml_user_id")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta ML no encontrada" }, { status: 404 })
  }

  // ── Crear/actualizar registro de upload (estado pending) ─────────────────
  const { data: uploadRecord, error: insertErr } = await supabase
    .from("ml_invoices_uploads")
    .upsert({
      account_id,
      order_id,
      factura_id:     factura_id || null,
      invoice_number: String(invoice_number),
      invoice_date,
      total_amount:   Number(total_amount),
      pdf_url:        pdf_url || null,
      status:         "pending",
      updated_at:     new Date().toISOString(),
    }, { onConflict: "account_id,order_id" })
    .select("id")
    .single()

  if (insertErr) {
    return NextResponse.json({ ok: false, error: `DB error: ${insertErr.message}` }, { status: 500 })
  }

  // ── Preparar payload para ML ─────────────────────────────────────────────
  // ML espera multipart/form-data con:
  //   - invoice_number (string)
  //   - invoice_date   (YYYY-MM-DD)
  //   - total_amount   (number)
  //   - type           ("invoice")
  //   - file           (PDF binario)
  //
  // Si se provee pdf_url, descargamos el PDF primero.
  let pdfBuffer: Buffer
  try {
    if (pdf_base64) {
      pdfBuffer = Buffer.from(pdf_base64, "base64")
    } else {
      const pdfRes = await fetch(pdf_url!, { signal: AbortSignal.timeout(15000) })
      if (!pdfRes.ok) throw new Error(`No se pudo descargar el PDF (HTTP ${pdfRes.status})`)
      pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
    }
  } catch (e: any) {
    await supabase.from("ml_invoices_uploads").update({
      status: "error", error_message: `PDF fetch: ${e.message}`, updated_at: new Date().toISOString(),
    }).eq("id", uploadRecord.id)
    return NextResponse.json({ ok: false, error: `Error descargando PDF: ${e.message}` }, { status: 502 })
  }

  // ── Llamar al endpoint de ML ─────────────────────────────────────────────
  const formData = new FormData()
  formData.append("type",           "invoice")
  formData.append("invoice_number", String(invoice_number))
  formData.append("invoice_date",   invoice_date)
  formData.append("total_amount",   String(total_amount))
  formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), `factura_${invoice_number}.pdf`)

  const mlUrl = `https://api.mercadolibre.com/orders/${order_id}/invoice`

  let mlResponse: any
  let mlStatus:   number
  try {
    const mlRes = await fetch(mlUrl, {
      method:  "POST",
      headers: { Authorization: `Bearer ${mlAccount.access_token}` },
      body:    formData,
      signal:  AbortSignal.timeout(20000),
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
    }, { status: 502 })
  }

  return NextResponse.json({
    ok:          true,
    upload_id:   uploadRecord.id,
    ml_response: mlResponse,
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
