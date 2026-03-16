import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

/**
 * GET /api/ml/publications/unmatched
 * Retorna publicaciones ML sin match con productos internos (product_id IS NULL)
 * Query params: page, pageSize, account_id?, q?
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "50")
    const accountId = searchParams.get("account_id")
    const q = searchParams.get("q")

    const supabase = createAdminClient()
    const offset = (page - 1) * pageSize

    // Query base: publicaciones sin product_id (sin vincular)
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
        updated_at
      `, { count: 'exact' })
      .is("product_id", null)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    // Filtro por cuenta
    if (accountId) {
      query = query.eq("account_id", accountId)
    }

    // Búsqueda por título o ID
    if (q) {
      query = query.or(`title.ilike.%${q}%,ml_item_id.ilike.%${q}%`)
    }

    const { data: items, error, count } = await query

    if (error) {
      console.error("[v0] Error fetching unmatched publications:", error)
      return NextResponse.json({ 
        error: error.message,
        items: [],
        pagination: {
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 0
        }
      }, { status: 500 })
    }

    // Fetch account nicknames separately
    const accountIds = [...new Set((items || []).map(item => item.account_id))]
    const { data: accountsData } = await supabase
      .from("ml_accounts")
      .select("id, nickname")
      .in("id", accountIds)

    const accountsMap = new Map((accountsData || []).map(acc => [acc.id, acc.nickname]))

    // Formatear items con nickname de la cuenta
    const formattedItems = (items || []).map(item => ({
      ...item,
      account_nickname: accountsMap.get(item.account_id) || "Unknown"
    }))

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
    return NextResponse.json({ 
      error: error.message,
      items: [],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0
      }
    }, { status: 500 })
  }
}
