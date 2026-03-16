import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeDomain } from "@/lib/shopify-auth"

/**
 * GET /api/shopify/oauth/authorize
 *
 * Inicia el flujo OAuth de Shopify. Redirige al usuario a la página de autorización de Shopify.
 * Query params: shop_domain, api_key, api_secret, scopes (optional)
 *
 * El api_secret se guarda temporalmente en una cookie httpOnly para usarlo en el callback.
 */

const DEFAULT_SCOPES = [
  "read_products", "write_products",
  "read_orders", "write_orders",
  "read_inventory", "write_inventory",
  "read_locations",
  "read_fulfillments", "write_fulfillments",
  "read_shipping", "write_shipping",
].join(",")

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const shopDomain = searchParams.get("shop_domain")
  const apiKey = searchParams.get("api_key")
  const apiSecret = searchParams.get("api_secret")
  const scopes = searchParams.get("scopes") || DEFAULT_SCOPES

  if (!shopDomain || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "shop_domain, api_key y api_secret son requeridos" },
      { status: 400 },
    )
  }

  // Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const domain = normalizeDomain(shopDomain)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  // Generate a random state to prevent CSRF
  const state = crypto.randomUUID()

  const redirectUri = `${appUrl}/api/shopify/oauth/callback`

  const authorizeUrl = new URL(`https://${domain}/admin/oauth/authorize`)
  authorizeUrl.searchParams.set("client_id", apiKey)
  authorizeUrl.searchParams.set("scope", scopes)
  authorizeUrl.searchParams.set("redirect_uri", redirectUri)
  authorizeUrl.searchParams.set("state", state)

  // Store credentials + state in a secure httpOnly cookie for the callback
  const oauthData = JSON.stringify({
    api_key: apiKey,
    api_secret: apiSecret,
    domain,
    state,
    user_id: user.id,
  })

  const response = NextResponse.redirect(authorizeUrl.toString())
  response.cookies.set("shopify_oauth", oauthData, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  })

  return response
}
