import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/ml/matcher/progress?account_id=xxx
 * Retorna progreso unificado desde ml_matcher_progress
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = await createClient({ useServiceRole: true })

    const { data: progress, error } = await supabase
      .from("ml_matcher_progress")
      .select("*")
      .eq("account_id", accountId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No existe registro todavía - retornar estado inicial
        return NextResponse.json({
          status: "idle",
          scanned_count: 0,
          candidate_count: 0,
          matched_count: 0,
          ambiguous_count: 0,
          not_found_count: 0,
          invalid_identifier_count: 0,
          error_count: 0,
          total_matched: 0,
          total_unmatched: 0,
          items_per_second: 0,
          eta_seconds: null
        })
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calcular velocidad y ETA si está running
    let itemsPerSecond = 0
    let etaSeconds = null

    if (progress.status === "running" && progress.started_at) {
      const elapsedSeconds = (Date.now() - new Date(progress.started_at).getTime()) / 1000
      if (elapsedSeconds > 0) {
        itemsPerSecond = progress.scanned_count / elapsedSeconds
      }

      // Estimar ETA basado en publicaciones sin vincular
      const { count } = await supabase
        .from("ml_publications")
        .select("*", { count: 'exact', head: true })
        .eq("account_id", accountId)
        .is("product_id", null)

      if (count && itemsPerSecond > 0) {
        etaSeconds = Math.ceil(count / itemsPerSecond)
      }
    }

    return NextResponse.json({
      ...progress,
      items_per_second: Math.round(itemsPerSecond * 100) / 100,
      eta_seconds: etaSeconds
    })

  } catch (error: any) {
    console.error(`[MATCHER-PROGRESS] Error:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
