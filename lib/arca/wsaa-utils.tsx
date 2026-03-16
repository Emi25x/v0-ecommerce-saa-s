/**
 * ARCA WSAA — Helpers puros (sin Supabase / cookies)
 * buildTRA, signTRA, callWSAA pueden importarse desde cualquier contexto.
 */

import * as forge from "node-forge"

const WSAA_PROD = "https://wsaa.afip.gov.ar/ws/services/LoginCms"
const WSAA_HOMO = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"

/** Genera el XML TRA (Ticket de Requerimiento de Acceso) */
export function buildTRA(service = "wsfe"): string {
  const now  = new Date()
  const from = new Date(now.getTime() - 600_000)
  const to   = new Date(now.getTime() + 43_200_000)
  const fmt  = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")
  const uniqueId = Math.floor(now.getTime() / 1000)

  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${uniqueId}</uniqueId><generationTime>${fmt(from)}</generationTime><expirationTime>${fmt(to)}</expirationTime></header><service>${service}</service></loginTicketRequest>`
}

/** Firma el TRA con node-forge (PKCS#7 SignedData, SHA-256) */
export async function signTRA(traXml: string, certPem: string, keyPem: string): Promise<string> {
  const cert       = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

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
      { type: forge.pki.oids.signingTime,   value: new Date().toISOString() as any },
    ],
  })
  p7.sign()

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

/** Llama al WSAA y obtiene { token, sign, expiresAt } */
export async function callWSAA(cms: string, ambiente: string): Promise<{ token: string; sign: string; expiresAt: Date }> {
  const url = ambiente === "produccion" ? WSAA_PROD : WSAA_HOMO

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov.ar"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction":   "LoginCms",
    },
    body: soapBody,
  })

  const xml = await res.text()

  if (!res.ok) {
    const faultString = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] || xml.substring(0, 300)
    throw new Error(`WSAA HTTP ${res.status}: ${faultString}`)
  }

  const rawReturn = xml.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/)?.[1]
  if (!rawReturn) {
    throw new Error(`WSAA: respuesta inesperada:\n${xml.substring(0, 500)}`)
  }

  const inner = rawReturn
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&amp;/g,  "&")
    .replace(/&quot;/g, '"')

  const token  = inner.match(/<token>([\s\S]*?)<\/token>/)?.[1]?.trim()
  const sign   = inner.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]?.trim()
  const expStr = inner.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)?.[1]?.trim()

  if (!token || !sign) {
    throw new Error(`WSAA: no se encontró token/sign:\n${inner.substring(0, 400)}`)
  }

  const expiresAt = expStr ? new Date(expStr) : new Date(Date.now() + 43_200_000)
  return { token, sign, expiresAt }
}
