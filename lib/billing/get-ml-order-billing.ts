/**
 * getMLOrderBilling — lógica central de enriquecimiento fiscal ML.
 *
 * Flujo:
 *   1. Cache check en ml_order_billing_cache (TTL 24h)
 *   2. GET /orders/{id}                         → buyer base + billing_info.id
 *   3. GET /orders/billing-info/MLA/{bi_id}     → datos fiscales primarios (approach correcto)
 *      Fallback: GET /orders/{id}/billing_info  → si no hay billing_info.id
 *   4. Upsert cache
 *
 * Se llama directamente (sin HTTP) desde facturas/route.ts y desde
 * ml-order-billing/route.ts para evitar self-fetch con APP_URL.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"

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
  // Usar adminClient para la cache también: evita RLS en la tabla de cache
  // que podría bloquear lecturas cuando user_id en ml_accounts es null.
  const adminClient = createAdminClient()
  const { data: cached } = await adminClient
    .from("ml_order_billing_cache")
    .select("*")
    .eq("account_id", account_id)
    .eq("order_id", order_id)
    .maybeSingle()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime()
    // Revalidar si:
    //  a) Tiene nombre pero sin doc_numero → fetch anterior con endpoint incorrecto
    //  b) billing_info_missing=true → TTL corto (2h) en lugar de 24h, por si el
    //     endpoint viejo era el culpable; el nuevo endpoint puede tener los datos
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
  // IMPORTANTE: usar adminClient (ya declarado arriba) para evitar que RLS
  // bloquee cuentas con user_id=null en ml_accounts.
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

  async function mlFetch(url: string, retries = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: auth },
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

  // billing_info.id del buyer → endpoint correcto para datos fiscales
  const billingInfoId: string | null = buyer?.billing_info?.id ?? null

  // Identificación directa en el objeto buyer (a veces ML la incluye sin billing_info.id)
  const buyerIdentification = buyer?.identification || buyer?.billing_info?.identification || null

  let nombre:        string | null = null
  let doc_tipo:      string | null = null
  let doc_numero:    string | null = null
  let condicion_iva: string | null = null
  let direccion:     string | null = null
  let billing_info_missing         = false
  let rawBillingInfo: any          = null

  // ── 4. Obtener datos fiscales reales ────────────────────────────────────
  // Estrategia: intentar todos los endpoints disponibles, usar el que más datos tenga.
  //
  // Endpoint A: GET /orders/billing-info/MLA/{billing_info_id}
  //   → respuesta FLAT: { first_name, last_name, identification, business_name, ... }
  // Endpoint B: GET /orders/{id}/billing_info
  //   → respuesta WRAPPED: { buyer: { first_name, ..., identification }, seller: {...} }
  //
  // Normalizamos ambas respuestas a flat antes de parsear.

  /** Extrae el objeto fiscal flat de una respuesta de billing_info de ML */
  function normalizeBillingResponse(raw: any): any {
    if (!raw) return {}
    // Si tiene clave 'buyer' (endpoint B), desenvuelve
    if (raw.buyer && typeof raw.buyer === "object") return raw.buyer
    // Si tiene clave 'billing_info' como objeto (algunos endpoints)
    if (raw.billing_info && typeof raw.billing_info === "object") return raw.billing_info
    // Ya está flat (endpoint A)
    return raw
  }

  try {
    let rawA: any = null
    let rawB: any = null

    // Intento A: endpoint con billingInfoId (respuesta flat)
    if (billingInfoId) {
      try {
        rawA = await mlFetch(
          `https://api.mercadolibre.com/orders/billing-info/MLA/${billingInfoId}`
        )
      } catch { /* si falla, usar fallback */ }
    }

    // Intento B: endpoint clásico (respuesta wrapped) — siempre lo intentamos
    // como alternativa o fuente adicional de datos
    try {
      rawB = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}/billing_info`)
    } catch { /* ignorar si también falla */ }

    // Preferimos A si existe, sino B, sino objeto vacío
    const raw = rawA ?? rawB ?? {}
    rawBillingInfo = raw

    const bi = normalizeBillingResponse(raw)

    const isBusiness = !!(bi.business_name)

    if (isBusiness) {
      nombre     = bi.business_name
      doc_tipo   = bi.doc_type   || bi.identification?.type   || null
      doc_numero = bi.doc_number || bi.identification?.number || null
    } else {
      nombre = [bi.first_name, bi.last_name].filter(Boolean).join(" ").trim()
        || bi.full_name
        || null
      doc_tipo   = bi.identification?.type   || bi.doc_type   || null
      doc_numero = bi.identification?.number || bi.doc_number || null
    }

    condicion_iva = bi.taxpayer_type || bi.iva_condition || null

    if (bi.address) {
      const a = bi.address
      if (typeof a === "string") {
        direccion = a || null
      } else {
        const parts = [
          a.street_name, a.street_number, a.apartment,
          a.city?.name, a.state?.name, a.zip_code,
        ].filter(Boolean)
        direccion = parts.length > 0 ? parts.join(", ") : null
      }
    }

    // Fallback: identificación directa del buyer en el objeto /orders/{id}
    // ML a veces incluye buyer.identification sin tener billing_info.id
    if (!doc_numero && buyerIdentification?.number) {
      doc_tipo   = buyerIdentification.type   || doc_tipo
      doc_numero = String(buyerIdentification.number)
    }
    if (!nombre) nombre = buyerFallback

    if (!nombre && !doc_numero) {
      billing_info_missing = true
    }
  } catch {
    nombre               = buyerFallback
    // Intentar doc desde buyer.identification antes de marcar como missing
    if (!doc_numero && buyerIdentification?.number) {
      doc_tipo   = buyerIdentification.type   || null
      doc_numero = String(buyerIdentification.number)
    } else {
      billing_info_missing = true
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
