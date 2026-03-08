import { SupabaseClient } from "@supabase/supabase-js"

/**
 * Obtener datos fiscales de una orden ML desde /billing_info
 * Llamada interna segura sin depender de APP_URL/HTTP
 *
 * Retorna los datos fiscales con auto-enrichment:
 * - Si /billing_info tiene datos → usa esos (fuente primaria)
 * - Si /billing_info falla o está vacío → usa buyer como fallback
 * - Cachea 24h por (account_id, order_id)
 */
export async function getMlOrderBillingInfo(
  supabase: SupabaseClient,
  account_id: string,
  order_id: string,
  debug: boolean = false
) {
  if (!account_id || !order_id) {
    throw new Error("Faltan parámetros account_id / order_id")
  }

  // ── 1. Cache check ───────────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from("ml_order_billing_cache")
    .select("*")
    .eq("account_id", account_id)
    .eq("order_id", order_id)
    .maybeSingle()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime()
    if (ageMs < 24 * 60 * 60 * 1000) {
      return {
        ok: true,
        nombre: cached.nombre,
        doc_tipo: cached.doc_tipo,
        doc_numero: cached.doc_numero,
        condicion_iva: cached.condicion_iva,
        direccion: cached.direccion,
        billing_info_missing: cached.billing_info_missing,
        _from_cache: true,
        ...(debug ? { _raw: cached.raw } : {}),
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
    throw new Error("Cuenta ML no encontrada")
  }

  const auth = `Bearer ${mlAccount.access_token}`

  // ── 3. Helper para fetch con retry ───────────────────────────────────────
  async function mlFetch(url: string, retries = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || `ML HTTP ${res.status}`)
        }
        return await res.json()
      } catch (e) {
        if (attempt === retries) throw e
        await new Promise(r => setTimeout(r, 600))
      }
    }
  }

  // ── 4. GET /orders/{id} — leer buyer base ─────────────────────────────────
  let orderData: any
  try {
    orderData = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}`)
  } catch (e: any) {
    throw new Error(`Error obteniendo orden: ${e.message}`)
  }

  const buyer = orderData?.buyer || {}
  const buyerFallback = [buyer.first_name, buyer.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || buyer.nickname || null

  let nombre: string | null = null
  let doc_tipo: string | null = null
  let doc_numero: string | null = null
  let condicion_iva: string | null = null
  let direccion: string | null = null
  let billing_info_missing = false
  let rawBillingInfo: any = null

  // ── 5. GET /orders/{id}/billing_info — SIEMPRE, es la fuente primaria ────
  try {
    const bi = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}/billing_info`)
    rawBillingInfo = bi

    const isBusiness = !!(bi.business_name || bi.business_name === "")

    if (isBusiness && bi.business_name) {
      nombre = bi.business_name
      doc_tipo = bi.doc_type || bi.identification?.type || null
      doc_numero = bi.doc_number || bi.identification?.number || null
    } else {
      nombre =
        [bi.first_name, bi.last_name].filter(Boolean).join(" ").trim() ||
        bi.full_name ||
        null
      doc_tipo = bi.identification?.type || null
      doc_numero = bi.identification?.number || null
    }

    condicion_iva = bi.taxpayer_type || bi.iva_condition || null

    if (bi.address) {
      const a = bi.address
      if (typeof a === "string") {
        direccion = a || null
      } else {
        const parts = [
          a.street_name,
          a.street_number,
          a.apartment,
          a.city?.name,
          a.state?.name,
          a.zip_code,
        ].filter(Boolean)
        direccion = parts.length > 0 ? parts.join(", ") : null
      }
    }

    if (!nombre && !doc_numero) {
      nombre = buyerFallback
      billing_info_missing = true
    }
  } catch {
    nombre = buyerFallback
    billing_info_missing = true
  }

  // ── 6. Upsert cache ──────────────────────────────────────────────────────
  await supabase.from("ml_order_billing_cache").upsert(
    {
      account_id,
      order_id,
      nombre,
      doc_tipo,
      doc_numero,
      condicion_iva,
      direccion,
      billing_info_missing,
      raw: rawBillingInfo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,order_id" }
  )

  return {
    ok: true,
    nombre,
    doc_tipo,
    doc_numero,
    condicion_iva,
    direccion,
    billing_info_missing,
    _from_cache: false,
    ...(debug ? { _raw: rawBillingInfo } : {}),
  }
}
