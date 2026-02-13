import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/ml/matcher/status?account_id=xxx
 * Retorna progreso actual del matcher (alineado con /api/ml/import-pro/status)
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
      .maybeSingle()

    if (error) {
      if (error.code === 'PGRST116') {
        // No existe registro todavía - retornar estado inicial
        return NextResponse.json({
          ok: true,
          progress: {
            account_id: accountId,
            status: "idle",
            total_target: 0,
            processed_count: 0,
            matched_count: 0,
            ambiguous_count: 0,
            not_found_count: 0,
            invalid_identifier_count: 0,
            error_count: 0,
            progress_percentage: 0,
            started_at: null,
            finished_at: null,
            last_run_at: null,
            last_error: null
          }
        })
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calcular porcentaje de progreso
    const progressPercentage = progress.total_target > 0 
      ? (progress.processed_count / progress.total_target) * 100 
      : 0

    return NextResponse.json({
      ok: true,
      progress: {
        ...progress,
        progress_percentage: Math.min(100, progressPercentage)
      }
    })

  } catch (error: any) {
    console.error(`[MATCHER-STATUS] Error:`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
