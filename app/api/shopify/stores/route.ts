import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { normalizeDomain, exchangeCredentialsForToken, fetchShopInfo } from "@/lib/shopify-auth"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: stores, error } = await supabase
      .from("shopify_stores")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[SHOPIFY-STORES] Error fetching stores:", error)
      return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
    }

    return NextResponse.json({ stores: stores || [] })
  } catch (error: any) {
    console.error("[SHOPIFY-STORES] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH: actualizar credenciales de una tienda existente y renovar token
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { store_id, api_key, api_secret } = await request.json()
    if (!store_id || !api_key || !api_secret) {
      return NextResponse.json({ error: "store_id, api_key y api_secret son requeridos" }, { status: 400 })
    }

    // Verificar que la tienda pertenece al usuario
    const { data: store } = await supabase
      .from("shopify_stores")
      .select("id, shop_domain")
      .eq("id", store_id)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 })

    // Obtener token fresco con las nuevas credenciales
    let token: string
    try {
      token = await exchangeCredentialsForToken(store.shop_domain, api_key, api_secret)
    } catch (e: any) {
      return NextResponse.json({ error: `Credenciales inválidas: ${e.message}` }, { status: 400 })
    }

    const tokenExpiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString()

    const { error: updateError } = await supabase
      .from("shopify_stores")
      .update({ api_key, api_secret, access_token: token, token_expires_at: tokenExpiresAt })
      .eq("id", store_id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({ ok: true, message: "Credenciales actualizadas y token renovado" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { shop_domain, access_token, api_key, api_secret, default_location_id } = body

    if (!shop_domain) {
      return NextResponse.json({ error: "shop_domain es requerido" }, { status: 400 })
    }

    const domain = normalizeDomain(shop_domain)
    let effectiveToken: string = access_token

    // Si no hay token directo, hacer el intercambio OAuth con client_id + client_secret
    if (!effectiveToken) {
      if (!api_key || !api_secret) {
        return NextResponse.json({ error: "Se requiere access_token o api_key + api_secret" }, { status: 400 })
      }
      try {
        effectiveToken = await exchangeCredentialsForToken(domain, api_key, api_secret)
        console.log(`[SHOPIFY-STORES] Token OAuth obtenido para ${domain}`)
      } catch (e: any) {
        return NextResponse.json({ error: `Error al obtener token: ${e.message}` }, { status: 400 })
      }
    }

    // Verificar el token con shop.json
    try {
      const shopData = await fetchShopInfo(domain, effectiveToken)
      console.log(`[SHOPIFY-STORES] Conectado a tienda: ${shopData?.name}`)
    } catch (e: any) {
      return NextResponse.json({ error: `Token inválido: ${e.message}` }, { status: 400 })
    }

    // Token OAuth expira en ~24h — guardar fecha de expiración
    const tokenExpiresAt = api_key
      ? new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString() // 23h para renovar antes
      : null

    // Guardar la tienda con credenciales completas para poder renovar el token
    const { data: store, error: insertError } = await supabase
      .from("shopify_stores")
      .insert({
        owner_user_id: user.id,
        shop_domain: domain,
        access_token: effectiveToken,
        api_key: api_key || null,
        api_secret: api_secret || null,
        token_expires_at: tokenExpiresAt,
        default_location_id: default_location_id || null,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[SHOPIFY-STORES] Error inserting store:", insertError)
      
      // Handle unique constraint violation
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "This Shopify store is already connected" }, { status: 409 })
      }
      
      return NextResponse.json({ error: "Failed to add store" }, { status: 500 })
    }

    console.log(`[SHOPIFY-STORES] Successfully added store: ${store.id}`)
    return NextResponse.json({ success: true, store })
  } catch (error: any) {
    console.error("[SHOPIFY-STORES] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
