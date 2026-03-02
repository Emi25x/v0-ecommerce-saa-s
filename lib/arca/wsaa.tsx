"use server"
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
 * Firma el TRA usando node-forge para generar un PKCS#7 SignedData correcto.
 * node-forge produce DER compatible con el WSAA de ARCA sin depender de openssl binario.
 */
async function signTRA(traXml: string, certPem: string, keyPem: string): Promise<string> {
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
