/**
 * GET /api/competition/reprice-config/history?ml_item_id=MLA...&limit=50
 *
 * Devuelve el historial de cambios de precio para un ítem.
 * ── Migrado: lee de ml_repricing_jobs (fuente de verdad única) ──
 * Fallback a repricing_history si ml_repricing_jobs no tiene datos (migración gradual).
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const ml_item_id = searchParams.get("ml_item_id")
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200)

    if (!ml_item_id) {
      return NextResponse.json({ ok: false, error: "ml_item_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Primary: ml_repricing_jobs (modern)
    const { data: jobs, error: jobsErr } = await supabase
      .from("ml_repricing_jobs")
      .select("id, old_price, new_price, reason, status, created_at, processed_at")
      .eq("ml_item_id", ml_item_id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (!jobsErr && jobs && jobs.length > 0) {
      // Map to legacy-compatible shape
      const history = jobs.map((j) => ({
        id: j.id,
        old_price: j.old_price,
        new_price: j.new_price,
        price_to_win: null,
        status: j.reason || j.status,
        changed: j.new_price !== null && j.old_price !== j.new_price,
        created_at: j.processed_at || j.created_at,
      }))
      return NextResponse.json({ ok: true, history, source: "ml_repricing_jobs" })
    }

    // Fallback: repricing_history (legacy, for pre-migration data)
    const { data, error } = await supabase
      .from("repricing_history")
      .select("id, old_price, new_price, price_to_win, status, changed, created_at")
      .eq("ml_item_id", ml_item_id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return NextResponse.json({ ok: true, history: data ?? [], source: "repricing_history" })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
