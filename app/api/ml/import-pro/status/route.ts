import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 10

/**
 * GET /api/ml/import-pro/status?account_id=...
 * Devuelve el estado de importación actual de una cuenta ML
 * Crea el registro si no existe
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    // TODO: Authentication - Implement when Supabase Auth is configured
    // For now, skip auth validation to allow development/testing
    // const supabaseAuth = await createClient()
    // const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    // if (authError || !user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    const supabase = createAdminClient()

    // Verify account exists (ownership check disabled until auth is implemented)
    const { data: account, error: accountError } = await supabase
      .from("ml_accounts")
      .select("id, nickname")
      .eq("id", accountId)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Obtener o crear progress
    let { data: progress, error: progressError } = await supabase
      .from("ml_import_progress")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()

    // Crear registro si no existe
    if (!progress) {
      const { data: newProgress, error: createError } = await supabase
        .from("ml_import_progress")
        .insert({
          account_id: accountId,
          status: "idle",
          publications_offset: 0,
          activity_since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single()

      if (createError) {
        console.error("[IMPORT-PRO] Error creating progress:", createError)
        return NextResponse.json({ error: "Failed to create progress" }, { status: 500 })
      }

      progress = newProgress
    }

    // Calcular progreso del scan (0–100, siempre hacia adelante)
    const publicationsProgress =
      progress.publications_total && progress.publications_total > 0
        ? Math.min(100, Math.round((progress.publications_offset / progress.publications_total) * 100))
        : 0

    // Contar items REALES en la DB para este account (fuente de verdad).
    // Esta es la métrica honesta: cuántos items tiene importados independientemente
    // de cuántos scans se hayan hecho o si el scroll cursor se reinició.
    const { count: publicationsInDb } = await supabase
      .from("ml_publications")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)

    return NextResponse.json({
      ok: true,
      account: {
        id: account.id,
        nickname: account.nickname,
      },
      progress: {
        ...progress,
        publications_progress: publicationsProgress,
        publications_in_db:    publicationsInDb ?? 0,
      },
    })
  } catch (error: any) {
    console.error("[IMPORT-PRO] Status error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
