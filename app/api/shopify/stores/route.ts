import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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

    // Soportar dos métodos de autenticación:
    // 1. Access Token (shpat_...) — directo
    // 2. API Key + API Secret — se usa como Basic Auth (usuario:contraseña)
    let effectiveToken = access_token
    let authHeader: string

    if (effectiveToken) {
      authHeader = `Bearer ${effectiveToken}`
    } else if (api_key && api_secret) {
      // Basic Auth con API Key:Secret — válido para apps personalizadas heredadas
      const encoded = Buffer.from(`${api_key}:${api_secret}`).toString("base64")
      authHeader = `Basic ${encoded}`
      effectiveToken = `${api_key}:${api_secret}` // guardar referencia
    } else {
      return NextResponse.json({ error: "Se requiere access_token o api_key + api_secret" }, { status: 400 })
    }

    // Normalizar dominio
    const domain = shop_domain.replace(/^https?:\/\//, "").replace(/\/$/, "")

    // Validar credenciales con shop.json liviano
    console.log(`[SHOPIFY-STORES] Testing connection for ${domain}`)
    try {
      const testRes = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": access_token || "",
          ...(api_key && api_secret ? { "Authorization": `Basic ${Buffer.from(`${api_key}:${api_secret}`).toString("base64")}` } : {}),
          "Content-Type": "application/json",
        },
      })
      if (!testRes.ok) {
        const txt = await testRes.text()
        let msg = `HTTP ${testRes.status}`
        try { msg = `HTTP ${testRes.status}: ${JSON.parse(txt).errors ?? txt}` } catch {}
        return NextResponse.json({ error: `No se pudo conectar a Shopify: ${msg}` }, { status: 400 })
      }
      const shopData = await testRes.json()
      console.log(`[SHOPIFY-STORES] Conectado a tienda: ${shopData.shop?.name}`)
    } catch (testError: any) {
      console.error("[SHOPIFY-STORES] Connection test failed:", testError)
      return NextResponse.json({ error: `Error al conectar: ${testError.message}` }, { status: 400 })
    }

    // Insert the new store
    const { data: store, error: insertError } = await supabase
      .from("shopify_stores")
      .insert({
        owner_user_id: user.id,
        shop_domain: domain,
        access_token: effectiveToken,
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
