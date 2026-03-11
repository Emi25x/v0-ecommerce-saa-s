import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const search   = searchParams.get("search") || ""
  const source   = searchParams.get("source") || ""   // filter by source key
  const zeroOnly = searchParams.get("zero") === "1"
  const page     = Math.max(1, parseInt(searchParams.get("page") || "1"))
  const limit    = 50
  const offset   = (page - 1) * limit

  let query = supabase
    .from("products")
    .select("id, sku, ean, title, stock, stock_by_source, price", { count: "exact" })
    .order("title", { ascending: true })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`)
  }
  if (zeroOnly) {
    query = query.eq("stock", 0)
  }

  const { data: products, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Collect all unique source keys across all products
  const sourceKeysSet = new Set<string>()
  for (const p of products ?? []) {
    if (p.stock_by_source && typeof p.stock_by_source === "object") {
      Object.keys(p.stock_by_source).forEach(k => sourceKeysSet.add(k))
    }
  }
  const sourceKeys = Array.from(sourceKeysSet).sort()

  // Filter by source if requested (client already filters but API supports it too)
  let rows = products ?? []
  if (source) {
    rows = rows.filter(p => p.stock_by_source?.[source] != null)
  }

  return NextResponse.json({
    products: rows,
    source_keys: sourceKeys,
    total: count ?? 0,
    page,
    limit,
  })
}
