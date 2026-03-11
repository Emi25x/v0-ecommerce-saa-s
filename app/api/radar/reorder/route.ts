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
  const limit     = Math.min(Number(searchParams.get("limit")  ?? 50), 200)
  const offset    = Number(searchParams.get("offset") ?? 0)
  const sort      = searchParams.get("sort") ?? "sold"
  const search    = searchParams.get("search")?.trim() ?? ""
  const accountId = searchParams.get("account_id")?.trim() ?? ""

  const supabase = getSupabase()

  /*
   * Criterio: publicaciones que NO están cerradas Y que tienen stock = 0 o
   * están pausadas (ML pausa automáticamente cuando available_quantity llega a 0).
   * Usamos `.or()` en PostgREST con la condición de stock + status juntos para
   * evitar problemas de precedencia al combinar .neq() con .or().
   */
  let query = supabase
    .from("ml_publications")
    .select(
      `id, ml_item_id, title, sku, isbn, price,
       current_stock, sold_quantity, permalink,
       account_id, status,
       products ( brand )`,
      { count: "exact" },
    )
    // status != closed  Y  (stock=0 OR stock IS NULL OR status='paused')
    .neq("status", "closed")
    .or("current_stock.eq.0,current_stock.is.null,status.eq.paused")

  if (accountId) {
    query = query.eq("account_id", accountId)
  }

  if (search) {
    // Nuevo .or() encadenado → se combina con AND sobre la condición anterior
    query = query.or(
      `title.ilike.%${search}%,sku.ilike.%${search}%,isbn.ilike.%${search}%`,
    )
  }

  // Orden
  if (sort === "editorial") {
    query = query
      .order("products(brand)", { ascending: true,  nullsFirst: false })
      .order("sold_quantity",   { ascending: false, nullsFirst: false })
  } else {
    query = query
      .order("sold_quantity",   { ascending: false, nullsFirst: false })
      .order("products(brand)", { ascending: true,  nullsFirst: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error("[radar/reorder]", error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []).map((pub: any) => ({
    id:            pub.id,
    ml_item_id:    pub.ml_item_id,
    title:         pub.title,
    sku:           pub.sku   ?? null,
    isbn:          pub.isbn  ?? null,
    price:         pub.price ? Number(pub.price) : null,
    current_stock: pub.current_stock ?? 0,
    sold_quantity: pub.sold_quantity ? Number(pub.sold_quantity) : 0,
    editorial:     pub.products?.brand ?? null,
    status:        pub.status,
    account_id:    pub.account_id,
    permalink:     pub.permalink ?? null,
  }))

  return NextResponse.json({ ok: true, rows, total: count ?? 0, limit, offset })
}
