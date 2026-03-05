/**
 * POST /api/ml/catalog/eligibility/enqueue
 *
 * Inserts a catalog_index job into ml_jobs so a background worker can
 * process the full eligibility scan asynchronously.
 *
 * Body: { account_id: string, force?: boolean }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { account_id, force = false } = await req.json()

    if (!account_id) {
      return NextResponse.json({ ok: false, error: "account_id requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("ml_jobs")
      .insert({
        type:       "catalog_index",
        account_id,
        status:     "pending",
        payload:    { force },
        run_after:  new Date().toISOString(),
        attempts:   0,
      })
      .select("id")
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, job_id: data.id })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
