/**
 * ARCA WSAA — Autenticación y Autorización
 * Genera el Ticket de Requerimiento de Acceso (TRA), lo firma con la clave privada
 * y lo envía al WSAA para obtener Token + Sign válidos por 12hs.
 */

import { createClient } from "@/lib/supabase/server"

const WSAA_PROD = "https://wsaa.afip.gov.ar/ws/services/LoginCms"
const WSAA_HOMO = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"

type ArcaConfig = {
  id: string
  user_id: string
  cuit: string
  ambiente: string
  cert_pem: string | null
  clave_pem: string | null
  certificado_pem: string | null
  wsaa_token: string | null
  wsaa_sign: string | null
  wsaa_expires_at: string | null
}

/** Genera el XML TRA (Ticket de Requerimiento de Acceso) */
function buildTRA(service = "wsfe"): string {
  const now = new Date()
  const from = new Date(now.getTime() - 60_000)
  const to   = new Date(now.getTime() + 43_200_000) // +12hs

  const fmt = (d: Date) =>
    d.toISOString().replace(/\.\d{3}Z$/, "-03:00")

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>
    <generationTime>${fmt(from)}</generationTime>
    <expirationTime>${fmt(to)}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`
}

/**
 * Firma el TRA con la clave privada generando un CMS/PKCS#7 SignedData
 * usando exclusivamente node:crypto — sin dependencias de binarios externos.
 *
 * ARCA requiere un CMS SignedData en DER, codificado en base64.
 * Estructura mínima que acepta el WSAA:
 *   ContentType: signedData (1.2.840.113549.1.7.2)
 *   DigestAlgorithm: sha256 (2.16.840.1.101.3.4.2.1)
 *   SignatureAlgorithm: rsaEncryption (1.2.840.113549.1.1.1)
 *   EncapsulatedContentInfo: el TRA XML como eContent
 *   SignerInfo con el certificado completo embebido
 */
async function signTRA(traXml: string, certPem: string, keyPem: string): Promise<string> {
  const crypto = await import("node:crypto")

  // ── 1. Parsear clave y certificado ──────────────────────────────────────
  const privateKey = crypto.createPrivateKey(keyPem)
  const certDer = Buffer.from(
    certPem.replace(/-----BEGIN CERTIFICATE-----/, "")
           .replace(/-----END CERTIFICATE-----/, "")
           .replace(/\s+/g, ""),
    "base64"
  )

  // ── 2. Firmar el TRA con SHA256+RSA ─────────────────────────────────────
  const content = Buffer.from(traXml, "utf8")
  const sign = crypto.createSign("SHA256")
  sign.update(content)
  const signature = sign.sign(privateKey)

  // ── 3. Extraer issuer y serialNumber del certificado (DER) ──────────────
  // Necesario para el SignerInfo. Parseamos el ASN.1 manualmente (estructura fija).
  function readLength(buf: Buffer, offset: number): { len: number; nextOffset: number } {
    if (buf[offset] < 0x80) return { len: buf[offset], nextOffset: offset + 1 }
    const numBytes = buf[offset] & 0x7f
    let len = 0
    for (let i = 0; i < numBytes; i++) len = (len << 8) | buf[offset + 1 + i]
    return { len, nextOffset: offset + 1 + numBytes }
  }

  // Extraer TBSCertificate del certificado DER
  // Certificate ::= SEQUENCE { tbsCertificate TBSCertificate, ... }
  let off = 2 // skip outer SEQUENCE tag+len (simplified)
  const outerLen = readLength(certDer, 1)
  off = outerLen.nextOffset
  // TBSCertificate SEQUENCE
  const tbsTag = certDer[off] // should be 0x30
  const tbsLen = readLength(certDer, off + 1)
  const tbsStart = off
  const tbsEnd   = tbsLen.nextOffset + tbsLen.len
  const tbsCert  = certDer.slice(tbsStart, tbsEnd)

  // Dentro de TBSCertificate:
  // version [0] EXPLICIT, serialNumber, signature AlgId, issuer, validity, subject, ...
  let cursor = tbsLen.nextOffset
  // Saltar version si existe [0]
  if (certDer[cursor] === 0xa0) {
    const vLen = readLength(certDer, cursor + 1)
    cursor = vLen.nextOffset + vLen.len
  }
  // serialNumber INTEGER
  const snTag = certDer[cursor] // 0x02
  const snLen = readLength(certDer, cursor + 1)
  const serialNumber = certDer.slice(snLen.nextOffset, snLen.nextOffset + snLen.len)
  cursor = snLen.nextOffset + snLen.len
  // signature AlgorithmIdentifier SEQUENCE
  const algLen = readLength(certDer, cursor + 1)
  cursor = algLen.nextOffset + algLen.len
  // issuer Name SEQUENCE
  const issuerStart = cursor
  const issuerLenInfo = readLength(certDer, cursor + 1)
  const issuerEnd = issuerLenInfo.nextOffset + issuerLenInfo.len
  const issuerDer = certDer.slice(issuerStart, issuerEnd)

  // ── 4. Construir CMS SignedData en DER (ASN.1 BER/DER manual) ──────────

  function encodeLen(len: number): Buffer {
    if (len < 0x80) return Buffer.from([len])
    if (len < 0x100) return Buffer.from([0x81, len])
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff])
  }

  function seq(content: Buffer): Buffer {
    return Buffer.concat([Buffer.from([0x30]), encodeLen(content.length), content])
  }

  function set(content: Buffer): Buffer {
    return Buffer.concat([Buffer.from([0x31]), encodeLen(content.length), content])
  }

  function oid(bytes: number[]): Buffer {
    return Buffer.concat([Buffer.from([0x06, bytes.length, ...bytes])])
  }

  function integer(bytes: Buffer): Buffer {
    // Agregar 0x00 si el bit más significativo está en 1 (para evitar número negativo)
    const val = bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), bytes]) : bytes
    return Buffer.concat([Buffer.from([0x02]), encodeLen(val.length), val])
  }

  function octetString(bytes: Buffer): Buffer {
    return Buffer.concat([Buffer.from([0x04]), encodeLen(bytes.length), bytes])
  }

  function contextTag(tag: number, content: Buffer, constructed = true): Buffer {
    const t = constructed ? (0xa0 | tag) : (0x80 | tag)
    return Buffer.concat([Buffer.from([t]), encodeLen(content.length), content])
  }

  function bitString(bytes: Buffer): Buffer {
    const withPad = Buffer.concat([Buffer.from([0x00]), bytes])
    return Buffer.concat([Buffer.from([0x03]), encodeLen(withPad.length), withPad])
  }

  // OIDs relevantes
  const OID_SIGNED_DATA        = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]
  const OID_DATA               = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01]
  const OID_SHA256             = [0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]
  const OID_RSA_ENCRYPTION     = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]
  const OID_RSA_WITH_SHA256    = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]

  // digestAlgorithms SET
  const digestAlgId = seq(Buffer.concat([oid(OID_SHA256), Buffer.from([0x05, 0x00])]))
  const digestAlgorithms = set(digestAlgId)

  // encapContentInfo: eContentType = data, eContent = TRA XML
  const eContent = contextTag(0, octetString(content))
  const encapContentInfo = seq(Buffer.concat([oid(OID_DATA), eContent]))

  // certificate (el cert completo embebido en [0])
  const certificatesField = contextTag(0, certDer)

  // signerInfo
  const version        = integer(Buffer.from([0x01]))
  const issuerAndSerial = seq(Buffer.concat([issuerDer, integer(serialNumber)]))
  const digestAlgRef   = seq(Buffer.concat([oid(OID_SHA256), Buffer.from([0x05, 0x00])]))
  const sigAlg         = seq(Buffer.concat([oid(OID_RSA_WITH_SHA256), Buffer.from([0x05, 0x00])]))
  const signatureValue = octetString(signature)

  const signerInfo = seq(Buffer.concat([
    version,
    issuerAndSerial,
    digestAlgRef,
    sigAlg,
    signatureValue,
  ]))

  const signerInfos = set(signerInfo)

  // SignedData
  const sdVersion = integer(Buffer.from([0x01]))
  const signedData = seq(Buffer.concat([
    sdVersion,
    digestAlgorithms,
    encapContentInfo,
    certificatesField,
    signerInfos,
  ]))

  // ContentInfo wrapper
  const contentInfo = seq(Buffer.concat([
    oid(OID_SIGNED_DATA),
    contextTag(0, signedData),
  ]))

  return contentInfo.toString("base64")
}

/** Llama al WSAA y obtiene { token, sign, expiresAt } */
async function callWSAA(cmsCms: string, ambiente: string): Promise<{ token: string; sign: string; expiresAt: Date }> {
  const url = ambiente === "produccion" ? WSAA_PROD : WSAA_HOMO

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov.ar">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsCms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "",
    },
    body,
  })

  if (!res.ok) throw new Error(`WSAA HTTP ${res.status}`)

  const xml = await res.text()

  const token = xml.match(/<token>([\s\S]*?)<\/token>/)?.[1]
  const sign  = xml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]
  const expStr = xml.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)?.[1]

  if (!token || !sign) throw new Error(`WSAA: no token/sign en respuesta:\n${xml.substring(0, 500)}`)

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
  const keyPem  = config.clave_pem

  if (!certPem || !keyPem) {
    throw new Error("Faltan certificado o clave privada en la configuración ARCA. Completá los datos en Configuración.")
  }

  const tra = buildTRA("wsfe")
  const cms = await signTRA(tra, certPem, keyPem)
  const { token, sign, expiresAt } = await callWSAA(cms, config.ambiente)

  // Cachear en DB
  const supabase = await createClient()
  await supabase
    .from("arca_config")
    .update({ wsaa_token: token, wsaa_sign: sign, wsaa_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() })
    .eq("id", config.id)

  return { token, sign }
}
