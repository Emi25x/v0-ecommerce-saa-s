import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /api/ml/publications/unmatched
 * Retorna publicaciones ML sin match con productos internos
 * Query params: page, pageSize, account_id?, q?, has_sku?, has_gtin?
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "50")
    const accountId = searchParams.get("account_id")
    const q = searchParams.get("q")
    const hasSku = searchParams.get("has_sku")
    const hasGtin = searchParams.get("has_gtin")

    const supabase = await createClient()
    const offset = (page - 1) * pageSize

    // Query base: publicaciones sin match
    let query = supabase
      .from("ml_publications")
      .select(`
        id,
        account_id,
        ml_item_id,
        title,
        status,
        price,
        current_stock,
        created_at,
        updated_at,
        ml_accounts!inner(nickname)
      `, { count: "exact" })
      .is("product_id", null)
      .order("created_at", { ascending: false })

    // Filtros opcionales
    if (accountId) {
      query = query.eq("account_id", accountId)
    }

    if (q) {
      query = query.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%`)
    }

    // Aplicar paginación
    query = query.range(offset, offset + pageSize - 1)

    const { data: items, error, count } = await query

    if (error) {
      console.error("[v0] Error fetching unmatched publications:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Formatear resultados
    const formattedItems = items?.map(item => ({
      id: item.id,
      account_id: item.account_id,
      account_nickname: (item.ml_accounts as any)?.nickname || "Unknown",
      ml_item_id: item.ml_item_id,
      title: item.title,
      status: item.status,
      price: item.price,
      current_stock: item.current_stock,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })) || []

    return NextResponse.json({
      items: formattedItems,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize)
      }
    })
  } catch (error: any) {
    console.error("[v0] Unmatched publications error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
