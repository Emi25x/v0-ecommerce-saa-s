import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/billing/ml-order-billing?account_id=X&order_id=Y[&debug=1]
//
// Flujo correcto ML:
//   1. GET /orders/{id}              → buyer base (nickname, first_name, last_name) + contexto de la orden
//   2. GET /orders/{id}/billing_info → datos fiscales SIEMPRE (no condicional a billing_info.id)
//      Fuente primaria de: nombre/razón social, doc_tipo, doc_numero, domicilio, condicion_iva
//      Fallback a buyer si /billing_info falla o devuelve vacío → billing_info_missing: true
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

  const buyer         = orderData?.buyer || {}
  const buyerFallback = [buyer.first_name, buyer.last_name].filter(Boolean).join(" ").trim()
    || buyer.nickname || null

  let nombre:        string | null = null
  let doc_tipo:      string | null = null
  let doc_numero:    string | null = null
  let condicion_iva: string | null = null
  let direccion:     string | null = null
  let billing_info_missing         = false
  let rawBillingInfo: any          = null

  // ── 4. GET /orders/{id}/billing_info — SIEMPRE, es la fuente primaria ────
  //
  // No condicionamos a buyer.billing_info.id porque ML puede devolver datos
  // fiscales en este endpoint aunque ese campo venga null en la orden.
  // Fuente primaria de: nombre/razón social, doc_tipo, doc_numero, domicilio,
  // condicion_iva. Solo si este endpoint falla o devuelve vacío, usamos
  // buyer como fallback y marcamos billing_info_missing: true.
  try {
    const bi = await mlFetch(`https://api.mercadolibre.com/orders/${order_id}/billing_info`)
    rawBillingInfo = bi

    // ML devuelve persona física o jurídica (razón social)
    // Física:  { first_name, last_name, identification: { type, number } }
    // Jurídica:{ business_name, doc_type, doc_number }
    const isBusiness = !!(bi.business_name || bi.business_name === "")

    if (isBusiness && bi.business_name) {
      nombre     = bi.business_name
      doc_tipo   = bi.doc_type   || bi.identification?.type   || null
      doc_numero = bi.doc_number || bi.identification?.number || null
    } else {
      // Persona física — puede venir en first_name/last_name o en full_name
      nombre = [bi.first_name, bi.last_name].filter(Boolean).join(" ").trim()
        || bi.full_name
        || null
      doc_tipo   = bi.identification?.type   || null
      doc_numero = bi.identification?.number || null
    }

    // condicion_iva: campo taxpayer_type (preferido) o iva_condition según versión de la API
    condicion_iva = bi.taxpayer_type || bi.iva_condition || null

    // Domicilio: address puede ser string directo u objeto estructurado
    if (bi.address) {
      const a = bi.address
      if (typeof a === "string") {
        direccion = a || null
      } else {
        // Combinar partes significativas de la dirección
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

    // Si /billing_info respondió OK pero no tiene nombre ni doc → fallback
    if (!nombre && !doc_numero) {
      nombre               = buyerFallback
      billing_info_missing = true
    }
  } catch {
    // /billing_info falló (404, 403, timeout, etc.) — usar buyer como fallback
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
        buyer_id:         buyer.id,
        buyer_first_name: buyer.first_name,
        buyer_last_name:  buyer.last_name,
        buyer_nickname:   buyer.nickname,
      },
      _raw: rawBillingInfo,
    } : {}),
  })
}
