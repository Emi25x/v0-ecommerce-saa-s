import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

// POST /api/ml/catalog-migration/migrate/start
// Avanza el job a fase migrate. Requiere dryRun boolean explícito.
export async function POST(req: NextRequest) {
  const { jobId, dryRun } = await req.json()
  if (!jobId) return NextResponse.json({ error: "jobId requerido" }, { status: 400 })
  if (typeof dryRun !== "boolean") return NextResponse.json({ error: "dryRun boolean requerido" }, { status: 400 })

  const supabase = createAdminClient()

  const { data: job } = await supabase
    .from("ml_catalog_migration_jobs")
    .select("*")
    .eq("id", jobId)
    .single()

  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
  if (job.status === "canceled") return NextResponse.json({ error: "Job cancelado" }, { status: 400 })

  // Contar resueltos pendientes de migrar
  const { count: pending } = await supabase
    .from("ml_catalog_migration_items")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("is_candidate", true)
    .eq("resolve_status", "resolved")
    .eq("migrate_status", "pending")

  if ((pending ?? 0) === 0) {
    return NextResponse.json({ ok: true, jobId, pending: 0, message: "No hay items resueltos pendientes de migrar" })
  }

  await supabase.from("ml_catalog_migration_jobs").update({
    phase: "migrate",
    status: "idle",
    dry_run: dryRun,
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", jobId)

  return NextResponse.json({ ok: true, jobId, pending, dryRun })
}
