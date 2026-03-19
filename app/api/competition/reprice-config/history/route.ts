/**
 * GET /api/competition/reprice-config/history?ml_item_id=MLA...&limit=50
 *
 * Devuelve el historial de cambios de precio para un ítem.
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

    const { data, error } = await supabase
      .from("repricing_history")
      .select("id, old_price, new_price, price_to_win, status, changed, created_at")
      .eq("ml_item_id", ml_item_id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    return NextResponse.json({ ok: true, history: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
