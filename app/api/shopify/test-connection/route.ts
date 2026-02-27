import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Lightweight shop info query — mucho más rápido que traer productos
async function testShopifyConnection(shop_domain: string, access_token: string) {
  const url = `https://${shop_domain}/admin/api/2024-01/graphql.json`
  const query = `{ shop { name email myshopifyDomain plan { displayName } } }`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": access_token,
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "GraphQL error")
  }

  return json.data?.shop ?? null
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
