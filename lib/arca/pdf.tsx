/**
 * lib/arca/pdf.ts
 * Generación del PDF de factura electrónica según requisitos de ARCA/AFIP.
 *
 * Incluye:
 *  - Datos del emisor y receptor
 *  - Detalle de ítems con IVA desglosado
 *  - CAE y vencimiento
 *  - QR oficial de AFIP (https://www.afip.gob.ar/fe/qr/?p=BASE64_JSON)
 *
 * Usa únicamente APIs nativas del browser/Node (canvas via string SVG + fetch)
 * para no depender de librerías pesadas. El PDF se genera como Uint8Array.
 */

export type FacturaPDFData = {
  // Emisor
  cuit_emisor:     string
  razon_social:    string
  domicilio_fiscal?: string
  condicion_iva_emisor: string
  punto_venta:     number
  tipo_comprobante: number
  numero:          number

  // Receptor
  receptor_nombre: string
  receptor_nro_doc?: string
  receptor_tipo_doc?: number
  receptor_domicilio?: string
  receptor_condicion_iva: string

  // Comprobante
  fecha_emision:   string    // DD/MM/YYYY
  cae:             string
  cae_vto:         string    // DD/MM/YYYY
  moneda:          string

  // Importes
  subtotal:  number
  iva_105:   number
  iva_21:    number
  iva_27:    number
  total:     number

  // Ítems
  items: Array<{
    descripcion:  string
    cantidad:     number
    precio_unit:  number
    alicuota_iva: number
    subtotal:     number
  }>
}

const TIPO_LABELS: Record<number, string> = {
  1: "FACTURA A", 6: "FACTURA B", 11: "FACTURA C",
  2: "NOTA DE CRÉDITO A", 7: "NOTA DE CRÉDITO B", 12: "NOTA DE CRÉDITO C",
  3: "NOTA DE DÉBITO A",  8: "NOTA DE DÉBITO B",  13: "NOTA DE DÉBITO C",
}

const LETRA_COMPROBANTE: Record<number, string> = {
  1: "A", 6: "B", 11: "C", 2: "A", 7: "B", 12: "C", 3: "A", 8: "B", 13: "C",
}

export function buildQRUrl(data: FacturaPDFData): string {
  // Estructura JSON requerida por AFIP para el QR
  const qrPayload = {
    ver:    1,
    fecha:  data.fecha_emision,
    cuit:   data.cuit_emisor.replace(/-/g, ""),
    ptoVta: data.punto_venta,
    tipoCmp: data.tipo_comprobante,
    nroCmp: data.numero,
    importe: data.total,
    moneda:  data.moneda,
    ctz:     1,
    tipoDocRec: data.receptor_tipo_doc ?? 96,
    nroDocRec:  data.receptor_nro_doc ?? "0",
    tipoCodAut: "E",
    codAut:  data.cae,
  }

  const base64 = Buffer.from(JSON.stringify(qrPayload)).toString("base64")
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`
}

/** Formatea número de comprobante: 0005-00001234 */
function formatNro(ptoVenta: number, numero: number): string {
  return `${String(ptoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`
}

/** Genera el HTML del PDF para impresión / conversión */
export function buildFacturaHTML(data: FacturaPDFData): string {
  const tipoLabel = TIPO_LABELS[data.tipo_comprobante] ?? `COMPROBANTE ${data.tipo_comprobante}`
  const letra     = LETRA_COMPROBANTE[data.tipo_comprobante] ?? "C"
  const qrUrl     = buildQRUrl(data)
  const nroFmt    = formatNro(data.punto_venta, data.numero)

  const itemsRows = data.items.map(item => `
    <tr>
      <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;">${item.descripcion}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.cantidad}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right;">$${item.precio_unit.toFixed(2)}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.alicuota_iva}%</td>
      <td style="padding:6px 4px;border-bottom:1px solid #e5e7eb;text-align:right;">$${item.subtotal.toFixed(2)}</td>
    </tr>`).join("")

  const ivaRows = [
    data.iva_105 > 0 ? `<tr><td>IVA 10.5%</td><td style="text-align:right">$${data.iva_105.toFixed(2)}</td></tr>` : "",
    data.iva_21  > 0 ? `<tr><td>IVA 21%</td><td style="text-align:right">$${data.iva_21.toFixed(2)}</td></tr>` : "",
    data.iva_27  > 0 ? `<tr><td>IVA 27%</td><td style="text-align:right">$${data.iva_27.toFixed(2)}</td></tr>` : "",
  ].join("")

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${tipoLabel} ${nroFmt}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:20px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border:2px solid #111;margin-bottom:12px}
    .header-left,.header-right{padding:12px;flex:1}
    .header-center{width:80px;text-align:center;border-left:2px solid #111;border-right:2px solid #111;padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .letra{font-size:48px;font-weight:bold;line-height:1}
    .tipo-label{font-size:10px;margin-top:4px}
    .nro-comp{font-size:10px;margin-top:6px}
    h1{font-size:14px;font-weight:bold;margin-bottom:4px}
    .section{margin-bottom:10px}
    .section-title{font-weight:bold;border-bottom:1px solid #111;margin-bottom:4px;padding-bottom:2px}
    table.items{width:100%;border-collapse:collapse;margin-bottom:10px}
    table.items th{background:#f3f4f6;padding:6px 4px;border-bottom:2px solid #111;text-align:left}
    table.items th:not(:first-child){text-align:right}
    .totales{display:flex;justify-content:flex-end}
    .totales table{min-width:220px}
    .totales td{padding:4px 6px}
    .total-final{font-weight:bold;font-size:13px;border-top:2px solid #111}
    .cae-section{margin-top:12px;border:1px solid #111;padding:10px;display:flex;justify-content:space-between;align-items:center}
    .cae-data p{margin-bottom:3px}
    .qr-container{display:flex;flex-direction:column;align-items:center;gap:4px}
    .qr-container img{width:80px;height:80px}
    .qr-label{font-size:9px;color:#6b7280}
    .footer{margin-top:8px;font-size:9px;color:#6b7280;text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${data.razon_social}</h1>
      ${data.domicilio_fiscal ? `<p>Domicilio: ${data.domicilio_fiscal}</p>` : ""}
      <p>CUIT: ${data.cuit_emisor}</p>
      <p>Cond. IVA: ${data.condicion_iva_emisor}</p>
    </div>
    <div class="header-center">
      <div class="letra">${letra}</div>
      <div class="tipo-label">COD. ${data.tipo_comprobante}</div>
    </div>
    <div class="header-right" style="text-align:right">
      <h1>${tipoLabel}</h1>
      <p>N° ${nroFmt}</p>
      <p>Fecha: ${data.fecha_emision}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Receptor</div>
    <p><strong>${data.receptor_nombre}</strong></p>
    ${data.receptor_nro_doc ? `<p>Doc: ${data.receptor_nro_doc}</p>` : ""}
    ${data.receptor_domicilio ? `<p>Domicilio: ${data.receptor_domicilio}</p>` : ""}
    <p>Cond. IVA: ${data.receptor_condicion_iva}</p>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Descripción</th>
        <th style="text-align:right">Cant.</th>
        <th style="text-align:right">Precio Unit.</th>
        <th style="text-align:right">IVA</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <div class="totales">
    <table>
      <tr><td>Subtotal neto</td><td style="text-align:right">$${data.subtotal.toFixed(2)}</td></tr>
      ${ivaRows}
      <tr class="total-final"><td><strong>TOTAL</strong></td><td style="text-align:right"><strong>$${data.total.toFixed(2)}</strong></td></tr>
    </table>
  </div>

  <div class="cae-section">
    <div class="cae-data">
      <p><strong>CAE:</strong> ${data.cae}</p>
      <p><strong>Vto. CAE:</strong> ${data.cae_vto}</p>
      <p style="font-size:9px;color:#6b7280;margin-top:6px">Comprobante fiscal electrónico emitido según RG AFIP</p>
    </div>
    <div class="qr-container">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrUrl)}" alt="QR AFIP"/>
      <span class="qr-label">Verificar en AFIP</span>
    </div>
  </div>

  <div class="footer">
    Este documento es válido como comprobante fiscal electrónico — ${data.cuit_emisor}
  </div>
</body>
</html>`
}
