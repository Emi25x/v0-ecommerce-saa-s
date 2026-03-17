import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildFacturaHTML } from "@/lib/arca/pdf"
import { htmlToPdfBuffer } from "@/lib/billing/generate-pdf"
import { buildFacturaHtmlParams } from "@/lib/billing/build-factura-html-params"

// Puppeteer necesita más tiempo que el default de 10s
export const maxDuration = 60

// POST /api/billing/ml-upload-invoice
// Sube la factura emitida a MercadoLibre usando el endpoint oficial.
//
// Endpoint ML: POST /packs/{pack_id}/fiscal_documents
// Si la orden no tiene pack_id, se usa order_id como pack_id (ML acepta ambos).
// Ref: https://developers.mercadolibre.com.ar/en_us/upload-invoices
//
// Body: { account_id, order_id, factura_id }
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

  const config = factura.arca_config as any
  if (!config || config.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 })
  }

  // ── Obtener pack_id y buyer_id de la orden en ML ──────────────────────────
  // ML requiere /packs/{pack_id}/fiscal_documents.
  // Si pack_id es null, se usa order_id como pack_id (ML lo acepta).
  let packId: string   = String(order_id)
  let buyerId: string  = ""
  try {
    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${order_id}`, {
      headers: { Authorization: `Bearer ${mlAccount.access_token}` },
      signal:  AbortSignal.timeout(10_000),
    })
    if (orderRes.ok) {
      const orderData = await orderRes.json()
      if (orderData?.pack_id)    packId  = String(orderData.pack_id)
      if (orderData?.buyer?.id)  buyerId = String(orderData.buyer.id)
    }
  } catch {
    // usar order_id como packId (ya inicializado arriba)
  }

  // ── Generar PDF de la factura ─────────────────────────────────────────────
  let fileBuffer: Buffer
  let fileName:   string
  try {
    const numStr = factura.numero
      ? `${String(factura.punto_venta).padStart(4, "0")}-${String(factura.numero).padStart(8, "0")}`
      : factura_id.slice(0, 8)

    const html = buildFacturaHTML(buildFacturaHtmlParams(factura, config))

    // ML requiere PDF real — no se acepta HTML como fallback.
    // Si falla la generación de PDF, configurar CHROMIUM_REMOTE_URL en Vercel env vars.
    fileBuffer = await htmlToPdfBuffer(html)
    fileName   = `factura_${numStr}.pdf`
  } catch (e: any) {
    console.error("[ml-upload] Error generando PDF:", e.message)
    return NextResponse.json({
      ok:    false,
      error: `Error generando PDF: ${e.message}. ` +
             `Configurar CHROMIUM_REMOTE_URL en Vercel → Project → Settings → Environment Variables. ` +
             `Ejemplo: https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.tar`,
    }, { status: 500 })
  }

  // ML rechaza PDFs > 1 MB
  const pdfSizeKb = Math.round(fileBuffer.length / 1024)
  if (fileBuffer.length > 1024 * 1024) {
    return NextResponse.json({
      ok:    false,
      error: `PDF demasiado grande: ${pdfSizeKb} KB (límite ML: 1024 KB)`,
    }, { status: 400 })
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

  // ── Subir PDF al endpoint ML ──────────────────────────────────────────────
  // Endpoint: POST /packs/{pack_id}/fiscal_documents
  // Multipart field: fiscal_document
  const formData = new FormData()
  formData.append(
    "fiscal_document",
    new Blob([fileBuffer as unknown as BlobPart], { type: "application/pdf" }),
    fileName,
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
    mlStatus = mlRes.status

    // Leer body como texto primero para evitar silenciar errores de parseo JSON
    const rawBody = await mlRes.text().catch(() => "")
    try {
      mlResponse = JSON.parse(rawBody)
    } catch {
      mlResponse = { raw: rawBody.substring(0, 1000) }
    }
  } catch (e: any) {
    await supabase.from("ml_invoices_uploads").update({
      status: "error", error_message: `ML request: ${e.message}`, updated_at: new Date().toISOString(),
    }).eq("id", uploadRecord.id)
    return NextResponse.json({ ok: false, error: `Error llamando a ML: ${e.message}` }, { status: 502 })
  }

  const success = mlStatus >= 200 && mlStatus < 300

  // Construir mensaje de error legible desde la respuesta de ML
  const mlErrorMsg = success ? null : (
    typeof mlResponse === "object"
      ? (mlResponse?.message || mlResponse?.error || mlResponse?.cause?.[0]?.description || JSON.stringify(mlResponse))
      : String(mlResponse || `HTTP ${mlStatus}`)
  )

  // ── Actualizar estado en DB ──────────────────────────────────────────────
  await supabase.from("ml_invoices_uploads").update({
    status:        success ? "uploaded" : "error",
    ml_response:   mlResponse,
    error_message: success ? null : (mlErrorMsg || `HTTP ${mlStatus}`),
    updated_at:    new Date().toISOString(),
  }).eq("id", uploadRecord.id)

  if (!success) {
    console.error(`[ml-upload] ML error ${mlStatus} | pack_id=${packId} | pdf=${pdfSizeKb}KB | response:`, mlResponse)
    return NextResponse.json({
      ok:           false,
      error:        mlErrorMsg || `ML respondió con HTTP ${mlStatus}`,
      ml_status:    mlStatus,
      ml_response:  mlResponse,
      pack_id_used: packId,
      pdf_size_kb:  pdfSizeKb,
    }, { status: 502 })
  }

  // ── Enviar mensaje automático al comprador ────────────────────────────────
  // Se envía solo si tenemos el buyer_id (obtenido del fetch de la orden).
  // Fallo de mensaje NO falla el upload — se logea y se continúa.
  if (buyerId && mlAccount.ml_user_id) {
    try {
      const msgRes = await fetch(
        `https://api.mercadolibre.com/messages/action_packs/${packId}/sellers/${mlAccount.ml_user_id}`,
        {
          method:  "POST",
          headers: {
            Authorization:  `Bearer ${mlAccount.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: { user_id: mlAccount.ml_user_id },
            to:   [{ user_id: buyerId }],
            text: "Tu factura está adjunta, ¡Gracias por tu compra! Libroide AR",
          }),
          signal: AbortSignal.timeout(10_000),
        }
      )
      if (!msgRes.ok) {
        const msgBody = await msgRes.text().catch(() => "")
        console.warn(`[ml-upload] Mensaje no enviado (${msgRes.status}):`, msgBody.substring(0, 300))
      }
    } catch (msgErr: any) {
      console.warn("[ml-upload] Error enviando mensaje al comprador:", msgErr.message)
    }
  }

  return NextResponse.json({
    ok:           true,
    upload_id:    uploadRecord.id,
    pack_id_used: packId,
    pdf_size_kb:  pdfSizeKb,
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
