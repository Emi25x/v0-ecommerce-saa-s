/**
 * getMLOrderBilling — lógica central de enriquecimiento fiscal ML.
 *
 * Flujo:
 *   1. Cache check en ml_order_billing_cache (TTL 24h)
 *   2. GET /orders/{id}                             → buyer base + billing_info.id
 *   3. GET /orders/billing-info/MLA/{bi_id}         → datos fiscales primarios (endpoint A)
 *      GET /orders/{id}/billing_info (x-version: 2) → V2: buyer.billing_info.identification
 *      GET /orders/{id}/billing_info (V1 legacy)    → billing_info.doc_type / doc_number
 *   4. Upsert cache
 *
 * Versiones del endpoint B (GET /orders/{id}/billing_info):
 *   V1: { billing_info: { doc_type, doc_number, additional_info[] } }
 *   V2: { site_id, buyer: { cust_id, billing_info: { name, last_name,
 *           identification: { type, number }, taxes: { taxpayer_type: { id, description } },
 *           address: { street_name, street_number, city_name, state: { name }, zip_code } } } }
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/db/admin"

export interface MLOrderBillingResult {
  ok:                   boolean
  nombre:               string | null
  doc_tipo:             string | null
  doc_numero:           string | null
  condicion_iva:        string | null
  direccion:            string | null
  billing_info_missing: boolean
  error?:               string
  _from_cache?:         boolean
}

export async function getMLOrderBilling(
  supabase: SupabaseClient,
  account_id: string,
  order_id: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<MLOrderBillingResult> {
  // ── 1. Cache check ───────────────────────────────────────────────────────
  const adminClient = createAdminClient()
  const { data: cached } = await adminClient
    .from("ml_order_billing_cache")
    .select("*")
    .eq("account_id", account_id)
    .eq("order_id", order_id)
    .maybeSingle()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime()
    const needsRevalidation =
      (!!cached.nombre && !cached.doc_numero) ||
      (!!cached.billing_info_missing && ageMs > 2 * 60 * 60 * 1000)
    if (!forceRefresh && ageMs < 24 * 60 * 60 * 1000 && !needsRevalidation) {
      return {
        ok:                   true,
        nombre:               cached.nombre,
        doc_tipo:             cached.doc_tipo,
        doc_numero:           cached.doc_numero,
        condicion_iva:        cached.condicion_iva,
        direccion:            cached.direccion,
        billing_info_missing: cached.billing_info_missing,
        _from_cache:          true,
      }
    }
  }

  // ── 2. Obtener access_token ──────────────────────────────────────────────
  const { data: mlAccount } = await adminClient
    .from("ml_accounts")
    .select("access_token")
    .eq("id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return { ok: false, nombre: null, doc_tipo: null, doc_numero: null,
             condicion_iva: null, direccion: null, billing_info_missing: true,
             error: "Cuenta ML no encontrada" }
  }

  const auth = `Bearer ${mlAccount.access_token}`

  async function mlFetch(url: string, extraHeaders: Record<string, string> = {}, retries = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: auth, ...extraHeaders },
          signal:  AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as any).message || `ML HTTP ${res.status}`)
        }
        return await res.json()
      } catch (e) {
        if (attempt === retries) throw e
        await new Promise(r => setTimeout(r, 600))
      }
    }
  }

  // ── 3. GET /orders/{id} — buyer base + billing_info.id ──────────────────
  let orderData: any
  try {
    orderData = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}`)
  } catch (e: any) {
    return { ok: false, nombre: null, doc_tipo: null, doc_numero: null,
             condicion_iva: null, direccion: null, billing_info_missing: true,
             error: `Error obteniendo orden: ${e.message}` }
  }

  const buyer         = orderData?.buyer || {}
  const buyerFallback = [buyer.first_name, buyer.last_name].filter(Boolean).join(" ").trim()
    || buyer.nickname || null

  const billingInfoId: string | null = buyer?.billing_info?.id ?? null

  // Identificación directa en el objeto order (V1 legacy embeds doc_type/doc_number)
  const buyerDirectId = buyer?.identification
    || buyer?.billing_info?.identification
    || null
  const buyerDirectDoc: string | null =
    buyer?.billing_info?.doc_number
    || buyer?.doc_number
    || null
  const buyerDirectDocType: string | null =
    buyer?.billing_info?.doc_type
    || buyer?.doc_type
    || null

  let nombre:        string | null = null
  let doc_tipo:      string | null = null
  let doc_numero:    string | null = null
  let condicion_iva: string | null = null
  let direccion:     string | null = null
  let billing_info_missing         = false
  let rawBillingInfo: any          = null

  // ── 4. Obtener datos fiscales reales ────────────────────────────────────
  //
  // ML tiene dos versiones del endpoint /orders/{id}/billing_info:
  //
  // V1 legacy: { billing_info: { doc_type, doc_number, additional_info[] } }
  // V2 actual: { site_id, buyer: { cust_id, billing_info: {
  //               name, last_name, identification: { type, number },
  //               taxes: { taxpayer_type: { id, description } },
  //               address: { street_name, street_number, city_name, state: { name }, zip_code }
  //             } }, seller: {} }
  //
  // Estrategia: llamar V2 primero (con x-version: 2), sino V1. También
  // intentar endpoint A si hay billingInfoId.

  /** Parsea additional_info[] de V1 en un mapa tipo→valor */
  function parseAdditionalInfo(arr: any[]): Record<string, string> {
    const map: Record<string, string> = {}
    if (!Array.isArray(arr)) return map
    for (const item of arr) {
      if (item?.type && item?.value != null) map[String(item.type)] = String(item.value)
    }
    return map
  }

  /**
   * Normaliza cualquier respuesta del billing_info de ML a un objeto plano
   * con campos: name/first_name, last_name, identification, doc_type, doc_number,
   * taxpayer_type_desc, address.
   */
  function extractBillingFields(raw: any): {
    nombre:        string | null
    doc_tipo:      string | null
    doc_numero:    string | null
    condicion_iva: string | null
    direccion:     string | null
  } {
    if (!raw) return { nombre: null, doc_tipo: null, doc_numero: null, condicion_iva: null, direccion: null }

    // ── Determinar el nodo con los datos fiscales ──────────────────────────
    let bi: any = raw

    // V2: { buyer: { billing_info: { ... } } }
    if (raw.buyer?.billing_info && typeof raw.buyer.billing_info === "object") {
      bi = raw.buyer.billing_info
    }
    // V2 sin billing_info nested: { buyer: { name, identification, ... } }
    else if (raw.buyer && typeof raw.buyer === "object") {
      bi = raw.buyer
    }
    // V1: { billing_info: { doc_type, doc_number, additional_info } }
    else if (raw.billing_info && typeof raw.billing_info === "object") {
      bi = raw.billing_info
    }

    // ── Nombre ────────────────────────────────────────────────────────────
    const isBusiness = !!(bi.business_name)
    let resNombre: string | null = null
    if (isBusiness) {
      resNombre = bi.business_name
    } else {
      // V2 usa "name" como primer nombre; V1/endpoint-A usa "first_name"
      resNombre = [bi.first_name || bi.name, bi.last_name]
        .filter(Boolean).join(" ").trim() || bi.full_name || null
    }

    // ── Documento ─────────────────────────────────────────────────────────
    // Orden de prioridad: identification.type/number → doc_type/doc_number → additional_info
    let resDocTipo:   string | null = bi.identification?.type   || bi.doc_type   || null
    let resDocNumero: string | null = bi.identification?.number != null
      ? String(bi.identification.number)
      : (bi.doc_number ? String(bi.doc_number) : null)

    // Fallback: additional_info[] de V1
    if (!resDocNumero && Array.isArray(bi.additional_info)) {
      const ai = parseAdditionalInfo(bi.additional_info)
      resDocTipo   = resDocTipo   || ai["DOC_TYPE"]   || null
      resDocNumero = resDocNumero || ai["DOC_NUMBER"]  || null
      // También nombre si no lo tenemos
      if (!resNombre) {
        const fn = ai["FIRST_NAME"] || ""
        const ln = ai["LAST_NAME"]  || ""
        resNombre = [fn, ln].filter(Boolean).join(" ").trim() || null
      }
    }

    // ── Condición IVA ─────────────────────────────────────────────────────
    // V2: taxes.taxpayer_type.description / .id
    // V1/A: taxpayer_type (string directo) | iva_condition
    let resCondIva: string | null =
      bi.taxes?.taxpayer_type?.description
      || bi.taxes?.taxpayer_type?.id
      || bi.taxpayer_type
      || bi.iva_condition
      || null

    // Normalizar a valores internos si viene en español/inglés
    if (resCondIva) {
      const v = resCondIva.toLowerCase()
      if (v.includes("final") || v === "05" || v === "5")          resCondIva = "consumidor_final"
      else if (v.includes("inscripto") || v.includes("registered")) resCondIva = "responsable_inscripto"
      else if (v.includes("monotrib"))                               resCondIva = "monotributo"
      else if (v.includes("exento") || v.includes("exempt"))        resCondIva = "exento"
    }

    // ── Dirección ─────────────────────────────────────────────────────────
    let resDireccion: string | null = null
    if (bi.address) {
      const a = bi.address
      if (typeof a === "string") {
        resDireccion = a || null
      } else {
        // V2 usa city_name directamente; V1 usa city.name
        const cityName = a.city_name || a.city?.name || null
        const stateName = a.state?.name || a.state_name || null
        const parts = [
          a.street_name, a.street_number, a.apartment,
          cityName, stateName, a.zip_code,
        ].filter(Boolean)
        resDireccion = parts.length > 0 ? parts.join(", ") : null
      }
    }

    return {
      nombre:        resNombre,
      doc_tipo:      resDocTipo,
      doc_numero:    resDocNumero,
      condicion_iva: resCondIva,
      direccion:     resDireccion,
    }
  }

  try {
    let rawA: any = null
    let rawB_v2: any = null
    let rawB_v1: any = null

    // Intento A: endpoint con billingInfoId (respuesta flat)
    if (billingInfoId) {
      try {
        rawA = await mlFetch(
          `https://api.mercadolibre.com/orders/billing-info/MLA/${billingInfoId}`
        )
      } catch { /* fallback */ }
    }

    // Intento B V2: con header x-version: 2 (estructura más completa)
    try {
      rawB_v2 = await mlFetch(
        `https://api.mercadolibre.com/orders/${order_id}/billing_info`,
        { "x-version": "2" }
      )
    } catch { /* fallback a V1 */ }

    // Intento B V1: sin header (legacy, tiene doc_type/doc_number flat + additional_info)
    try {
      rawB_v1 = await mlFetch(
        `https://api.mercadolibre.com/orders/${order_id}/billing_info`
      )
    } catch { /* ignorar */ }

    // Extraer datos de cada fuente
    const parsedA   = rawA   ? extractBillingFields(rawA)   : null
    const parsedBv2 = rawB_v2 ? extractBillingFields(rawB_v2) : null
    const parsedBv1 = rawB_v1 ? extractBillingFields(rawB_v1) : null

    // Elegir la fuente con más datos (prioridad: A > B_v2 > B_v1)
    // Para cada campo tomamos el primer valor no-nulo entre las fuentes
    const sources = [parsedA, parsedBv2, parsedBv1].filter(Boolean) as typeof parsedA[]
    nombre        = sources.map(s => s!.nombre).find(Boolean)        ?? null
    doc_tipo      = sources.map(s => s!.doc_tipo).find(Boolean)      ?? null
    doc_numero    = sources.map(s => s!.doc_numero).find(Boolean)    ?? null
    condicion_iva = sources.map(s => s!.condicion_iva).find(Boolean) ?? null
    direccion     = sources.map(s => s!.direccion).find(Boolean)     ?? null

    // Guardar raw para auditoría (preferir V2, sino V1, sino A)
    rawBillingInfo = rawB_v2 ?? rawB_v1 ?? rawA

    // Último fallback: identificación directa del buyer en /orders/{id}
    if (!doc_numero) {
      if (buyerDirectId?.number != null) {
        doc_tipo   = buyerDirectId.type   || doc_tipo
        doc_numero = String(buyerDirectId.number)
      } else if (buyerDirectDoc) {
        doc_tipo   = buyerDirectDocType || doc_tipo
        doc_numero = buyerDirectDoc
      }
    }
    if (!nombre) nombre = buyerFallback

    billing_info_missing = !nombre && !doc_numero

  } catch {
    nombre = buyerFallback
    if (!doc_numero) {
      if (buyerDirectId?.number != null) {
        doc_tipo   = buyerDirectId.type || null
        doc_numero = String(buyerDirectId.number)
      } else if (buyerDirectDoc) {
        doc_tipo   = buyerDirectDocType
        doc_numero = buyerDirectDoc
      } else {
        billing_info_missing = true
      }
    }
  }

  // ── 5. Upsert cache ──────────────────────────────────────────────────────
  await adminClient.from("ml_order_billing_cache").upsert({
    account_id,
    order_id,
    nombre,
    doc_tipo,
    doc_numero,
    condicion_iva,
    direccion,
    billing_info_missing,
    raw:        rawBillingInfo,
    updated_at: new Date().toISOString(),
  }, { onConflict: "account_id,order_id" })

  return { ok: true, nombre, doc_tipo, doc_numero, condicion_iva, direccion, billing_info_missing }
}
