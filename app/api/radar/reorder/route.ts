/**
 * GET /api/radar/reorder
 *
 * Libros publicados en MercadoLibre con stock = 0,
 * ordenados por cantidad vendida (desc) y editorial.
 *
 * Query params:
 *   limit    (default 50)
 *   offset   (default 0)
 *   sort     "sold" | "editorial" (default "sold")
 *   search   texto libre (filtra por título, sku, isbn)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const limit  = Math.min(Number(searchParams.get("limit")  ?? 50), 200)
  const offset = Number(searchParams.get("offset") ?? 0)
  const sort   = searchParams.get("sort") ?? "sold"       // "sold" | "editorial"
  const search = searchParams.get("search")?.trim() ?? ""

  const supabase = getSupabase()

  // Publicaciones con stock = 0 (activas o pausadas — ML pausa automáticamente al quedarse sin stock)
  // Excluimos solo las cerradas definitivamente
  let query = supabase
    .from("ml_publications")
    .select(`
      id,
      ml_item_id,
      title,
      sku,
      isbn,
      price,
      current_stock,
      sold_quantity,
      permalink,
      account_id,
      status,
      product_id,
      products ( brand )
    `, { count: "exact" })
    .not("status", "eq", "closed")
    .or("current_stock.is.null,current_stock.eq.0")

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,sku.ilike.%${search}%,isbn.ilike.%${search}%`
    )
  }

  // Ordenar
  if (sort === "editorial") {
    query = query
      .order("products(brand)", { ascending: true, nullsFirst: false })
      .order("sold_quantity", { ascending: false, nullsFirst: false })
  } else {
    // Default: más vendidos primero
    query = query
      .order("sold_quantity", { ascending: false, nullsFirst: false })
      .order("products(brand)", { ascending: true, nullsFirst: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error("[radar/reorder] Error:", error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []).map((pub: any) => ({
    id:           pub.id,
    ml_item_id:   pub.ml_item_id,
    title:        pub.title,
    sku:          pub.sku ?? null,
    isbn:         pub.isbn ?? null,
    price:        pub.price ? Number(pub.price) : null,
    current_stock: pub.current_stock ?? 0,
    sold_quantity: pub.sold_quantity ? Number(pub.sold_quantity) : 0,
    editorial:    pub.products?.brand ?? null,
    permalink:    pub.permalink ?? null,
  }))

  return NextResponse.json({
    ok:     true,
    rows,
    total:  count ?? 0,
    limit,
    offset,
  })
}
