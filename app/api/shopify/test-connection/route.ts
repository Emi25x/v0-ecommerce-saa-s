import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeDomain, exchangeCredentialsForToken, fetchShopInfo } from "@/domains/shopify/auth"

// POST: probar credenciales — soporta access_token directo O api_key + api_secret (OAuth exchange)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { shop_domain, access_token, api_key, api_secret } = body

    if (!shop_domain) {
      return NextResponse.json({ connected: false, error: "shop_domain es requerido" }, { status: 400 })
    }

    const domain = normalizeDomain(shop_domain)
    let token = access_token

    if (!token) {
      if (!api_key || !api_secret) {
        return NextResponse.json({ connected: false, error: "Se requiere access_token o api_key + api_secret" }, { status: 400 })
      }
      // Intercambiar credenciales por token OAuth
      token = await exchangeCredentialsForToken(domain, api_key, api_secret)
    }

    const shop = await fetchShopInfo(domain, token)
    return NextResponse.json({
      connected: true,
      shop,
      access_token: token, // devolver el token obtenido para guardarlo en el dialog
      message: `Conectado a "${shop?.name ?? domain}"`,
    })
  } catch (error: any) {
    console.error("[SHOPIFY-TEST POST]", error.message)
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 })
  }
}

// GET: probar una tienda ya guardada por store_id
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get("store_id")

    if (!storeId) {
      return NextResponse.json({ connected: false, error: "store_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: store } = await supabase
      .from("shopify_stores")
      .select("shop_domain, access_token")
      .eq("id", storeId)
      .eq("owner_user_id", user.id)
      .single()

    if (!store) return NextResponse.json({ connected: false, error: "Tienda no encontrada" }, { status: 404 })

    const shop = await fetchShopInfo(store.shop_domain, store.access_token)
    return NextResponse.json({ connected: true, shop })
  } catch (error: any) {
    console.error("[SHOPIFY-TEST GET]", error.message)
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 })
  }
}
