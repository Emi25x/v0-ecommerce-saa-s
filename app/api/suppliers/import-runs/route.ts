import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/suppliers/import-runs?supplier_id=xxx[&limit=20]
 */
export async function GET(request: NextRequest) {
  const supabase   = await createClient({ useServiceRole: true })
  const { searchParams } = new URL(request.url)
  const supplierId = searchParams.get("supplier_id")
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "30"), 100)

  let query = supabase
    .from("supplier_import_runs")
    .select("*, suppliers(name, code)")
    .order("started_at", { ascending: false })
    .limit(limit)

  if (supplierId) query = query.eq("supplier_id", supplierId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, runs: data ?? [] })
}
