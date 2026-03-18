/**
 * lib/arca/padron.ts
 * Consulta al padrón de contribuyentes ARCA usando ws_sr_padron_a4
 *
 * Servicio correcto según documentación oficial AFIP:
 *   - Nombre en WSAA:  ws_sr_padron_a4
 *   - WSDL homo:       https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4?WSDL
 *   - WSDL prod:       https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4?WSDL
 *   - Método principal: getPersona(token, sign, cuitRepresentada, idPersona)
 *
 * Alcance A4: datos del contribuyente: razón social, domicilio fiscal,
 * actividades, impuestos (IVA, Ganancias, Monotributo, etc.), categorías.
 */

import { createClient } from "@/lib/supabase/server"
import { buildTRA, signTRA, callWSAA } from "./wsaa"

const PADRON_HOMO = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4"
const PADRON_PROD = "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4"

// ── Token cache del padrón (independiente del WSFE) ──────────────────────────

async function getPadronTicket(config: any): Promise<{ token: string; sign: string }> {
  // Verificar caché en DB
  if (config.padron_token && config.padron_sign && config.padron_expires_at) {
    const exp = new Date(config.padron_expires_at)
    if (exp > new Date(Date.now() + 5 * 60 * 1000)) {
      return { token: config.padron_token, sign: config.padron_sign }
    }
  }

  const certPem = config.cert_pem || config.certificado_pem
  const keyPem  = config.clave_pem || config.private_key_pem

  if (!certPem || !keyPem) throw new Error("Certificado o clave privada no configurados")

  // El TRA para el padrón usa "ws_sr_padron_a4" como service
  const tra = buildTRA("ws_sr_padron_a4")
  const cms = await signTRA(tra, certPem, keyPem)

  let token: string, sign: string, expiresAt: Date

  try {
    ;({ token, sign, expiresAt } = await callWSAA(cms, config.ambiente))
  } catch (err: any) {
    const msg: string = err.message || ""
    if (msg.includes("ya posee un TA") || msg.includes("TA valido")) {
      // El ticket sigue vivo en ARCA — releer DB
      const supabase = await createClient()
      const { data: fresh } = await supabase
        .from("arca_config")
        .select("padron_token, padron_sign")
        .eq("id", config.id)
        .single()
      if (fresh?.padron_token && fresh?.padron_sign) {
        return { token: fresh.padron_token, sign: fresh.padron_sign }
      }
    }
    throw err
  }

  // Cachear
  const supabase = await createClient()
  await supabase.from("arca_config").update({
    padron_token:      token,
    padron_sign:       sign,
    padron_expires_at: expiresAt.toISOString(),
    updated_at:        new Date().toISOString(),
  }).eq("id", config.id)

  return { token, sign }
}

// ── SOAP call al padrón ───────────────────────────────────────────────────────

async function callPadron(url: string, token: string, sign: string, cuitRepresentada: string, idPersona: string) {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:per="http://a4.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <per:getPersona>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${cuitRepresentada}</cuitRepresentada>
      <idPersona>${idPersona}</idPersona>
    </per:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction":   "",
    },
    body: soapBody,
  })

  const xml = await res.text()

  if (!res.ok) {
    const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] || xml.substring(0, 300)
    throw new Error(`Padrón SOAP error: ${fault}`)
  }

  return xml
}

// ── Parser de la respuesta ────────────────────────────────────────────────────

function parsePersona(xml: string) {
  const get   = (tag: string) => xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? null
  const getAll= (tag: string) => [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g"))].map(m => m[1].trim())

  // Datos básicos
  const idPersona  = get("idPersona")
  const tipoPersona= get("tipoPersona")           // "F" = física, "J" = jurídica
  const razonSocial= get("razonSocial")
  const nombre     = get("nombre")
  const apellido   = get("apellido")

  // Domicilio fiscal
  const domFiscal  = xml.match(/<domicilioFiscal>([\s\S]*?)<\/domicilioFiscal>/)?.[1] ?? ""
  const direccion  = domFiscal.match(/<direccion>([\s\S]*?)<\/direccion>/)?.[1]?.trim() ?? null
  const localidad  = domFiscal.match(/<localidad>([\s\S]*?)<\/localidad>/)?.[1]?.trim() ?? null
  const provincia  = domFiscal.match(/<descripcionProvincia>([\s\S]*?)<\/descripcionProvincia>/)?.[1]?.trim() ?? null
  const cp         = domFiscal.match(/<codPostal>([\s\S]*?)<\/codPostal>/)?.[1]?.trim() ?? null

  // Impuestos activos — para inferir condición IVA
  const impuestoNodes = [...xml.matchAll(/<impuesto>([\s\S]*?)<\/impuesto>/g)].map(m => m[1])
  const impuestos = impuestoNodes.map(n => ({
    id:          parseInt(n.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? "0"),
    descripcion: n.match(/<descripcion>([\s\S]*?)<\/descripcion>/)?.[1]?.trim() ?? "",
    estado:      n.match(/<estado>([\s\S]*?)<\/estado>/)?.[1]?.trim() ?? "",
    periodo:     n.match(/<periodo>([\s\S]*?)<\/periodo>/)?.[1]?.trim() ?? "",
  }))

  // Actividades
  const actividadNodes = [...xml.matchAll(/<actividad>([\s\S]*?)<\/actividad>/g)].map(m => m[1])
  const actividades = actividadNodes.map(n => ({
    id:          n.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "",
    descripcion: n.match(/<descripcion>([\s\S]*?)<\/descripcion>/)?.[1]?.trim() ?? "",
    orden:       n.match(/<orden>([\s\S]*?)<\/orden>/)?.[1]?.trim() ?? "",
    desde:       n.match(/<periodo>([\s\S]*?)<\/periodo>/)?.[1]?.trim() ?? "",
    principal:   n.match(/<orden>([\s\S]*?)<\/orden>/)?.[1]?.trim() === "1",
  }))

  // Inferir condición IVA a partir de impuestos activos
  // id 30 = IVA (Responsable Inscripto)
  // id 32 = IVA Exento
  // id 20 = Monotributo (Cat. A-K)
  // id 21 = Monotributo Social
  const activos = impuestos.filter(i => i.estado === "ACTIVO").map(i => i.id)
  let condicionIva = "consumidor_final"
  if (activos.includes(30))       condicionIva = "responsable_inscripto"
  else if (activos.includes(32))  condicionIva = "exento"
  else if (activos.includes(20) || activos.includes(21)) condicionIva = "monotributo"

  return {
    idPersona,
    tipoPersona,
    razonSocial,
    nombre,
    apellido,
    displayName: razonSocial || [apellido, nombre].filter(Boolean).join(", "),
    domicilioFiscal: {
      direccion,
      localidad,
      provincia,
      codigoPostal: cp,
      completo: [direccion, localidad, provincia, cp ? `(${cp})` : ""].filter(Boolean).join(", "),
    },
    condicionIva,
    impuestos,
    actividades,
  }
}

// ── Función principal exportada ───────────────────────────────────────────────

export async function consultarPersona(idPersona: string): Promise<{
  ok: boolean
  persona?: ReturnType<typeof parsePersona>
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "No autenticado" }

    const { data: config, error: cfgErr } = await supabase
      .from("arca_config")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (cfgErr || !config) return { ok: false, error: "Configuración ARCA no encontrada" }

    const { token, sign } = await getPadronTicket(config)
    const url = (config.ambiente === "produccion") ? PADRON_PROD : PADRON_HOMO
    const xml = await callPadron(url, token, sign, config.cuit, idPersona.replace(/\D/g, ""))

    // Verificar error de ARCA en la respuesta
    const errorCode = xml.match(/<codigoError>([\s\S]*?)<\/codigoError>/)?.[1]
    const errorMsg  = xml.match(/<descripcionError>([\s\S]*?)<\/descripcionError>/)?.[1]
    if (errorCode && errorCode !== "0") {
      return { ok: false, error: errorMsg || `Error código ${errorCode}` }
    }

    const persona = parsePersona(xml)
    return { ok: true, persona }
  } catch (err: any) {
    return { ok: false, error: err.message || "Error desconocido consultando padrón" }
  }
}
