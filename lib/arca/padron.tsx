"use server"
/**
 * ARCA Padrón — ws_sr_constancia_inscripcion
 * Consulta los datos de un contribuyente por CUIT/CUIL/DNI.
 * Requiere autenticación WSAA con el servicio "ws_sr_constancia_inscripcion".
 */

import * as forge from "node-forge"
import { createClient } from "@/lib/supabase/server"

const PADRON_PROD = "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5"
const PADRON_HOMO = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5"

const WSAA_PROD = "https://wsaa.afip.gov.ar/ws/services/LoginCms"
const WSAA_HOMO = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"

// IDs de impuestos que indican condición IVA
const IMP_IVA_MAP: Record<number, string> = {
  30: "responsable_inscripto",
  32: "exento",
  33: "no_alcanzado",
}
const MONOTRIBUTO_IMP = [20, 21, 22, 23, 24, 25, 26, 27, 163]

export type PadronResult = {
  cuit:             string
  denominacion:     string
  tipo_persona:     "FISICA" | "JURIDICA"
  tipo_doc:         number   // 96=DNI, 80=CUIT, 86=CUIL, etc.
  nro_doc:          string
  estado:           string   // "ACTIVO" | "INACTIVO"
  domicilio:        string
  localidad:        string
  provincia:        string
  cod_postal:       string
  condicion_iva:    string   // clave del mapa CONDICION_IVA_RECEPTOR
  es_monotributo:   boolean
  es_empleador:     boolean
  impuestos:        number[]
  actividades:      number[]
}

// ─── WSAA para padrón (token separado del WSFE) ───────────────────────────────

function buildTRA(service: string): string {
  const now  = new Date()
  const from = new Date(now.getTime() - 600_000)
  const to   = new Date(now.getTime() + 43_200_000)
  const fmt  = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${fmt(from)}</generationTime><expirationTime>${fmt(to)}</expirationTime></header><service>${service}</service></loginTicketRequest>`
}

async function signTRA(traXml: string, certPem: string, keyPem: string): Promise<string> {
  const cert       = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)
  const p7         = forge.pkcs7.createSignedData()
  p7.content       = forge.util.createBuffer(traXml, "utf8")
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey, certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType,   value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime,   value: new Date() },
    ],
  })
  p7.sign()
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

async function getPadronToken(config: {
  id: string; cuit: string; ambiente: string
  cert_pem: string; key_pem: string
  padron_token?: string | null; padron_sign?: string | null; padron_expires_at?: string | null
}): Promise<{ token: string; sign: string }> {
  // Reusar token cacheado si sigue vigente (margen 5 min)
  if (config.padron_token && config.padron_sign && config.padron_expires_at) {
    const exp = new Date(config.padron_expires_at)
    if (exp > new Date(Date.now() + 5 * 60_000)) {
      return { token: config.padron_token, sign: config.padron_sign }
    }
  }

  const wsaaUrl = config.ambiente === "produccion" ? WSAA_PROD : WSAA_HOMO
  const tra     = buildTRA("ws_sr_constancia_inscripcion")
  const cms     = await signTRA(tra, config.cert_pem, config.key_pem)

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov.ar"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`

  const res = await fetch(wsaaUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "LoginCms" },
    body: soapBody,
  })
  const xml = await res.text()
  if (!res.ok) {
    const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] || xml.substring(0, 200)
    throw new Error(`WSAA Padrón HTTP ${res.status}: ${fault}`)
  }

  const rawReturn = xml.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/)?.[1]
  if (!rawReturn) throw new Error("WSAA Padrón: respuesta inesperada")

  const inner = rawReturn
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')

  const token   = inner.match(/<token>([\s\S]*?)<\/token>/)?.[1]?.trim()
  const sign    = inner.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]?.trim()
  const expStr  = inner.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)?.[1]?.trim()

  if (!token || !sign) throw new Error("WSAA Padrón: no se encontró token/sign")

  // Cachear en DB (columnas padron_token, padron_sign, padron_expires_at)
  const supabase = await createClient()
  await supabase.from("arca_config").update({
    padron_token:      token,
    padron_sign:       sign,
    padron_expires_at: expStr ? new Date(expStr).toISOString() : new Date(Date.now() + 43_200_000).toISOString(),
    updated_at:        new Date().toISOString(),
  }).eq("id", config.id)

  return { token, sign }
}

// ─── Consulta al padrón ───────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))
  return m ? decodeEntities(m[1].trim()) : ""
}

function tags(xml: string, name: string): string[] {
  const re  = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "g")
  const out: string[] = []
  let m
  while ((m = re.exec(xml)) !== null) out.push(decodeEntities(m[1].trim()))
  return out
}

function inferCondicionIva(impuestos: number[], monotributo: boolean): string {
  if (monotributo) return "monotributo"
  if (impuestos.includes(30)) return "responsable_inscripto"
  if (impuestos.includes(32)) return "exento"
  if (impuestos.includes(33)) return "no_alcanzado"
  return "consumidor_final"
}

export async function consultarPadron(cuitConsulta: string): Promise<PadronResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data: cfg, error: cfgErr } = await supabase
    .from("arca_config")
    .select("id, cuit, ambiente, cert_pem, certificado_pem, private_key_pem, clave_pem, padron_token, padron_sign, padron_expires_at")
    .eq("user_id", user.id)
    .single()

  if (cfgErr || !cfg) throw new Error("No hay configuración ARCA. Completá los datos en Configuración.")

  const certPem = cfg.cert_pem || cfg.certificado_pem
  const keyPem  = cfg.private_key_pem || cfg.clave_pem
  if (!certPem || !keyPem) throw new Error("Faltan certificado o clave privada en la configuración ARCA.")

  const { token, sign } = await getPadronToken({
    id: cfg.id, cuit: cfg.cuit, ambiente: cfg.ambiente,
    cert_pem: certPem, key_pem: keyPem,
    padron_token: cfg.padron_token, padron_sign: cfg.padron_sign, padron_expires_at: cfg.padron_expires_at,
  })

  const url = cfg.ambiente === "produccion" ? PADRON_PROD : PADRON_HOMO

  // Limpiar CUIT — solo dígitos
  const cuitLimpio = cuitConsulta.replace(/\D/g, "")

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.ppad.afip.gov.ar/">
  <soapenv:Header/>
  <soapenv:Body>
    <a5:getPersona>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${cfg.cuit}</cuitRepresentada>
      <idPersona>${cuitLimpio}</idPersona>
    </a5:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "" },
    body: soapBody,
  })

  const xml = await res.text()

  if (!res.ok) {
    const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1]
    if (fault?.includes("no encontrado") || fault?.includes("inexistente")) {
      throw new Error(`CUIT/CUIL ${cuitLimpio} no encontrado en el padrón de ARCA.`)
    }
    throw new Error(`Padrón HTTP ${res.status}: ${fault || xml.substring(0, 200)}`)
  }

  // Parsear la respuesta
  const personaXml = tag(xml, "personaReturn") || xml

  const tipoPersona   = tag(personaXml, "tipoPersona") as "FISICA" | "JURIDICA"
  const estadoClave   = tag(personaXml, "estadoClave")
  const idPersona     = tag(personaXml, "idPersona")
  const tipoDocumento = tag(personaXml, "tipoDocumento")
  const nroDocumento  = tag(personaXml, "numeroDocumento")

  // Denominación: razonSocial para jurídicas, apellido + nombre para físicas
  const razonSocial = tag(personaXml, "razonSocial")
  const apellido    = tag(personaXml, "apellido")
  const nombre      = tag(personaXml, "nombre")
  const denominacion = razonSocial || [apellido, nombre].filter(Boolean).join(", ")

  // Domicilio fiscal
  const domTag   = tag(personaXml, "domicilioFiscal") || tag(personaXml, "domicilio")
  const direccion = tag(domTag || personaXml, "direccion")
  const localidad = tag(domTag || personaXml, "localidad") || tag(domTag || personaXml, "descripcionLocalidad")
  const provincia = tag(domTag || personaXml, "descripcionProvincia") || tag(domTag || personaXml, "idProvincia")
  const codPostal = tag(domTag || personaXml, "codPostal")

  // Impuestos como array de números
  const impuestosRaw = tags(personaXml, "idImpuesto").map(Number).filter(Boolean)
  // Alternativa: buscar dentro de nodos <impuesto>
  const impuestoNodes = tags(personaXml, "impuesto")
  const impuestoIds   = impuestosRaw.length > 0
    ? impuestosRaw
    : impuestoNodes.map(n => Number(tag(n, "idImpuesto"))).filter(Boolean)

  // Actividades
  const actividadIds = tags(personaXml, "idActividad").map(Number).filter(Boolean)

  const esMonotributo = impuestoIds.some(id => MONOTRIBUTO_IMP.includes(id))

  // Tipo doc numérico
  const tipoDocNum: Record<string, number> = {
    DNI: 96, CUIT: 80, CUIL: 86, CDI: 87, LE: 89, LC: 90, CI: 91, PAS: 95,
  }
  const tipoDocId = tipoDocNum[tipoDocumento] ?? 96

  return {
    cuit:           idPersona || cuitLimpio,
    denominacion,
    tipo_persona:   tipoPersona || "FISICA",
    tipo_doc:       tipoDocId,
    nro_doc:        nroDocumento || cuitLimpio,
    estado:         estadoClave || "ACTIVO",
    domicilio:      direccion,
    localidad,
    provincia,
    cod_postal:     codPostal,
    condicion_iva:  inferCondicionIva(impuestoIds, esMonotributo),
    es_monotributo: esMonotributo,
    es_empleador:   tag(personaXml, "empleador") === "S",
    impuestos:      impuestoIds,
    actividades:    actividadIds,
  }
}
