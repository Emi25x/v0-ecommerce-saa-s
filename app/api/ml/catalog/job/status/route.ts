import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

// GET /api/ml/catalog/job/status?job_id=UUID
export async function GET(req: NextRequest) {
  const job_id = req.nextUrl.searchParams.get("job_id")
  const account_id = req.nextUrl.searchParams.get("account_id")

  const supabase = createAdminClient()

  if (job_id) {
    // Status de un job específico con sus items
    const { data: job, error } = await supabase
      .from("ml_catalog_jobs")
      .select("*")
      .eq("id", job_id)
      .single()
    if (error || !job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })

    const { data: items } = await supabase
      .from("ml_catalog_job_items")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })

    return NextResponse.json({ ok: true, job, items: items || [] })
  }

  if (account_id) {
    // Historial de jobs de la cuenta
    const { data: jobs, error } = await supabase
      .from("ml_catalog_jobs")
      .select("*")
      .eq("account_id", account_id)
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, jobs: jobs || [] })
  }

  return NextResponse.json({ error: "job_id o account_id requerido" }, { status: 400 })
}
