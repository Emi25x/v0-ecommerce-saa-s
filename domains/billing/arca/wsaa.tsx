/**
 * ARCA WSAA — getWSAATicket (usa Supabase para cachear el token)
 * Los helpers puros (buildTRA, signTRA, callWSAA) están en wsaa-utils.ts
 * para evitar que Next.js propague la restricción "async server module"
 * a funciones sincrónicas.
 */

import { createClient } from "@/lib/db/server"
import { buildTRA, signTRA, callWSAA } from "@/domains/billing/arca/wsaa-utils"

// Re-exportar para que los importadores existentes no rompan
export { buildTRA, signTRA, callWSAA } from "@/domains/billing/arca/wsaa-utils"

type ArcaConfig = {
  id: string
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

/**
 * Obtiene un ticket WSAA válido para la config dada.
 * Si el token cacheado en la DB sigue vigente (con 5min de margen), lo devuelve directamente.
 */
export async function getWSAATicket(config: ArcaConfig): Promise<{ token: string; sign: string }> {
  if (config.wsaa_token && config.wsaa_sign && config.wsaa_expires_at) {
    const expires = new Date(config.wsaa_expires_at)
    if (expires > new Date(Date.now() + 5 * 60_000)) {
      return { token: config.wsaa_token, sign: config.wsaa_sign }
    }
  }

  const certPem = config.cert_pem || config.certificado_pem
  const keyPem = config.private_key_pem || config.clave_pem

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

    if (msg.includes("ya posee un TA") || msg.includes("TA valido")) {
      const supabase = await createClient()
      const { data: fresh } = await supabase
        .from("arca_config")
        .select("wsaa_token, wsaa_sign, wsaa_expires_at")
        .eq("id", config.id)
        .single()

      if (fresh?.wsaa_token && fresh?.wsaa_sign) {
        return { token: fresh.wsaa_token, sign: fresh.wsaa_sign }
      }

      await new Promise((r) => setTimeout(r, 2000))
      ;({ token, sign, expiresAt } = await callWSAA(cms, config.ambiente))
    } else {
      throw err
    }
  }

  const supabase = await createClient()
  await supabase
    .from("arca_config")
    .update({
      wsaa_token: token!,
      wsaa_sign: sign!,
      wsaa_expires_at: expiresAt!.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.id)

  return { token: token!, sign: sign! }
}
