/**
 * ARCA WSAA — Autenticación y Autorización
 * Genera el Ticket de Requerimiento de Acceso (TRA), lo firma con la clave privada
 * y lo envía al WSAA para obtener Token + Sign válidos por 12hs.
 */

import * as forge from "node-forge"
import { createClient } from "@/lib/supabase/server"

const WSAA_PROD = "https://wsaa.afip.gov.ar/ws/services/LoginCms"
const WSAA_HOMO = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"

type ArcaConfig = {
  id: string
  user_id: string
  cuit: string
  ambiente: string
  cert_pem: string | null
  private_key_pem: string | null
  clave_pem: string | null
  certificado_pem: string | null
  wsaa_token: string | null
  wsaa_sign: string | null
  wsaa_expires_at: string | null
}

/** Genera el XML TRA (Ticket de Requerimiento de Acceso) */
export function buildTRA(service = "wsfe"): string {
  const now  = new Date()
  // generationTime: 10 minutos ANTES para tolerar desfase de reloj
  const from = new Date(now.getTime() - 600_000)
  // expirationTime: 12 horas después
  const to   = new Date(now.getTime() + 43_200_000)

  // ARCA acepta ISO8601 en UTC (Z) — NO hacer conversión a -03:00 porque
  // el servidor corre en UTC y agregar -03:00 a un timestamp UTC genera una
  // fecha 3 horas en el futuro desde la perspectiva de ARCA.
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")

  const uniqueId = Math.floor(now.getTime() / 1000)

  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${uniqueId}</uniqueId><generationTime>${fmt(from)}</generationTime><expirationTime>${fmt(to)}</expirationTime></header><service>${service}</service></loginTicketRequest>`
}

/**
 * Firma el TRA usando node-forge para generar un PKCS#7 SignedData correcto.
 * node-forge produce DER compatible con el WSAA de ARCA sin depender de openssl binario.
 */
export async function signTRA(traXml: string, certPem: string, keyPem: string): Promise<string> {
  const cert       = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

  // Crear el objeto PKCS#7 SignedData
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(traXml, "utf8")

  p7.addCertificate(cert)
  p7.addSigner({
    key:         privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType,   value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime,   value: new Date() },
    ],
  })

  p7.sign()

  // Serializar a DER → base64
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

/** Llama al WSAA y obtiene { token, sign, expiresAt } */
export async function callWSAA(cms: string, ambiente: string): Promise<{ token: string; sign: string; expiresAt: Date }> {
  const url = ambiente === "produccion" ? WSAA_PROD : WSAA_HOMO

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov.ar"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "LoginCms",
    },
    body: soapBody,
  })

  const xml = await res.text()

  if (!res.ok) {
    const faultString = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] || xml.substring(0, 300)
    throw new Error(`WSAA HTTP ${res.status}: ${faultString}`)
  }

  // El WSAA devuelve el ticket XML dentro de <loginCmsReturn> como HTML-encoded.
  // Hay que extraer ese contenido y decodificar las entidades antes de parsear.
  const rawReturn = xml.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/)?.[1]
  if (!rawReturn) {
    throw new Error(`WSAA: respuesta inesperada:\n${xml.substring(0, 500)}`)
  }

  const inner = rawReturn
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&amp;/g,  "&")
    .replace(/&quot;/g, '"')
    .replace(/&#xE1;/g, "á").replace(/&#xE9;/g, "é")
    .replace(/&#xED;/g, "í").replace(/&#xF3;/g, "ó")
    .replace(/&#xFA;/g, "ú")

  const token  = inner.match(/<token>([\s\S]*?)<\/token>/)?.[1]?.trim()
  const sign   = inner.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]?.trim()
  const expStr = inner.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)?.[1]?.trim()

  if (!token || !sign) {
    throw new Error(`WSAA: no se encontró token/sign en la respuesta decodificada:\n${inner.substring(0, 400)}`)
  }

  const expiresAt = expStr ? new Date(expStr) : new Date(Date.now() + 43_200_000)
  return { token, sign, expiresAt }
}

/**
 * Obtiene un ticket WSAA válido para la config dada.
 * Si el token cacheado en la DB sigue vigente (con 5min de margen), lo devuelve directamente.
 */
export async function getWSAATicket(config: ArcaConfig): Promise<{ token: string; sign: string }> {
  // Usar token cacheado si no expiró
  if (config.wsaa_token && config.wsaa_sign && config.wsaa_expires_at) {
    const expires = new Date(config.wsaa_expires_at)
    if (expires > new Date(Date.now() + 5 * 60_000)) {
      return { token: config.wsaa_token, sign: config.wsaa_sign }
    }
  }

  const certPem = config.cert_pem || config.certificado_pem
  const keyPem  = config.private_key_pem || config.clave_pem

  if (!certPem || !keyPem) {
    throw new Error("Faltan certificado o clave privada en la configuración ARCA. Completá los datos en Configuración.")
  }

  const tra = buildTRA("wsfe")
  const cms = await signTRA(tra, certPem, keyPem)

  let token: string
  let sign: string
  let expiresAt: Date

  try {
    ;({ token, sign, expiresAt } = await callWSAA(cms, config.ambiente))
  } catch (err: any) {
    const msg: string = err.message || ""

    // "El CEE ya posee un TA valido para el acceso al WSN solicitado"
    // Significa que el token anterior sigue vivo en ARCA. Si lo tenemos en DB lo reutilizamos.
    if (msg.includes("ya posee un TA") || msg.includes("TA valido")) {
      // Releer la DB por si el token fue borrado en esta sesión pero sigue vigente en ARCA
      const supabase = await createClient()
      const { data: fresh } = await supabase
        .from("arca_config")
        .select("wsaa_token, wsaa_sign, wsaa_expires_at")
        .eq("id", config.id)
        .single()

      if (fresh?.wsaa_token && fresh?.wsaa_sign) {
        return { token: fresh.wsaa_token, sign: fresh.wsaa_sign }
      }

      // No tenemos el token en DB — esperar 60s y reintentar (el TA anterior puede expirar)
      await new Promise(r => setTimeout(r, 2000))
      ;({ token, sign, expiresAt } = await callWSAA(cms, config.ambiente))
    } else {
      throw err
    }
  }

  // Cachear en DB
  const supabase = await createClient()
  await supabase
    .from("arca_config")
    .update({ wsaa_token: token!, wsaa_sign: sign!, wsaa_expires_at: expiresAt!.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", config.id)

  return { token: token!, sign: sign! }
}
