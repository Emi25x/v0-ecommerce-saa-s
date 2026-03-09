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
): Promise<MLOrderBillingResult> {
  // ── 1. Cache check ───────────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from("ml_order_billing_cache")
    .select("*")
    .eq("account_id", account_id)
    .eq("order_id", order_id)
    .maybeSingle()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime()
    // Forzar revalidación si el cache tiene nombre pero sin doc_numero (independientemente
    // de billing_info_missing) — indica fetch anterior con endpoint incorrecto que no
    // devolvía identificación. Esto permite recuperar los datos en el próximo acceso.
    const needsRevalidation = !!cached.nombre && !cached.doc_numero
    if (ageMs < 24 * 60 * 60 * 1000 && !needsRevalidation) {
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
  const { data: mlAccount } = await supabase
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

  let nombre:        string | null = null
  let doc_tipo:      string | null = null
  let doc_numero:    string | null = null
  let condicion_iva: string | null = null
  let direccion:     string | null = null
  let billing_info_missing         = false
  let rawBillingInfo: any          = null

  // ── 4. Obtener datos fiscales reales ────────────────────────────────────
  // Approach preferido: GET /orders/billing-info/MLA/{billing_info_id}
  // Fallback:           GET /orders/{id}/billing_info
  try {
    let bi: any
    if (billingInfoId) {
      bi = await mlFetch(
        `https://api.mercadolibre.com/orders/billing-info/MLA/${billingInfoId}`
      )
    } else {
      bi = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}/billing_info`)
    }
    rawBillingInfo = bi

    const isBusiness = !!(bi.business_name)

    if (isBusiness) {
      nombre     = bi.business_name
      doc_tipo   = bi.doc_type   || bi.identification?.type   || null
      doc_numero = bi.doc_number || bi.identification?.number || null
    } else {
      nombre = [bi.first_name, bi.last_name].filter(Boolean).join(" ").trim()
        || bi.full_name
        || null
      // ML puede devolver el doc en identification (nested) O en campos top-level
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

    if (!nombre && !doc_numero) {
      nombre               = buyerFallback
      billing_info_missing = true
    }
  } catch {
    nombre               = buyerFallback
    billing_info_missing = true
  }

  // ── 5. Upsert cache ──────────────────────────────────────────────────────
  await supabase.from("ml_order_billing_cache").upsert({
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
