import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Flujo correcto de opt-in al catálogo ML:
// 1. Verificar elegibilidad: GET /items/{id}/catalog_listing_eligibility
// 2. Si READY_FOR_OPTIN y tiene catalog_product_id → POST /items/{id}/catalog_listing_opt_in
// 3. Si no tiene catalog_product_id → buscar producto en catálogo por título/EAN y luego optin
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body     = await request.json()
    const { account_id, item_id, catalog_product_id } = body

    if (!account_id || !item_id) {
      return NextResponse.json({ error: "account_id e item_id son requeridos" }, { status: 400 })
    }

    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id")
      .eq("id", account_id)
      .single()

    if (!mlAccount) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    const token   = mlAccount.access_token
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

    // Paso 1: verificar elegibilidad del ítem
    const eligRes  = await fetch(`https://api.mercadolibre.com/items/${item_id}/catalog_listing_eligibility`, { headers })
    const eligData = eligRes.ok ? await eligRes.json() : null

    const status = eligData?.status
    // Para ítems sin variaciones el status está en el primer nivel;
    // para ítems con variaciones está en cada variación
    const hasVariations = (eligData?.variations?.length ?? 0) > 0

    if (eligData && status !== "READY_FOR_OPTIN" && !hasVariations) {
      return NextResponse.json({
        ok:     false,
        error:  `El ítem no está listo para opt-in. Estado: ${status || "desconocido"}`,
        status: status,
        details: eligData,
      }, { status: 422 })
    }

    // Paso 2: determinar catalog_product_id
    // Si el ítem ya tiene uno asignado por ML, usarlo
    let productId = catalog_product_id

    if (!productId) {
      // Obtener catalog_product_id del ítem directamente
      const itemRes  = await fetch(`https://api.mercadolibre.com/items/${item_id}?attributes=catalog_product_id,title`, { headers })
      const itemData = itemRes.ok ? await itemRes.json() : null
      productId      = itemData?.catalog_product_id
    }

    // Paso 3: hacer el opt-in
    const optinBody: any = {}
    if (productId) optinBody.catalog_product_id = productId

    const optinRes  = await fetch(
      `https://api.mercadolibre.com/items/${item_id}/catalog_listing_opt_in`,
      { method: "POST", headers, body: JSON.stringify(optinBody) }
    )
    const optinData = await optinRes.json()

    if (!optinRes.ok) {
      return NextResponse.json({
        ok:      false,
        error:   optinData?.message || optinData?.error || `Error ML ${optinRes.status}`,
        details: optinData,
        eligibility: eligData,
      }, { status: optinRes.status })
    }

    return NextResponse.json({
      ok:      true,
      message: "Opt-in al catálogo realizado correctamente",
      data:    optinData,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
