import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Obtiene publicaciones con problemas de salud:
// - "soon_to_be_paused": próximas a pausarse por no tener catálogo
// - "catalog_not_listed": elegibles para opt-in a catálogo
// Ref: GET /users/{seller_id}/items/search?health=soon_to_be_paused
export async function GET(request: NextRequest) {
  try {
    const supabase    = await createClient()
    const accountId   = request.nextUrl.searchParams.get("account_id") || ""
    const healthFilter = request.nextUrl.searchParams.get("health") || "soon_to_be_paused"

    if (!accountId) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id, nickname")
      .eq("id", accountId)
      .single()

    if (!mlAccount) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    const mlUserId = mlAccount.ml_user_id
    const token    = mlAccount.access_token

    // Buscar items con problemas de salud
    const healthUrl = `https://api.mercadolibre.com/users/${mlUserId}/items/search?health=${healthFilter}&limit=50`
    const healthRes = await fetch(healthUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!healthRes.ok) {
      const errText = await healthRes.text()
      return NextResponse.json({ error: `ML API error: ${healthRes.status} ${errText}` }, { status: healthRes.status })
    }

    const healthData = await healthRes.json()
    const itemIds: string[] = healthData.results || []

    if (!itemIds.length) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }

    // Obtener detalles de los items en batch (ML permite hasta 20 ids por request)
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += 20) chunks.push(itemIds.slice(i, i + 20))

    const allItems: any[] = []
    await Promise.all(chunks.map(async (chunk) => {
      const detailRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,title,price,status,health,thumbnail,category_id,catalog_product_id,catalog_listing,permalink`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (detailRes.ok) {
        const details = await detailRes.json()
        for (const d of details) {
          if (d.code === 200 && d.body) allItems.push(d.body)
        }
      }
    }))

    // Para cada item, verificar si es elegible para catálogo
    const enriched = await Promise.all(allItems.map(async (item) => {
      let catalog_optin_eligible = false
      let catalog_product_id     = item.catalog_product_id || null

      // Buscar el producto de catálogo por EAN o categoría si no tiene catalog_product_id
      if (!catalog_product_id && item.category_id) {
        try {
          const prodRes = await fetch(
            `https://api.mercadolibre.com/items/${item.id}/product_identifiers`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          if (prodRes.ok) {
            const prodData = await prodRes.json()
            catalog_product_id = prodData?.catalog_product_id || null
            catalog_optin_eligible = !!catalog_product_id
          }
        } catch { /* ignorar */ }
      } else {
        catalog_optin_eligible = !!catalog_product_id
      }

      return {
        id:                    item.id,
        title:                 item.title,
        price:                 item.price,
        status:                item.status,
        health:                item.health,
        thumbnail:             item.thumbnail,
        category_id:           item.category_id,
        catalog_product_id,
        catalog_listing:       item.catalog_listing || false,
        catalog_optin_eligible,
        permalink:             item.permalink,
      }
    }))

    return NextResponse.json({
      ok:    true,
      items: enriched,
      total: healthData.paging?.total || enriched.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
