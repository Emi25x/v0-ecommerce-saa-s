/**
 * ARCA WSFE v1 — Facturación Electrónica
 * Soporta FECAESolicitar (solicitar CAE) y FECompUltimoAutorizado (último número).
 */

const WSFE_PROD = "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
const WSFE_HOMO = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx"

export type FacturaItem = {
  descripcion: string
  cantidad: number
  precio_unitario: number
  alicuota_iva: 0 | 10.5 | 21 | 27  // 0=exento, 10.5, 21, 27
  subtotal: number
  iva: number
}

export type SolicitarCAEParams = {
  cuit: string
  punto_venta: number
  tipo_comprobante: number          // 1=FA, 6=FB, 11=FC, 51=FM
  concepto: 1 | 2 | 3              // 1=Productos, 2=Servicios, 3=Ambos
  tipo_doc_receptor: number         // 96=DNI, 80=CUIT, 99=Sin doc
  nro_doc_receptor: string
  fecha: string                     // YYYYMMDD
  items: FacturaItem[]
  moneda?: string
  cotizacion?: number
  token: string
  sign: string
  ambiente: string
}

export type CAEResponse = {
  cae: string
  cae_vto: string   // YYYYMMDD
  numero: number
}

function wsfeUrl(ambiente: string) {
  return ambiente === "produccion" ? WSFE_PROD : WSFE_HOMO
}

async function soapCall(url: string, action: string, bodyContent: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>${bodyContent}</soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `http://ar.gov.afip.dif.FEV1/${action}`,
    },
    body: envelope,
  })

  if (!res.ok) throw new Error(`WSFE HTTP ${res.status}: ${await res.text()}`)
  return res.text()
}

/** Obtiene el último número de comprobante autorizado para un punto de venta y tipo */
export async function getLastInvoiceNumber(params: {
  cuit: string
  punto_venta: number
  tipo_comprobante: number
  token: string
  sign: string
  ambiente: string
}): Promise<number> {
  const url = wsfeUrl(params.ambiente)
  const body = `
  <ar:FECompUltimoAutorizado>
    <ar:Auth>
      <ar:Token>${params.token}</ar:Token>
      <ar:Sign>${params.sign}</ar:Sign>
      <ar:Cuit>${params.cuit}</ar:Cuit>
    </ar:Auth>
    <ar:PtoVta>${params.punto_venta}</ar:PtoVta>
    <ar:CbteTipo>${params.tipo_comprobante}</ar:CbteTipo>
  </ar:FECompUltimoAutorizado>`

  const xml = await soapCall(url, "FECompUltimoAutorizado", body)
  const nroStr = xml.match(/<CbteNro>(\d+)<\/CbteNro>/)?.[1]
  if (!nroStr) throw new Error(`WSFE: no se pudo obtener último número:\n${xml.substring(0, 400)}`)
  return parseInt(nroStr, 10)
}

/** Solicita el CAE para una factura */
export async function requestCAE(params: SolicitarCAEParams): Promise<CAEResponse> {
  const url = wsfeUrl(params.ambiente)

  // Calcular importes agrupados por alícuota
  const ivaMap = new Map<number, { base: number; importe: number; id: number }>()
  // IDs de alícuota ARCA: 3=0%, 4=10.5%, 5=21%, 6=27%
  const alicuotaId: Record<number, number> = { 0: 3, 10.5: 4, 21: 5, 27: 6 }

  let importeNeto = 0
  let importeExento = 0
  let importeIvaTotal = 0

  for (const item of params.items) {
    if (item.alicuota_iva === 0) {
      importeExento += item.subtotal
    } else {
      importeNeto += item.subtotal
      importeIvaTotal += item.iva
      const id = alicuotaId[item.alicuota_iva]
      const prev = ivaMap.get(id) || { base: 0, importe: 0, id }
      ivaMap.set(id, {
        id,
        base:    parseFloat((prev.base + item.subtotal).toFixed(2)),
        importe: parseFloat((prev.importe + item.iva).toFixed(2)),
      })
    }
  }

  const importeTotal = parseFloat((importeNeto + importeExento + importeIvaTotal).toFixed(2))

  const ivaXml = Array.from(ivaMap.values()).map(a => `
          <ar:AlicIva>
            <ar:Id>${a.id}</ar:Id>
            <ar:BaseImp>${a.base.toFixed(2)}</ar:BaseImp>
            <ar:Importe>${a.importe.toFixed(2)}</ar:Importe>
          </ar:AlicIva>`).join("")

  // Obtener próximo número
  const lastNum = await getLastInvoiceNumber({
    cuit: params.cuit,
    punto_venta: params.punto_venta,
    tipo_comprobante: params.tipo_comprobante,
    token: params.token,
    sign: params.sign,
    ambiente: params.ambiente,
  })
  const nextNum = lastNum + 1

  const body = `
  <ar:FECAESolicitar>
    <ar:Auth>
      <ar:Token>${params.token}</ar:Token>
      <ar:Sign>${params.sign}</ar:Sign>
      <ar:Cuit>${params.cuit}</ar:Cuit>
    </ar:Auth>
    <ar:FeCAEReq>
      <ar:FeCabReq>
        <ar:CantReg>1</ar:CantReg>
        <ar:PtoVta>${params.punto_venta}</ar:PtoVta>
        <ar:CbteTipo>${params.tipo_comprobante}</ar:CbteTipo>
      </ar:FeCabReq>
      <ar:FeDetReq>
        <ar:FECAEDetRequest>
          <ar:Concepto>${params.concepto}</ar:Concepto>
          <ar:DocTipo>${params.tipo_doc_receptor}</ar:DocTipo>
          <ar:DocNro>${params.nro_doc_receptor}</ar:DocNro>
          <ar:CbteDesde>${nextNum}</ar:CbteDesde>
          <ar:CbteHasta>${nextNum}</ar:CbteHasta>
          <ar:CbteFch>${params.fecha}</ar:CbteFch>
          <ar:ImpTotal>${importeTotal.toFixed(2)}</ar:ImpTotal>
          <ar:ImpTotConc>0.00</ar:ImpTotConc>
          <ar:ImpNeto>${importeNeto.toFixed(2)}</ar:ImpNeto>
          <ar:ImpOpEx>${importeExento.toFixed(2)}</ar:ImpOpEx>
          <ar:ImpIVA>${importeIvaTotal.toFixed(2)}</ar:ImpIVA>
          <ar:ImpTrib>0.00</ar:ImpTrib>
          <ar:MonId>${params.moneda || "PES"}</ar:MonId>
          <ar:MonCotiz>${params.cotizacion ?? 1}</ar:MonCotiz>
          <ar:Iva>${ivaXml}</ar:Iva>
        </ar:FECAEDetRequest>
      </ar:FeDetReq>
    </ar:FeCAEReq>
  </ar:FECAESolicitar>`

  const xml = await soapCall(url, "FECAESolicitar", body)

  // Verificar errores ARCA
  const errMatch = xml.match(/<ErrMsg>([\s\S]*?)<\/ErrMsg>/)
  const obsMatch = xml.match(/<Obs>([\s\S]*?)<\/Obs>/)
  const result   = xml.match(/<Resultado>([A-Z]+)<\/Resultado>/)?.[1]

  if (result === "R") {
    const errMsg = errMatch?.[1] || obsMatch?.[1] || "ARCA rechazó la factura"
    throw new Error(`ARCA rechazo: ${errMsg}`)
  }

  const cae    = xml.match(/<CAE>(\d+)<\/CAE>/)?.[1]
  const caeVto = xml.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/)?.[1]

  if (!cae || !caeVto) {
    throw new Error(`WSFE: no se obtuvo CAE en la respuesta:\n${xml.substring(0, 600)}`)
  }

  return { cae, cae_vto: caeVto, numero: nextNum }
}
