import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/ml/matcher/progress?run_id=...&account_id=...
 * Obtiene progreso detallado de un run específico o el último de la cuenta
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get("run_id")
    const accountId = searchParams.get("account_id")

    if (!runId && !accountId) {
      return NextResponse.json(
        { error: "run_id or account_id required" },
        { status: 400 }
      )
    }

    const supabase = await createClient({ useServiceRole: true })

    let run = null

    if (runId) {
      // Buscar run específico
      const { data, error } = await supabase
        .from("matcher_runs")
        .select("*")
        .eq("id", runId)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 })
      }
      run = data
    } else if (accountId) {
      // Buscar último run de la cuenta
      const { data, error } = await supabase
        .from("matcher_runs")
        .select("*")
        .eq("account_id", accountId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      
      if (!data) {
        return NextResponse.json({
          exists: false,
          message: "No runs found for this account"
        })
      }
      run = data
    }

    // Obtener progreso incremental
    const { data: progress } = await supabase
      .from("matcher_run_progress")
      .select("*")
      .eq("run_id", run.id)
      .maybeSingle()

    // Calcular ETA si está corriendo
    let eta = null
    if (run.status === "running" && progress) {
      const elapsed = (new Date().getTime() - new Date(run.started_at).getTime()) / 1000
      const itemsPerSec = progress.scanned_count / elapsed
      
      // Estimar remaining basado en publicaciones sin vincular
      const { count } = await supabase
        .from("ml_publications")
        .select("*", { count: "exact", head: true })
        .eq("account_id", run.account_id)
        .is("product_id", null)

      const remaining = count || 0
      eta = itemsPerSec > 0 ? Math.ceil(remaining / itemsPerSec) : null
    }

    return NextResponse.json({
      run: {
        id: run.id,
        account_id: run.account_id,
        status: run.status,
        started_at: run.started_at,
        finished_at: run.finished_at,
        totals: run.totals,
        last_error: run.last_error,
        time_budget_seconds: run.time_budget_seconds
      },
      progress: progress ? {
        scanned: progress.scanned_count,
        candidates: progress.candidate_count,
        matched: progress.matched_count,
        ambiguous: progress.ambiguous_count,
        not_found: progress.not_found_count,
        invalid_id: progress.invalid_id_count,
        skipped: progress.skipped_count,
        errors: progress.error_count,
        items_per_second: progress.items_per_second,
        estimated_seconds_remaining: eta,
        updated_at: progress.updated_at
      } : null
    })
  } catch (error: any) {
    console.error("[MATCHER-PROGRESS] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
