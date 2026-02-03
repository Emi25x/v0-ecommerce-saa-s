import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Lista publicaciones de ML que NO tienen seller_sku configurado
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { account_id } = await request.json()

    if (!account_id) {
      return NextResponse.json({ error: "account_id requerido" }, { status: 400 })
    }

    // Obtener cuenta ML
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("*")
      .eq("id", account_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
    }

    // Refrescar token si es necesario
    let accessToken = account.access_token
    if (new Date(account.token_expires_at) <= new Date()) {
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_VERCEL_URL || ""}/api/mercadolibre/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id })
      })
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        accessToken = refreshData.access_token
      }
    }

    const mlUserId = account.ml_user_id

    // Obtener items activos
    const searchResponse = await fetch(
      `https://api.mercadolibre.com/users/${mlUserId}/items/search?status=active&limit=100`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    )

    if (!searchResponse.ok) {
      return NextResponse.json({ error: "Error al obtener items de ML" }, { status: 500 })
    }

    const searchData = await searchResponse.json()
    const itemIds = searchData.results || []
    const totalItems = searchData.paging?.total || itemIds.length

    const withoutSku: Array<{ id: string; title: string; permalink: string; created: string; ean?: string; gtin?: string }> = []
    const withSku: Array<{ id: string; sku: string }> = []

    // Obtener todos los productos de nuestra DB para buscar por GTIN
    const { data: products } = await supabase
      .from("products")
      .select("ean, title")
      .not("ean", "is", null)
    
    const eanMap = new Map(products?.map(p => [p.ean, p.title]) || [])

    // Procesar en lotes de 20
    for (let i = 0; i < Math.min(itemIds.length, 100); i += 20) {
      const batch = itemIds.slice(i, i + 20)
      const idsParam = batch.join(",")

      const detailsResponse = await fetch(
        `https://api.mercadolibre.com/items?ids=${idsParam}&attributes=id,title,seller_sku,seller_custom_field,attributes,permalink,date_created`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      )

      if (!detailsResponse.ok) continue

      const itemsDetails = await detailsResponse.json()

      for (const itemWrapper of itemsDetails) {
        if (itemWrapper.code !== 200 || !itemWrapper.body) continue
        
        const item = itemWrapper.body
        
        // Buscar SKU en diferentes lugares
        let sku = item.seller_sku || item.seller_custom_field || null
        let gtin: string | null = null
        
        if (item.attributes) {
          for (const attr of item.attributes) {
            if (["GTIN", "EAN"].includes(attr.id) && attr.value_name) {
              gtin = attr.value_name
              if (!sku) sku = attr.value_name
              break
            }
            if (attr.id === "SELLER_SKU" && attr.value_name && !sku) {
              sku = attr.value_name
            }
          }
        }

        if (!sku) {
          // Buscar el EAN en nuestra DB usando el GTIN del item
          const ean = gtin && eanMap.has(gtin) ? gtin : undefined
          
          withoutSku.push({
            id: item.id,
            title: item.title,
            permalink: item.permalink,
            created: item.date_created,
            ean: ean,
            gtin: gtin || undefined
          })
        } else {
          withSku.push({ id: item.id, sku })
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200))
    }

    return NextResponse.json({
      success: true,
      total: totalItems,
      analyzed: Math.min(itemIds.length, 100),
      withoutSku: withoutSku.length,
      withSku: withSku.length,
      items_without_sku: withoutSku
    })

  } catch (error) {
    console.error("Error listing items without SKU:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error interno" 
    }, { status: 500 })
  }
}
