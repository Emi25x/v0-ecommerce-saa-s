import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/ml/matcher/results?run_id=...&outcome=...&limit=50&offset=0
 * Lista resultados detallados de un run con filtros y paginación
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get("run_id")
    const outcome = searchParams.get("outcome")
    const reasonCode = searchParams.get("reason_code")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    if (!runId) {
      return NextResponse.json({ error: "run_id required" }, { status: 400 })
    }

    const supabase = await createClient({ useServiceRole: true })

    // Build query
    let query = supabase
      .from("matcher_results")
      .select(`
        id,
        ml_item_id,
        identifier_type,
        identifier_value_normalized,
        outcome,
        matched_product_id,
        match_count,
        reason_code,
        created_at,
        ml_publications!inner(title, status),
        products(title, sku, isbn, ean)
      `, { count: "exact" })
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (outcome) {
      query = query.eq("outcome", outcome)
    }

    if (reasonCode) {
      query = query.eq("reason_code", reasonCode)
    }

    const { data, error, count } = await query

    if (error) {
      console.error("[MATCHER-RESULTS] Query error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Obtener resumen por outcome
    const { data: summary } = await supabase
      .from("matcher_results_summary")
      .select("*")
      .eq("run_id", runId)

    return NextResponse.json({
      results: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      },
      summary: summary || []
    })
  } catch (error: any) {
    console.error("[MATCHER-RESULTS] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
