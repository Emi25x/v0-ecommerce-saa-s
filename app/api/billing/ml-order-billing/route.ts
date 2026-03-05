import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/billing/ml-order-billing?account_id=X&order_id=Y[&debug=1]
//
// Flujo correcto ML:
//   1. GET /orders/{id}           → leer buyer.billing_info.id (si existe)
//   2. GET /orders/{id}/billing_info → datos fiscales reales
//   Si no hay billing_info_id    → fallback buyer name + billing_info_missing: true
//
// Cache 24h en ml_order_billing_cache por (account_id, order_id).
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get("account_id") || ""
  const order_id   = searchParams.get("order_id")   || ""
  const debug      = searchParams.get("debug") === "1"

  if (!account_id || !order_id) {
    return NextResponse.json({ ok: false, error: "Faltan parámetros account_id / order_id" }, { status: 400 })
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
      return NextResponse.json({
        ok:                   true,
        nombre:               cached.nombre,
        doc_tipo:             cached.doc_tipo,
        doc_numero:           cached.doc_numero,
        condicion_iva:        cached.condicion_iva,
        direccion:            cached.direccion,
        billing_info_missing: cached.billing_info_missing,
        _from_cache:          true,
        ...(debug ? { _raw: cached.raw } : {}),
      })
    }
  }

  // ── 2. Obtener access_token ──────────────────────────────────────────────
  const { data: mlAccount } = await supabase
    .from("ml_accounts")
    .select("access_token")
    .eq("id", account_id)
    .single()

  if (!mlAccount?.access_token) {
    return NextResponse.json({ ok: false, error: "Cuenta ML no encontrada" }, { status: 404 })
  }

  const auth = `Bearer ${mlAccount.access_token}`

  // ── 3. GET /orders/{id} — leer buyer base + billing_info_id ─────────────
  async function mlFetch(url: string, retries = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: auth },
          signal:  AbortSignal.timeout(8000),
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

  let orderData: any
  try {
    orderData = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}`)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Error obteniendo orden: ${e.message}` }, { status: 502 })
  }

  const buyer            = orderData?.buyer  || {}
  const billingInfoId    = buyer?.billing_info?.id ?? null
  const buyerFallback    = [buyer.first_name, buyer.last_name].filter(Boolean).join(" ").trim()
    || buyer.nickname || null

  let nombre:        string | null = null
  let doc_tipo:      string | null = null
  let doc_numero:    string | null = null
  let condicion_iva: string | null = null
  let direccion:     string | null = null
  let billing_info_missing         = false
  let rawBillingInfo: any          = null

  // ── 4. GET /orders/{id}/billing_info (solo si hay billing_info_id) ───────
  if (billingInfoId) {
    try {
      const bi = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}/billing_info`)
      rawBillingInfo = bi

      // ML puede devolver persona física o jurídica
      // Persona física: { first_name, last_name, identification: { type, number } }
      // Jurídica:       { business_name, doc_type, doc_number }
      const isBusiness = !!bi.business_name

      if (isBusiness) {
        nombre     = bi.business_name || null
        doc_tipo   = bi.doc_type  || bi.identification?.type  || null
        doc_numero = bi.doc_number || bi.identification?.number || null
      } else {
        nombre     = [bi.first_name, bi.last_name].filter(Boolean).join(" ").trim() || null
        doc_tipo   = bi.identification?.type   || null
        doc_numero = bi.identification?.number || null
      }

      condicion_iva = bi.taxpayer_type || bi.iva_condition || null

      // Dirección: puede venir como address objeto o string
      if (bi.address) {
        const a = bi.address
        if (typeof a === "string") {
          direccion = a
        } else {
          direccion = [a.street_name, a.street_number, a.city?.name, a.state?.name]
            .filter(Boolean).join(", ") || null
        }
      }
    } catch {
      // billing_info falló pero tenemos billing_info_id — usar fallback, no marcar missing
      nombre = buyerFallback
    }
  } else {
    // No hay billing_info_id — es normal en muchas órdenes
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

  return NextResponse.json({
    ok:                   true,
    nombre,
    doc_tipo,
    doc_numero,
    condicion_iva,
    direccion,
    billing_info_missing,
    _from_cache:          false,
    ...(debug ? {
      _debug: {
        billing_info_id:  billingInfoId,
        buyer_first_name: buyer.first_name,
        buyer_last_name:  buyer.last_name,
        buyer_nickname:   buyer.nickname,
        buyer_id:         buyer.id,
      },
      _raw: rawBillingInfo,
    } : {}),
  })
}
