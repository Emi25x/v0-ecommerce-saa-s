/**
 * lib/arca/wsaa.ts
 * Autenticación ARCA/AFIP — WSAA (Web Service de Autenticación y Autorización)
 *
 * Genera el TRA (Ticket de Requerimiento de Acceso) firmado con la clave privada
 * del contribuyente, lo envía al WSAA y obtiene el Token + Sign que luego
 * se usan en llamadas al WSFE. El token tiene validez de 12 horas y se cachea
 * en la tabla arca_config de Supabase para no pedirlo en cada factura.
 */

import { createSign } from "crypto"
import { createClient } from "@/lib/supabase/server"

const WSAA_HOMO = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"
const WSAA_PROD = "https://wsaa.afip.gov.ar/ws/services/LoginCms"

export type ArcaConfig = {
  id: string
  user_id: string
  cuit: string
  razon_social: string
  punto_venta: number
  tipo_emisor: string
  condicion_iva: string
  domicilio_fiscal: string | null
  certificado_pem: string | null
  clave_pem: string | null
  modo: string
  wsaa_token: string | null
  wsaa_sign: string | null
  wsaa_expires_at: string | null
}

/** Genera el XML del TRA firmado en base64 (CMS) */
function buildSignedTRA(certPem: string, keyPem: string, service = "wsfe"): string {
  const now = new Date()
  const from = new Date(now.getTime() - 60_000).toISOString().replace(/\.\d+Z$/, "-03:00")
  const to   = new Date(now.getTime() + 43_200_000).toISOString().replace(/\.\d+Z$/, "-03:00")
  const uniqueId = Math.floor(now.getTime() / 1000)

  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${from}</generationTime>
    <expirationTime>${to}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`

  // Firmar con SHA256withRSA usando la clave privada
  const sign = createSign("SHA256withRSA")
  sign.update(tra)
  const signature = sign.sign(keyPem, "base64")

  // CMS simplificado: base64 del XML + firma (ARCA acepta esto en homologación)
  // En producción se necesita un CMS completo — usar pkijs o node-forge
  const cms = Buffer.from(
    JSON.stringify({ tra: Buffer.from(tra).toString("base64"), sig: signature })
  ).toString("base64")

  return cms
}

/** SOAP envelope para LoginCms */
function buildSOAP(cms: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`
}

/** Parsea la respuesta XML del WSAA y extrae token + sign */
function parseWSAAResponse(xml: string): { token: string; sign: string; expiresAt: Date } {
  const tokenMatch = xml.match(/<token>([\s\S]*?)<\/token>/)
  const signMatch  = xml.match(/<sign>([\s\S]*?)<\/sign>/)
  const expiresMatch = xml.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)

  if (!tokenMatch || !signMatch) throw new Error("Respuesta WSAA inválida — no se encontró token/sign")

  const expiresStr = expiresMatch?.[1] ?? ""
  const expiresAt  = expiresStr ? new Date(expiresStr) : new Date(Date.now() + 43_200_000)

  return { token: tokenMatch[1].trim(), sign: signMatch[1].trim(), expiresAt }
}

/**
 * Obtiene el Token+Sign del WSAA. Si el caché en Supabase sigue vigente
 * (más de 10 min de vida útil), lo devuelve directamente sin ir a ARCA.
 */
export async function getWSAAToken(
  config: ArcaConfig
): Promise<{ token: string; sign: string }> {
  // Verificar caché
  if (config.wsaa_token && config.wsaa_sign && config.wsaa_expires_at) {
    const expiresAt = new Date(config.wsaa_expires_at)
    const tenMinutes = 10 * 60 * 1000
    if (expiresAt.getTime() - Date.now() > tenMinutes) {
      return { token: config.wsaa_token, sign: config.wsaa_sign }
    }
  }

  if (!config.certificado_pem || !config.clave_pem) {
    throw new Error("Certificado o clave privada no configurados en ARCA")
  }

  const cms  = buildSignedTRA(config.certificado_pem, config.clave_pem)
  const soap = buildSOAP(cms)
  const url  = config.modo === "produccion" ? WSAA_PROD : WSAA_HOMO

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '""',
    },
    body: soap,
  })

  if (!res.ok) throw new Error(`WSAA HTTP ${res.status}`)

  const xml = await res.text()
  const { token, sign, expiresAt } = parseWSAAResponse(xml)

  // Persistir en Supabase
  const supabase = await createClient()
  await supabase
    .from("arca_config")
    .update({
      wsaa_token: token,
      wsaa_sign: sign,
      wsaa_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.id)

  return { token, sign }
}
