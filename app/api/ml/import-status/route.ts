import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

/**
 * GET /api/ml/import-status?account_id=xxx
 * Retorna el estado de la importación inicial
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get("account_id")

    if (!accountId) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: progress } = await supabase
      .from("ml_import_progress")
      .select("publications_offset, publications_total, status")
      .eq("account_id", accountId)
      .maybeSingle()

    if (!progress) {
      return NextResponse.json({
        is_complete: false,
        offset: 0,
        total: null,
        status: "not_started"
      })
    }

    const isComplete = progress.status === 'done' || 
                      (progress.publications_total && progress.publications_offset >= progress.publications_total)

    return NextResponse.json({
      is_complete: isComplete,
      offset: progress.publications_offset || 0,
      total: progress.publications_total || null,
      status: progress.status,
      pending: progress.publications_total ? progress.publications_total - (progress.publications_offset || 0) : null
    })
  } catch (error: any) {
    console.error("[IMPORT-STATUS] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
