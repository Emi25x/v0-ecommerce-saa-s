import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchShopInfo } from "@/domains/shopify/auth"
import { getAppOrigin } from "@/lib/config"

/**
 * GET /api/shopify/oauth/callback
 *
 * Shopify redirige acá después de que el usuario autoriza la app.
 * Intercambia el code por un access_token y guarda la tienda en la DB.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const shop = searchParams.get("shop")
  const state = searchParams.get("state")
  const appUrl = getAppOrigin(request)

  // Redirect helper
  const redirectError = (msg: string) =>
    NextResponse.redirect(`${appUrl}/integrations/shopify-stores?error=${encodeURIComponent(msg)}`)

  if (!code || !shop) {
    return redirectError("Shopify no envió el código de autorización")
  }

  // Recover OAuth data from cookie
  const oauthCookie = request.cookies.get("shopify_oauth")?.value
  if (!oauthCookie) {
    return redirectError("Sesión OAuth expirada. Intentá conectar de nuevo.")
  }

  let oauthData: any
  try {
    oauthData = JSON.parse(oauthCookie)
  } catch {
    return redirectError("Datos OAuth inválidos")
  }

  // CSRF check
  if (state && oauthData.state && state !== oauthData.state) {
    return redirectError("Estado OAuth inválido (posible CSRF)")
  }

  const { api_key, api_secret, user_id } = oauthData

  if (!api_key || !api_secret || !user_id) {
    return redirectError("Faltan credenciales OAuth")
  }

  try {
    // Exchange code for access_token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: api_key,
        client_secret: api_secret,
        code,
      }),
    })

    const tokenText = await tokenRes.text()
    if (!tokenRes.ok) {
      let errMsg = `HTTP ${tokenRes.status}`
      try {
        const j = JSON.parse(tokenText)
        errMsg = j.error_description || j.error || errMsg
      } catch {}
      return redirectError(`Error al obtener token: ${errMsg}`)
    }

    const tokenData = JSON.parse(tokenText)
    const accessToken = tokenData.access_token as string
    if (!accessToken) {
      return redirectError("Shopify no devolvió un access_token")
    }

    // Verify token with shop.json
    let shopName = shop
    try {
      const shopInfo = await fetchShopInfo(shop, accessToken)
      shopName = shopInfo?.name || shop
    } catch {}

    // Save store to DB
    const supabase = createAdminClient()

    // Check if store already exists for this user
    const { data: existing } = await supabase
      .from("shopify_stores")
      .select("id")
      .eq("owner_user_id", user_id)
      .eq("shop_domain", shop)
      .maybeSingle()

    if (existing) {
      // Update existing store
      await supabase
        .from("shopify_stores")
        .update({
          access_token: accessToken,
          api_key,
          api_secret,
          token_expires_at: null, // OAuth tokens don't expire
          is_active: true,
          name: shopName,
        })
        .eq("id", existing.id)
    } else {
      // Insert new store
      await supabase
        .from("shopify_stores")
        .insert({
          owner_user_id: user_id,
          shop_domain: shop,
          name: shopName,
          access_token: accessToken,
          api_key,
          api_secret,
          is_active: true,
        })
    }

    // Clear OAuth cookie and redirect to success
    const response = NextResponse.redirect(
      `${appUrl}/integrations/shopify-stores?success=${encodeURIComponent(`Tienda "${shopName}" conectada correctamente`)}`
    )
    response.cookies.delete("shopify_oauth")
    return response

  } catch (err: any) {
    console.error("[shopify-oauth-callback]", err)
    return redirectError(err.message || "Error desconocido")
  }
}
