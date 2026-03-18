import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

// POST /api/ml/catalog-migration/resolve/start
// Avanza el job a la fase resolve_catalog_product si la auditoría está completa.
export async function POST(req: NextRequest) {
  const { jobId } = await req.json()
  if (!jobId) return NextResponse.json({ error: "jobId requerido" }, { status: 400 })

  const supabase = createAdminClient()

  const { data: job } = await supabase
    .from("ml_catalog_migration_jobs")
    .select("*")
    .eq("id", jobId)
    .single()

  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
  if (job.status === "canceled") return NextResponse.json({ error: "Job cancelado" }, { status: 400 })

  // Contar candidatos pendientes de resolver
  const { count: pending } = await supabase
    .from("ml_catalog_migration_items")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("is_candidate", true)
    .eq("resolve_status", "pending")

  if ((pending ?? 0) === 0) {
    return NextResponse.json({ ok: true, jobId, pending: 0, message: "No hay candidatos pendientes de resolver" })
  }

  await supabase.from("ml_catalog_migration_jobs").update({
    phase: "resolve_catalog_product",
    status: "idle",
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", jobId)

  return NextResponse.json({ ok: true, jobId, pending })
}
