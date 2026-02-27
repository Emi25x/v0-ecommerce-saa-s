import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function normalizeDomain(shop_domain: string) {
  const clean = shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return clean.includes(".") ? clean : `${clean}.myshopify.com`
}

// Llama a shop.json con el header correcto según el modo de auth
async function testShopifyConnection(
  shop_domain: string,
  opts: { access_token?: string; api_key?: string; api_secret?: string }
) {
  const domain = normalizeDomain(shop_domain)
  const url = `https://${domain}/admin/api/2024-01/shop.json`

  // Construir headers según modo
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  if (opts.access_token) {
    // Access Token directo (shpat_...)
    headers["X-Shopify-Access-Token"] = opts.access_token
  } else if (opts.api_key && opts.api_secret) {
    // Basic Auth con API Key:Secret — válido para apps personalizadas heredadas
    const encoded = Buffer.from(`${opts.api_key}:${opts.api_secret}`).toString("base64")
    headers["Authorization"] = `Basic ${encoded}`
  } else {
    throw new Error("Se requiere access_token o api_key + api_secret")
  }

  const res = await fetch(url, { method: "GET", headers })
  const text = await res.text()

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const json = JSON.parse(text)
      errMsg = `HTTP ${res.status}: ${json.errors ?? JSON.stringify(json)}`
    } catch {
      errMsg = `HTTP ${res.status}: ${text.slice(0, 300)}`
    }
    throw new Error(errMsg)
  }

  const json = JSON.parse(text)
  return json.shop ?? null
}

// POST: probar credenciales desde el dialog (access_token O api_key+api_secret)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { shop_domain, access_token, api_key, api_secret } = body

    if (!shop_domain) {
      return NextResponse.json({ connected: false, error: "shop_domain es requerido" }, { status: 400 })
    }
    if (!access_token && !(api_key && api_secret)) {
      return NextResponse.json({ connected: false, error: "Se requiere access_token o api_key + api_secret" }, { status: 400 })
    }

    const shop = await testShopifyConnection(shop_domain, { access_token, api_key, api_secret })
    return NextResponse.json({
      connected: true,
      shop,
      message: `Conectado a "${shop?.name ?? shop_domain}"`,
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

    const shop = await testShopifyConnection(store.shop_domain, store.access_token)
    return NextResponse.json({ connected: true, shop })
  } catch (error: any) {
    console.error("[SHOPIFY-TEST GET]", error.message)
    return NextResponse.json({ connected: false, error: error.message }, { status: 200 })
  }
}
