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

    // Construir query con NOT EXISTS para publicaciones sin match en ml_publication_matches
    // Necesitamos usar SQL directo porque Supabase no soporta NOT EXISTS nativamente
    const filters = []
    const params: any = { 
      limit_val: pageSize, 
      offset_val: offset 
    }
    
    if (accountId) {
      filters.push("p.account_id = @account_id")
      params.account_id = accountId
    }
    
    if (q) {
      filters.push("(p.title ILIKE @search OR p.ml_item_id ILIKE @search)")
      params.search = `%${q}%`
    }
    
    const whereClause = filters.length > 0 ? `AND ${filters.join(" AND ")}` : ""
    
    // Query usando RPC para obtener publicaciones sin match
    const { data: items, error } = await supabase.rpc('get_unmatched_publications', {
      p_account_id: accountId || null,
      p_search: q || null,
      p_limit: pageSize,
      p_offset: offset
    })
    
    // Count total (necesitamos una query separada)
    const { count, error: countError } = await supabase.rpc('count_unmatched_publications', {
      p_account_id: accountId || null,
      p_search: q || null
    })

    if (error) {
      console.error("[v0] Error fetching unmatched publications:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (countError) {
      console.error("[v0] Error counting unmatched publications:", countError)
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    // Los items ya vienen formateados de la función RPC
    const formattedItems = items || []

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
