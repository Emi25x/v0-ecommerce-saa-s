import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const job_id = searchParams.get("job_id")
  const account_id = searchParams.get("account_id")

  const supabase = createAdminClient()

  if (job_id) {
    const { data: job } = await supabase.from("market_scan_jobs").select("*").eq("id", job_id).single()
    return NextResponse.json({ ok: true, job: job ?? null })
  }

  if (account_id) {
    // Último job de la cuenta
    const { data: job } = await supabase
      .from("market_scan_jobs")
      .select("*")
      .eq("account_id", account_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    return NextResponse.json({ ok: true, job: job ?? null })
  }

  return NextResponse.json({ error: "job_id o account_id requerido" }, { status: 400 })
}

// POST: cancelar job
export async function POST(req: NextRequest) {
  const { job_id } = await req.json().catch(() => ({}))
  if (!job_id) return NextResponse.json({ error: "job_id requerido" }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from("market_scan_jobs").update({ status: "cancelled", ended_at: new Date().toISOString() }).eq("id", job_id).eq("status", "running")
  return NextResponse.json({ ok: true })
}
