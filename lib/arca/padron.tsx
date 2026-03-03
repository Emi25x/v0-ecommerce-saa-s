"use server"
/**
 * ARCA ws_sr_padron_a4 — Consulta de Padrón Alcance 4
 * Documentación oficial: https://www.afip.gob.ar/ws/ws_sr_padron_a4/manual_ws_sr_padron_a4_v1.3.pdf
 *
 * Servicio WSAA:  ws_sr_padron_a4
 * URL Homo:       https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4
 * URL Prod:       https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4
 * Namespace:      http://a4.soap.ws.server.puc.sr/
 * Método:         getPersona(token, sign, cuitRepresentada, idPersona)
 */

import { createClient }            from "@/lib/supabase/server"
import { buildTRA, signTRA, callWSAA } from "./wsaa"

const PADRON_HOMO = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4"
const PADRON_PROD = "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4"

export type PadronPersona = {
  idPersona:        string
  estadoClave:      string   // ACTIVO | INACTIVO
  tipoPersona:      string   // FISICA | JURIDICA
  nombre?:          string
  apellido?:        string
  razonSocial?:     string
  domicilioFiscal?: string
  codigoPostal?:    string
  provincia?:       string
  localidad?:       string
  actividad?:       string
  impuestos:        { id: number; descripcion: string; estado: string }[]
}

/** Obtiene el ticket WSAA para el padrón, cacheado en arca_config (columnas padron_*) */
async function getPadronTicket(config: {
  id: string
  cuit: string
  ambiente: string
  cert_pem: string
  private_key_pem: string
  padron_token?: string | null
  padron_sign?: string | null
  padron_expires_at?: string | null
}): Promise<{ token: string; sign: string }> {
  // Reutilizar si el ticket sigue vigente (5 min de margen)
  if (config.padron_token && config.padron_sign && config.padron_expires_at) {
    const exp = new Date(config.padron_expires_at).getTime()
    if (exp - Date.now() > 5 * 60 * 1000) {
      return { token: config.padron_token, sign: config.padron_sign }
    }
  }

  // Generar nuevo ticket con service = ws_sr_padron_a4
  const tra = buildTRA("ws_sr_padron_a4")
  const cms = await signTRA(tra, config.cert_pem, config.private_key_pem)

  let token: string, sign: string, expiresAt: Date

  try {
    ;({ token, sign, expiresAt } = await callWSAA(cms, config.ambiente))
  } catch (err: any) {
    // Si el TA sigue vigente en ARCA pero fue borrado de la DB, releer
    if (String(err.message).includes("ya posee un TA") || String(err.message).includes("TA valido")) {
      const supabase = await createClient()
      const { data: fresh } = await supabase
        .from("arca_config")
        .select("padron_token, padron_sign")
        .eq("id", config.id)
        .single()
      if (fresh?.padron_token && fresh?.padron_sign)
        return { token: fresh.padron_token, sign: fresh.padron_sign }
    }
    throw err
  }

  // Cachear en DB
  const supabase = await createClient()
  await supabase
    .from("arca_config")
    .update({
      padron_token:      token,
      padron_sign:       sign,
      padron_expires_at: expiresAt.toISOString(),
    })
    .eq("id", config.id)

  return { token, sign }
}

/** Consulta los datos de un contribuyente por CUIT (11 dígitos) o DNI */
export async function consultarPadron(idPersona: string): Promise<PadronPersona> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data: config, error } = await supabase
    .from("arca_config")
    .select("id, cuit, ambiente, cert_pem, certificado_pem, private_key_pem, clave_pem, padron_token, padron_sign, padron_expires_at")
    .eq("user_id", user.id)
    .single()

  if (error || !config) throw new Error("No hay configuración ARCA. Completá los datos en la pestaña Configuración.")

  const certPem = config.cert_pem || config.certificado_pem
  const keyPem  = config.private_key_pem || config.clave_pem
  if (!certPem || !keyPem) throw new Error("Falta el certificado o la clave privada en la configuración ARCA.")

  const { token, sign } = await getPadronTicket({
    ...config,
    cert_pem:        certPem,
    private_key_pem: keyPem,
  })

  const url         = config.ambiente === "produccion" ? PADRON_PROD : PADRON_HOMO
  const cuitEmisor  = config.cuit.replace(/\D/g, "")
  const idConsulta  = idPersona.replace(/\D/g, "")

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a4="http://a4.soap.ws.server.puc.sr/"><soapenv:Header/><soapenv:Body><a4:getPersona><token>${token}</token><sign>${sign}</sign><cuitRepresentada>${cuitEmisor}</cuitRepresentada><idPersona>${idConsulta}</idPersona></a4:getPersona></soapenv:Body></soapenv:Envelope>`

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "" },
    body:    soapBody,
  })

  const xml = await res.text()

  if (!res.ok) {
    const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1]
    throw new Error(`Padrón HTTP ${res.status}: ${fault || xml.substring(0, 200)}`)
  }

  // Helper para extraer un tag simple
  const get = (tag: string) =>
    xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim()

  // Impuestos
  const impuestos: PadronPersona["impuestos"] = []
  for (const m of xml.matchAll(/<impuesto>([\s\S]*?)<\/impuesto>/g)) {
    const b    = m[1]
    const id   = b.match(/<idImpuesto>(\d+)<\/idImpuesto>/)?.[1]
    const desc = b.match(/<descripcionImpuesto>([\s\S]*?)<\/descripcionImpuesto>/)?.[1]?.trim()
    const est  = b.match(/<estado>([\s\S]*?)<\/estado>/)?.[1]?.trim()
    if (id && desc) impuestos.push({ id: Number(id), descripcion: desc, estado: est || "" })
  }

  // Domicilio fiscal
  const domFiscalBlock = xml.match(/<domicilio>[\s\S]*?FISCAL[\s\S]*?<\/domicilio>/)?.[0] || ""
  const dir   = domFiscalBlock.match(/<direccion>([\s\S]*?)<\/direccion>/)?.[1]?.trim()
  const cp    = domFiscalBlock.match(/<codPostal>(\d+)<\/codPostal>/)?.[1]
  const prov  = domFiscalBlock.match(/<descripcionProvincia>([\s\S]*?)<\/descripcionProvincia>/)?.[1]?.trim()
  const loc   = domFiscalBlock.match(/<localidad>([\s\S]*?)<\/localidad>/)?.[1]?.trim()

  // Actividad principal (orden 1)
  const actBlock = [...xml.matchAll(/<actividad>([\s\S]*?)<\/actividad>/g)]
    .find(m => m[1].includes("<orden>1</orden>"))?.[1] || ""
  const actividad = actBlock.match(/<descripcionActividad>([\s\S]*?)<\/descripcionActividad>/)?.[1]?.trim()

  return {
    idPersona:        get("idPersona") || idPersona,
    estadoClave:      get("estadoClave") || "",
    tipoPersona:      get("tipoPersona") || "",
    nombre:           get("nombre"),
    apellido:         get("apellido"),
    razonSocial:      get("razonSocial"),
    domicilioFiscal:  dir,
    codigoPostal:     cp,
    provincia:        prov,
    localidad:        loc,
    actividad,
    impuestos,
  }
}
