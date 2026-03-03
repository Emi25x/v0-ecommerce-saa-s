import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Modos de búsqueda:
// "forewarning"  → GET /marketplace/items/catalog-forewarning
//                  Publicaciones propias que deben migrar al catálogo o serán pausadas
// "under_review" → GET /users/{id}/items/search?status=under_review&tags=catalog_required
//                  Publicaciones bajo revisión esperando publicación de catálogo

export async function GET(request: NextRequest) {
  try {
    const supabase  = await createClient()
    const accountId = request.nextUrl.searchParams.get("account_id") || ""
    const mode      = request.nextUrl.searchParams.get("mode") || "forewarning"
    const offset    = Number(request.nextUrl.searchParams.get("offset") || "0")
    const limit     = Math.min(Number(request.nextUrl.searchParams.get("limit") || "50"), 50)

    if (!accountId) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id, nickname")
      .eq("id", accountId)
      .single()

    if (!mlAccount) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    const token    = mlAccount.access_token
    const sellerId = mlAccount.ml_user_id

    let itemIds: string[] = []
    let total = 0

    if (mode === "forewarning") {
      // Publicaciones propias que deben migrar al catálogo o serán pausadas.
      // El endpoint requiere seller_id explícito — sin él devuelve 403 "Invalid caller.id".
      const url = `https://api.mercadolibre.com/users/${sellerId}/items/catalog-forewarning?limit=${limit}&offset=${offset}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

      if (!res.ok) {
        // Fallback: /items/search con tag catalog_forewarning
        const url2 = `https://api.mercadolibre.com/users/${sellerId}/items/search?tags=catalog_forewarning&limit=${limit}&offset=${offset}`
        const res2 = await fetch(url2, { headers: { Authorization: `Bearer ${token}` } })
        if (!res2.ok) {
          const err = await res2.text()
          return NextResponse.json({ error: `ML API ${res2.status}: ${err}` }, { status: res2.status })
        }
        const data2 = await res2.json()
        itemIds = data2.results || []
        total   = data2.paging?.total || itemIds.length
      } else {
        const data = await res.json()
        // catalog-forewarning puede devolver array directo o { results: [...] }
        itemIds = Array.isArray(data) ? data : (data.results || [])
        total   = data.paging?.total || itemIds.length
      }

    } else if (mode === "under_review") {
      // Publicaciones bajo revisión esperando publicación en catálogo.
      // Filtro extraído del panel ML: task=UNDER_REVIEW_WAITING_FOR_PATCH_MARKETPLACE
      // Equivalente en API: /items/search con tag catalog_required + status active/paused
      const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?tags=catalog_required&limit=${limit}&offset=${offset}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `ML API ${res.status}: ${err}` }, { status: res.status })
      }
      const data = await res.json()
      itemIds = data.results || []
      total   = data.paging?.total || itemIds.length

    } else {
      return NextResponse.json({ error: "mode inválido. Usar: forewarning | under_review" }, { status: 400 })
    }

    if (!itemIds.length) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }

    // Obtener detalles en batch (ML permite hasta 20 ids por request)
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += 20) chunks.push(itemIds.slice(i, i + 20))

    const allItems: any[] = []
    await Promise.all(chunks.map(async (chunk) => {
      const detailRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,title,price,status,health,thumbnail,category_id,catalog_product_id,catalog_listing,permalink,listing_type_id,tags,sub_status`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (detailRes.ok) {
        const details = await detailRes.json()
        for (const d of details) {
          if (d.code === 200 && d.body) allItems.push(d.body)
        }
      }
    }))

    const items = allItems.map((item) => ({
      id:                 item.id,
      title:              item.title,
      price:              item.price,
      status:             item.status,
      sub_status:         item.sub_status || null,
      health:             item.health,
      thumbnail:          item.thumbnail,
      category_id:        item.category_id,
      catalog_product_id: item.catalog_product_id || null,
      catalog_listing:    item.catalog_listing     || false,
      listing_type_id:    item.listing_type_id,
      tags:               item.tags                || [],
      permalink:          item.permalink,
    }))

    return NextResponse.json({ ok: true, items, total })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
