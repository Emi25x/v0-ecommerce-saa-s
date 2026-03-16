import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { protectAPI } from "@/lib/auth/protect-api"

export async function GET(request: NextRequest) {
  const authError = await protectAPI()
  if (authError) return authError

  const { searchParams } = request.nextUrl
  const account_id = searchParams.get("account_id")
  const limit      = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")))

  const supabase = await createClient()

  const query = supabase
    .from("ml_jobs")
    .select("id, account_id, type, status, attempts, run_after, locked_at, last_error, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (account_id) query.eq("account_id", account_id)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, jobs: data || [] })
}
