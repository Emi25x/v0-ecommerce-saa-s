import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Usa REST shop.json — compatible con todos los tipos de token de Shopify
async function testShopifyConnection(shop_domain: string, access_token: string) {
  // Normalizar dominio: asegurarse de que tenga .myshopify.com
  const domain = shop_domain.includes(".")
    ? shop_domain.replace(/^https?:\/\//, "")
    : `${shop_domain}.myshopify.com`

  const url = `https://${domain}/admin/api/2024-01/shop.json`

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": access_token,
      "Content-Type": "application/json",
    },
  })

  const text = await res.text()

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const json = JSON.parse(text)
      errMsg = `HTTP ${res.status}: ${json.errors ?? JSON.stringify(json)}`
    } catch {
      errMsg = `HTTP ${res.status}: ${text.slice(0, 200)}`
    }
    throw new Error(errMsg)
  }

  const json = JSON.parse(text)
  return json.shop ?? null
}

// POST: probar con credenciales pasadas en el body (desde el dialog al agregar)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { shop_domain, access_token } = body

    if (!shop_domain || !access_token) {
      return NextResponse.json({ connected: false, error: "shop_domain y access_token son requeridos" }, { status: 400 })
    }

    const shop = await testShopifyConnection(shop_domain, access_token)
    return NextResponse.json({ connected: true, shop, message: `Conectado a ${shop?.name ?? shop_domain}` })
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
