/**
 * Generador de PDF de Factura Electrónica Argentina
 * Cumple con los requisitos de ARCA: QR oficial, CAE, datos del emisor/receptor.
 * Usa jsPDF (sin dependencias nativas) para correr en el edge/browser.
 */

export type FacturaPDFData = {
  // Emisor
  razon_social:     string
  cuit:             string
  domicilio_fiscal: string
  condicion_iva:    string
  punto_venta:      number
  // Branding / config visual
  logo_url?:        string
  telefono?:        string
  email?:           string
  web?:             string
  instagram?:       string
  facebook?:        string
  whatsapp?:        string
  nota_factura?:    string
  datos_pago?:      string
  factura_opciones?: {
    mostrar_logo?:           boolean
    mostrar_domicilio?:      boolean
    mostrar_datos_contacto?: boolean
    mostrar_redes?:          boolean
    mostrar_datos_pago?:     boolean
    mostrar_nota?:           boolean
  }
  // Comprobante
  tipo_comprobante: number
  numero:           number
  fecha_emision:    string   // YYYY-MM-DD
  cae:              string
  cae_vto:          string   // YYYYMMDD
  // Receptor
  receptor_nombre:  string
  receptor_tipo_doc: number
  receptor_nro_doc: string
  receptor_condicion_iva: string
  receptor_domicilio?: string
  // Items y totales
  items: Array<{
    descripcion:     string
    cantidad:        number
    precio_unitario: number
    alicuota_iva:    number
    subtotal:        number
    iva:             number
  }>
  subtotal:  number
  iva_105:   number
  iva_21:    number
  iva_27:    number
  total:     number
  moneda:    string
}

const TIPO_COMPROBANTE_LABEL: Record<number, { letra: string; nombre: string }> = {
  1:  { letra: "A", nombre: "Factura A" },
  6:  { letra: "B", nombre: "Factura B" },
  11: { letra: "C", nombre: "Factura C" },
  51: { letra: "M", nombre: "Factura M" },
  3:  { letra: "A", nombre: "Nota de Crédito A" },
  8:  { letra: "B", nombre: "Nota de Crédito B" },
  13: { letra: "C", nombre: "Nota de Crédito C" },
}

const TIPO_DOC_LABEL: Record<number, string> = {
  80: "CUIT",
  86: "CUIL",
  96: "DNI",
  99: "Sin documento",
}

const CONDICION_IVA_LABEL: Record<string, string> = {
  responsable_inscripto: "Responsable Inscripto",
  monotributo:           "Monotributista",
  exento:                "IVA Exento",
  consumidor_final:      "Consumidor Final",
  no_responsable:        "No Responsable",
}

/** Formatea fecha YYYYMMDD → DD/MM/YYYY */
function fmtFecha(s: string): string {
  if (s.length === 8) return `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
  if (s.includes("-")) {
    const [y, m, d] = s.split("-")
    return `${d}/${m}/${y}`
  }
  return s
}

/** Genera el QR data que requiere ARCA */
function buildQRData(data: FacturaPDFData): string {
  const qrObj = {
    ver:    1,
    fecha:  data.fecha_emision,
    cuit:   parseInt(data.cuit.replace(/-/g, "")),
    ptoVta: data.punto_venta,
    tipoCmp: data.tipo_comprobante,
    nroCmp: data.numero,
    importe: data.total,
    moneda: data.moneda || "PES",
    ctz:    1,
    tipoDocRec: data.receptor_tipo_doc,
    nroDocRec: parseInt(data.receptor_nro_doc) || 0,
    tipoCodAut: "E",
    codAut: data.cae,
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(qrObj))}`
}

/**
 * Genera el HTML de la factura — se puede imprimir como PDF desde el browser
 * o convertir server-side con una lib como puppeteer.
 */
export function buildFacturaHTML(data: FacturaPDFData): string {
  const comp    = TIPO_COMPROBANTE_LABEL[data.tipo_comprobante] || { letra: "?", nombre: "Comprobante" }
  const qrUrl   = buildQRData(data)
  const cuitFmt = data.cuit.replace(/(\d{2})(\d{8})(\d{1})/, "$1-$2-$3")
  const nroFmt  = `${String(data.punto_venta).padStart(4, "0")}-${String(data.numero).padStart(8, "0")}`
  const opts    = data.factura_opciones || {}

  // Defaults: todo visible si no hay config
  const showLogo     = opts.mostrar_logo           !== false
  const showDir      = opts.mostrar_domicilio       !== false
  const showContacto = opts.mostrar_datos_contacto  !== false
  const showRedes    = opts.mostrar_redes            !== false
  const showPago     = opts.mostrar_datos_pago       !== false
  const showNota     = opts.mostrar_nota             !== false

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoHtml = (showLogo && data.logo_url)
    ? `<img src="${data.logo_url}" alt="Logo" style="max-height:64px;max-width:160px;object-fit:contain;display:block">`
    : ""

  // ── Contacto ──────────────────────────────────────────────────────────────
  const contactoItems: string[] = []
  if (showContacto) {
    if (data.telefono) contactoItems.push(`<span>Tel: ${data.telefono}</span>`)
    if (data.whatsapp) contactoItems.push(`<span>WhatsApp: ${data.whatsapp}</span>`)
    if (data.email)    contactoItems.push(`<span>${data.email}</span>`)
    if (data.web)      contactoItems.push(`<span>${data.web}</span>`)
  }

  // ── Redes ─────────────────────────────────────────────────────────────────
  const redesItems: string[] = []
  if (showRedes) {
    if (data.instagram) redesItems.push(`<span>Instagram: @${data.instagram}</span>`)
    if (data.facebook)  redesItems.push(`<span>Facebook: @${data.facebook}</span>`)
  }

  const extraContactoHtml = [...contactoItems, ...redesItems].length > 0
    ? `<div style="margin-top:6px;font-size:10px;color:#555;display:flex;flex-wrap:wrap;gap:8px">${[...contactoItems, ...redesItems].join("")}</div>`
    : ""

  // ── Datos de pago ─────────────────────────────────────────────────────────
  const datosPagoHtml = (showPago && data.datos_pago)
    ? `<div style="border:1px solid #c8e6c9;border-radius:4px;background:#f1f8e9;padding:10px 12px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#388e3c;margin-bottom:5px">Datos para realizar el pago</div>
        <div style="font-size:11px;white-space:pre-line;color:#1a1a1a">${data.datos_pago}</div>
       </div>`
    : ""

  // ── Nota al pie ───────────────────────────────────────────────────────────
  const notaHtml = (showNota && data.nota_factura)
    ? `<div style="border-top:1px dashed #ccc;margin-top:12px;padding-top:8px;font-size:10px;color:#666;text-align:center">${data.nota_factura}</div>`
    : ""

  // ── Items ─────────────────────────────────────────────────────────────────
  const itemsHTML = data.items.map(item => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${item.descripcion}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${item.cantidad}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">$${item.precio_unitario.toFixed(2)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${item.alicuota_iva}%</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">$${item.subtotal.toFixed(2)}</td>
    </tr>`).join("")

  const ivaRows = [
    data.iva_105 > 0 ? `<tr><td>IVA 10.5%</td><td style="text-align:right">$${data.iva_105.toFixed(2)}</td></tr>` : "",
    data.iva_21  > 0 ? `<tr><td>IVA 21%</td><td style="text-align:right">$${data.iva_21.toFixed(2)}</td></tr>`  : "",
    data.iva_27  > 0 ? `<tr><td>IVA 27%</td><td style="text-align:right">$${data.iva_27.toFixed(2)}</td></tr>`  : "",
  ].filter(Boolean).join("")

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${comp.nombre} ${nroFmt}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 12mm; margin: 0 auto; display: flex; flex-direction: column; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 12px; gap: 12px; }
    .emisor { flex: 1; }
    .emisor h1 { font-size: 16px; font-weight: 700; }
    .emisor p  { font-size: 11px; color: #444; margin-top: 2px; }
    .letra-box { width: 64px; height: 64px; border: 3px solid #1a1a1a; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 900; flex-shrink: 0; }
    .comp-info { text-align: right; min-width: 160px; }
    .comp-info h2 { font-size: 14px; font-weight: 700; }
    .comp-info p  { font-size: 11px; color: #444; margin-top: 2px; }
    .section { border: 1px solid #ccc; border-radius: 4px; padding: 10px 12px; margin-bottom: 10px; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 6px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .field { margin-bottom: 4px; }
    .field label { font-size: 10px; color: #666; display: block; }
    .field span  { font-size: 12px; font-weight: 600; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    table.items th { background: #f0f0f0; padding: 6px 8px; text-align: left; font-size: 11px; border-bottom: 2px solid #ccc; }
    table.items th:nth-child(n+2) { text-align: center; }
    table.items th:last-child { text-align: right; }
    .totals-row { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .totals { width: 240px; }
    .totals table { width: 100%; font-size: 12px; }
    .totals td { padding: 3px 6px; }
    .totals td:last-child { text-align: right; }
    .total-final { font-weight: 700; font-size: 14px; border-top: 2px solid #1a1a1a; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px solid #1a1a1a; padding-top: 12px; margin-top: auto; }
    .cae-info p { font-size: 11px; margin-bottom: 3px; }
    .qr-wrap { display: flex; flex-direction: column; align-items: center; }
    .qr-wrap img { width: 80px; height: 80px; }
    .qr-label { font-size: 9px; color: #666; margin-top: 3px; text-align: center; }
    @media print { .page { padding: 8mm; } }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER: logo + datos emisor | letra | datos comprobante -->
  <div class="header">
    <div class="emisor">
      ${logoHtml}
      <h1 style="${logoHtml ? "margin-top:8px" : ""}">${data.razon_social}</h1>
      <p>CUIT: ${cuitFmt}</p>
      ${showDir && data.domicilio_fiscal ? `<p>${data.domicilio_fiscal}</p>` : ""}
      <p>IVA: ${CONDICION_IVA_LABEL[data.condicion_iva] || data.condicion_iva}</p>
      ${extraContactoHtml}
    </div>
    <div class="letra-box">${comp.letra}</div>
    <div class="comp-info">
      <h2>${comp.nombre}</h2>
      <p>N° ${nroFmt}</p>
      <p>Fecha: ${fmtFecha(data.fecha_emision)}</p>
    </div>
  </div>

  <!-- RECEPTOR -->
  <div class="section two-col">
    <div>
      <div class="section-title">Datos del receptor</div>
      <div class="field"><label>Razón Social / Nombre</label><span>${data.receptor_nombre || "Consumidor Final"}</span></div>
      ${(data.receptor_tipo_doc !== 99 && data.receptor_nro_doc && data.receptor_nro_doc !== "0")
        ? `<div class="field"><label>${TIPO_DOC_LABEL[data.receptor_tipo_doc] || "Documento"}</label><span>${data.receptor_nro_doc}</span></div>`
        : ""
      }
      ${data.receptor_domicilio ? `<div class="field"><label>Domicilio</label><span>${data.receptor_domicilio}</span></div>` : ""}
    </div>
    <div>
      <div class="field" style="margin-top:16px">
        <label>Condición frente al IVA</label>
        <span>${CONDICION_IVA_LABEL[data.receptor_condicion_iva] || data.receptor_condicion_iva}</span>
      </div>
    </div>
  </div>

  <!-- ITEMS -->
  <table class="items">
    <thead>
      <tr>
        <th>Descripción</th>
        <th style="text-align:center">Cant.</th>
        <th style="text-align:right">Precio Unit.</th>
        <th style="text-align:center">IVA %</th>
        <th style="text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>

  <!-- TOTALES -->
  <div class="totals-row">
    <div class="totals">
      <table>
        <tr><td>Subtotal neto</td><td>$${data.subtotal.toFixed(2)}</td></tr>
        ${ivaRows}
        <tr class="total-final"><td>TOTAL</td><td>$${data.total.toFixed(2)}</td></tr>
      </table>
    </div>
  </div>

  <!-- DATOS DE PAGO -->
  ${datosPagoHtml}

  <!-- FOOTER: CAE + QR -->
  <div class="footer">
    <div class="cae-info">
      <p><strong>CAE:</strong> ${data.cae}</p>
      <p><strong>Vencimiento CAE:</strong> ${fmtFecha(data.cae_vto)}</p>
      <p style="font-size:10px;color:#888;margin-top:4px">Comprobante emitido via ARCA — WSFE v1</p>
    </div>
    <div class="qr-wrap">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrUrl)}" alt="QR ARCA" />
      <span class="qr-label">QR ARCA</span>
    </div>
  </div>

  <!-- NOTA AL PIE -->
  ${notaHtml}

</div>
</body>
</html>`
}
