import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Filtros extraídos de las URLs del panel de ML:
// - BUYBOX_STATUS_COMPETING_MARKETPLACE  → "Elegibles para competir" (tienen buybox pero no catálogo)
// - UNDER_REVIEW_WAITING_FOR_PATCH_MARKETPLACE → "Bajo revisión / necesitan publicación de catálogo"
// Ambas usan: GET /users/{id}/items/search?task={TASK}&channel=marketplace&sort=DEFAULT
const TASK_MAP: Record<string, { label: string; description: string }> = {
  BUYBOX_STATUS_COMPETING_MARKETPLACE: {
    label: "Elegibles para competir",
    description: "Publicaciones que compiten en el buybox y pueden asociarse al catálogo",
  },
  UNDER_REVIEW_WAITING_FOR_PATCH_MARKETPLACE: {
    label: "Esperando publicación de catálogo",
    description: "Publicaciones bajo revisión que necesitan crear o asociar una publicación de catálogo",
  },
}

export async function GET(request: NextRequest) {
  try {
    const supabase   = await createClient()
    const accountId  = request.nextUrl.searchParams.get("account_id") || ""
    const task       = request.nextUrl.searchParams.get("task") || "BUYBOX_STATUS_COMPETING_MARKETPLACE"
    const offset     = Number(request.nextUrl.searchParams.get("offset") || "0")
    const limit      = Math.min(Number(request.nextUrl.searchParams.get("limit") || "50"), 50)

    if (!accountId) return NextResponse.json({ error: "account_id requerido" }, { status: 400 })

    const { data: mlAccount } = await supabase
      .from("ml_accounts")
      .select("access_token, ml_user_id, nickname")
      .eq("id", accountId)
      .single()

    if (!mlAccount) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

    const mlUserId = mlAccount.ml_user_id
    const token    = mlAccount.access_token

    // API correcta: task-based search (mismo filtro que usa el panel de ML)
    const searchUrl = new URL(`https://api.mercadolibre.com/users/${mlUserId}/items/search`)
    searchUrl.searchParams.set("task",    task)
    searchUrl.searchParams.set("channel", "marketplace")
    searchUrl.searchParams.set("sort",    "DEFAULT")
    searchUrl.searchParams.set("limit",   String(limit))
    searchUrl.searchParams.set("offset",  String(offset))

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!searchRes.ok) {
      const errText = await searchRes.text()
      return NextResponse.json(
        { error: `ML API error ${searchRes.status}: ${errText}` },
        { status: searchRes.status }
      )
    }

    const searchData = await searchRes.json()
    const itemIds: string[] = searchData.results || []
    const totalCount = searchData.paging?.total || 0

    if (!itemIds.length) {
      return NextResponse.json({ ok: true, items: [], total: 0 })
    }

    // Obtener detalles en batch — ML admite hasta 20 ids por request con /items?ids=
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += 20) chunks.push(itemIds.slice(i, i + 20))

    const allItems: any[] = []
    await Promise.all(chunks.map(async (chunk) => {
      const detailRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,title,price,status,health,thumbnail,category_id,catalog_product_id,catalog_listing,permalink,buying_mode,listing_type_id`,
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
      health:             item.health,
      thumbnail:          item.thumbnail,
      category_id:        item.category_id,
      catalog_product_id: item.catalog_product_id || null,
      catalog_listing:    item.catalog_listing || false,
      listing_type_id:    item.listing_type_id,
      permalink:          item.permalink,
    }))

    return NextResponse.json({ ok: true, items, total: totalCount })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
