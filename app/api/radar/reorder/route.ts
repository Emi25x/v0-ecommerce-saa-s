/**
 * GET /api/radar/reorder
 *
 * Libros publicados en MercadoLibre sin stock, ordenados por vendidos / editorial.
 * Incluye publicaciones pausadas (ML pausa automáticamente cuando stock = 0).
 *
 * Query params:
 *   limit      (default 50, max 200)
 *   offset     (default 0)
 *   sort       "sold" | "editorial"  (default "sold")
 *   search     texto libre — filtra por título, sku, isbn
 *   account_id UUID de cuenta ML específica (omitir para todas)
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limit     = Math.min(Number(searchParams.get("limit")  ?? 50), 200)
  const offset    = Number(searchParams.get("offset") ?? 0)
  const sort      = searchParams.get("sort") ?? "sold"
  const search    = searchParams.get("search")?.trim() ?? ""
  const accountId = searchParams.get("account_id")?.trim() ?? ""

  const supabase = createAdminClient()

  // ── 1. Publicaciones sin stock o pausadas ─────────────────────────────────
  let query = supabase
    .from("ml_publications")
    .select(
      `id, ml_item_id, title, sku, isbn, price,
       current_stock, sold_quantity, permalink,
       account_id, status, product_id`,
      { count: "exact" },
    )
    .not("status", "in", '("closed","inactive")')
    .or("current_stock.lte.0,current_stock.is.null,status.eq.paused")

  if (accountId) {
    query = query.eq("account_id", accountId)
  }

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,sku.ilike.%${search}%,isbn.ilike.%${search}%`,
    )
  }

  query = query
    .order("sold_quantity", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error("[radar/reorder] DB error:", error.message, error.details)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = data ?? []

  // ── 2. Obtener editorial (brand) desde products para las rows que tienen product_id
  //      Evitamos el embedded join de PostgREST porque ml_publications no tiene FK constraint a products
  const productIds = [...new Set(rows.map((r: any) => r.product_id).filter(Boolean))]
  const brandMap: Record<string, string> = {}

  if (productIds.length > 0) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, brand")
      .in("id", productIds)

    for (const p of prods ?? []) {
      if (p.brand) brandMap[p.id] = p.brand
    }
  }

  // ── 3. Mapear resultado ───────────────────────────────────────────────────
  let result = rows.map((pub: any) => ({
    id:            pub.id,
    ml_item_id:    pub.ml_item_id,
    title:         pub.title,
    sku:           pub.sku   ?? null,
    isbn:          pub.isbn  ?? null,
    price:         pub.price ? Number(pub.price) : null,
    current_stock: pub.current_stock ?? 0,
    sold_quantity: pub.sold_quantity  ? Number(pub.sold_quantity) : 0,
    editorial:     pub.product_id ? (brandMap[pub.product_id] ?? null) : null,
    status:        pub.status,
    account_id:    pub.account_id,
    permalink:     pub.permalink ?? null,
  }))

  // Sort editorial client-side
  if (sort === "editorial") {
    result = result.sort((a, b) => {
      const ea = (a.editorial ?? "").toLowerCase()
      const eb = (b.editorial ?? "").toLowerCase()
      if (ea < eb) return -1
      if (ea > eb) return  1
      return b.sold_quantity - a.sold_quantity
    })
  }

  return NextResponse.json({ ok: true, rows: result, total: count ?? 0, limit, offset })
}
