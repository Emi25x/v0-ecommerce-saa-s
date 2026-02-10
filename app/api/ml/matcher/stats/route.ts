import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/ml/matcher/stats?account_id=...
 * Devuelve estadísticas del matcher: total sin vincular, vinculadas, pendientes
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient({ useServiceRole: true })

    // Total publicaciones
    const { count: totalPubs } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)

    // Publicaciones sin vincular
    const { count: unmatchedCount } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("product_id", null)

    // Publicaciones vinculadas automáticamente
    const { count: autoMatchedCount } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("product_id", "is", null)
      .in("matched_by", ["auto_sku", "auto_ean", "auto_isbn"])

    // Progress
    const { data: progress } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .single()

    return NextResponse.json({
      total_publications: totalPubs || 0,
      unmatched: unmatchedCount || 0,
      auto_matched: autoMatchedCount || 0,
      manual_matched: (totalPubs || 0) - (unmatchedCount || 0) - (autoMatchedCount || 0),
      last_run_at: progress?.last_run_at || null,
    })

  } catch (error: any) {
    console.error("[MATCHER-STATS] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
