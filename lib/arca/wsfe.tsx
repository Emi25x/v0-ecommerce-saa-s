/**
 * lib/arca/wsfe.ts
 * WebService de Facturación Electrónica WSFE v1 — ARCA/AFIP
 *
 * Soporta:
 *   - FECompUltimoAutorizado → último número de comprobante autorizado
 *   - FECAESolicitar         → solicita el CAE para una o más facturas
 *
 * Tipos de comprobante:
 *   1 = Factura A  |  6 = Factura B  |  11 = Factura C
 *   3 = Nota Débito A | 8 = Nota Débito B | 13 = Nota Débito C
 *   2 = Nota Crédito A | 7 = Nota Crédito B | 12 = Nota Crédito C
 *
 * Alícuotas IVA: 3=0% | 4=10.5% | 5=21% | 6=27%
 */

import type { ArcaConfig } from "./wsaa"

const WSFE_HOMO = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx"
const WSFE_PROD = "https://servicios1.afip.gov.ar/wsfev1/service.asmx"

export type FacturaItem = {
  descripcion:  string
  cantidad:     number
  precio_unit:  number
  alicuota_iva: 0 | 10.5 | 21 | 27
}

export type SolicitudFactura = {
  tipo_comprobante:      number
  punto_venta:           number
  fecha_emision:         string          // YYYYMMDD
  receptor_tipo_doc:     number          // 80=CUIT 86=CUIL 96=DNI 99=sin doc
  receptor_nro_doc:      string
  condicion_iva_receptor: number         // 1=RI 4=Exento 5=CF
  items:                 FacturaItem[]
  moneda:                string          // PES
}

export type ResultadoCAE = {
  numero:    number
  cae:       string
  cae_vto:   string   // YYYYMMDD
  subtotal:  number
  iva_105:   number
  iva_21:    number
  iva_27:    number
  total:     number
}

function wsfeUrl(config: ArcaConfig) {
  return config.modo === "produccion" ? WSFE_PROD : WSFE_HOMO
}

function soapEnvelope(action: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`
}

async function callWSFE(
  config: ArcaConfig,
  token: string,
  sign: string,
  action: string,
  bodyInner: string
): Promise<string> {
  const body = `<ar:${action}>
    <ar:Auth>
      <ar:Token>${token}</ar:Token>
      <ar:Sign>${sign}</ar:Sign>
      <ar:Cuit>${config.cuit.replace(/-/g, "")}</ar:Cuit>
    </ar:Auth>
    ${bodyInner}
  </ar:${action}>`

  const res = await fetch(wsfeUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"http://ar.gov.afip.dif.FEV1/${action}"`,
    },
    body: soapEnvelope(action, body),
  })

  if (!res.ok) throw new Error(`WSFE HTTP ${res.status}`)
  return res.text()
}

/** Obtiene el último número de comprobante autorizado para un tipo y punto de venta */
export async function getUltimoComprobante(
  config: ArcaConfig,
  token: string,
  sign: string,
  tipoComprobante: number,
  puntoVenta: number
): Promise<number> {
  const xml = await callWSFE(config, token, sign, "FECompUltimoAutorizado",
    `<ar:PtoVta>${puntoVenta}</ar:PtoVta>
     <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>`
  )

  const match = xml.match(/<CbteNro>(\d+)<\/CbteNro>/)
  if (!match) throw new Error("No se pudo obtener el último comprobante")
  return parseInt(match[1], 10)
}

/** Calcula IVA por alícuota y arma los arrays para el XML */
function calcularIVA(items: FacturaItem[]) {
  let subtotal = 0
  const ivaMap: Record<number, { id: number; base: number; importe: number }> = {
    0:    { id: 3, base: 0, importe: 0 },
    10.5: { id: 4, base: 0, importe: 0 },
    21:   { id: 5, base: 0, importe: 0 },
    27:   { id: 6, base: 0, importe: 0 },
  }

  for (const item of items) {
    const base = Math.round(item.cantidad * item.precio_unit * 100) / 100
    const iva  = Math.round(base * (item.alicuota_iva / 100) * 100) / 100
    subtotal += base
    const bucket = ivaMap[item.alicuota_iva]
    if (bucket) { bucket.base += base; bucket.importe += iva }
  }

  const ivaItems = Object.values(ivaMap).filter(v => v.base > 0)
  const totalIVA = ivaItems.reduce((s, v) => s + v.importe, 0)
  const total    = Math.round((subtotal + totalIVA) * 100) / 100

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    iva_105:  Math.round((ivaMap[10.5]?.importe ?? 0) * 100) / 100,
    iva_21:   Math.round((ivaMap[21]?.importe  ?? 0) * 100) / 100,
    iva_27:   Math.round((ivaMap[27]?.importe  ?? 0) * 100) / 100,
    total,
    ivaItems,
  }
}

/** Solicita CAE para una factura individual */
export async function solicitarCAE(
  config: ArcaConfig,
  token: string,
  sign: string,
  solicitud: SolicitudFactura,
  numero: number
): Promise<ResultadoCAE> {
  const { subtotal, iva_105, iva_21, iva_27, total, ivaItems } = calcularIVA(solicitud.items)

  const ivaXml = ivaItems.map(v => `
    <ar:AlicIva>
      <ar:Id>${v.id}</ar:Id>
      <ar:BaseImp>${v.base.toFixed(2)}</ar:BaseImp>
      <ar:Importe>${v.importe.toFixed(2)}</ar:Importe>
    </ar:AlicIva>`).join("")

  const bodyInner = `
  <ar:FeCAEReq>
    <ar:FeCabReq>
      <ar:CantReg>1</ar:CantReg>
      <ar:PtoVta>${solicitud.punto_venta}</ar:PtoVta>
      <ar:CbteTipo>${solicitud.tipo_comprobante}</ar:CbteTipo>
    </ar:FeCabReq>
    <ar:FeDetReq>
      <ar:FECAEDetRequest>
        <ar:Concepto>1</ar:Concepto>
        <ar:DocTipo>${solicitud.receptor_tipo_doc}</ar:DocTipo>
        <ar:DocNro>${solicitud.receptor_nro_doc || 0}</ar:DocNro>
        <ar:CbteDesde>${numero}</ar:CbteDesde>
        <ar:CbteHasta>${numero}</ar:CbteHasta>
        <ar:CbteFch>${solicitud.fecha_emision}</ar:CbteFch>
        <ar:ImpTotal>${total.toFixed(2)}</ar:ImpTotal>
        <ar:ImpTotConc>0.00</ar:ImpTotConc>
        <ar:ImpNeto>${subtotal.toFixed(2)}</ar:ImpNeto>
        <ar:ImpOpEx>0.00</ar:ImpOpEx>
        <ar:ImpIVA>${(iva_105 + iva_21 + iva_27).toFixed(2)}</ar:ImpIVA>
        <ar:ImpTrib>0.00</ar:ImpTrib>
        <ar:MonId>${solicitud.moneda}</ar:MonId>
        <ar:MonCotiz>1</ar:MonCotiz>
        <ar:Iva>${ivaXml}</ar:Iva>
      </ar:FECAEDetRequest>
    </ar:FeDetReq>
  </ar:FeCAEReq>`

  const xml = await callWSFE(config, token, sign, "FECAESolicitar", bodyInner)

  const caeMatch  = xml.match(/<CAE>([\s\S]*?)<\/CAE>/)
  const vtoMatch  = xml.match(/<CAEFchVto>([\s\S]*?)<\/CAEFchVto>/)
  const errMatch  = xml.match(/<Msg>([\s\S]*?)<\/Msg>/)

  if (!caeMatch) {
    const errMsg = errMatch?.[1]?.trim() ?? "Error desconocido del WSFE"
    throw new Error(`ARCA rechazó la factura: ${errMsg}`)
  }

  return {
    numero,
    cae:      caeMatch[1].trim(),
    cae_vto:  vtoMatch?.[1]?.trim() ?? "",
    subtotal, iva_105, iva_21, iva_27, total,
  }
}
