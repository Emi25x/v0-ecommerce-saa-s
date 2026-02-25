import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// GET /api/ml/catalog-migration/status?accountId=UUID
// Devuelve el job más reciente de la cuenta con sus métricas.
// También devuelve conteos de items por fase para la UI.
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId")
  if (!accountId) return NextResponse.json({ error: "accountId requerido" }, { status: 400 })

  const supabase = createAdminClient()

  // Job más reciente de esta cuenta
  const { data: job } = await supabase
    .from("ml_catalog_migration_jobs")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!job) return NextResponse.json({ ok: true, job: null })

  // Conteos de items por estado (solo si hay job)
  const [resolvedCount, optinOkCount, optinFailedCount, noMatchCount, ambiguousCount, candidateCount, errorsCount] = await Promise.all([
    // Migrables: resolve_status=resolved Y migrate_status=pending (listos para optin)
    supabase.from("ml_catalog_migration_items").select("*", { count: "exact", head: true })
      .eq("job_id", job.id).eq("resolve_status", "resolved").eq("migrate_status", "pending"),
    // Optin OK
    supabase.from("ml_catalog_migration_items").select("*", { count: "exact", head: true })
      .eq("job_id", job.id).eq("migrate_status", "optin_ok"),
    // Optin fallido
    supabase.from("ml_catalog_migration_items").select("*", { count: "exact", head: true })
      .eq("job_id", job.id).eq("migrate_status", "optin_failed"),
    // Sin match: not_found
    supabase.from("ml_catalog_migration_items").select("*", { count: "exact", head: true })
      .eq("job_id", job.id).eq("resolve_status", "not_found"),
    // Ambiguos
    supabase.from("ml_catalog_migration_items").select("*", { count: "exact", head: true })
      .eq("job_id", job.id).eq("resolve_status", "ambiguous"),
    // Total candidatos
    supabase.from("ml_catalog_migration_items").select("*", { count: "exact", head: true })
      .eq("job_id", job.id).eq("is_candidate", true),
    // Errores de migración
    supabase.from("ml_catalog_migration_items").select("*", { count: "exact", head: true })
      .eq("job_id", job.id).in("migrate_status", ["error"]),
  ])

  return NextResponse.json({
    ok: true,
    job,
    counts: {
      candidates: candidateCount.count ?? 0,
      // Migrables = resueltos con match único pendientes de optin
      migrables: resolvedCount.count ?? 0,
      // Sin match = not_found + ambiguous (nunca entran al job)
      no_match: (noMatchCount.count ?? 0) + (ambiguousCount.count ?? 0),
      optin_ok: optinOkCount.count ?? 0,
      optin_failed: optinFailedCount.count ?? 0,
      errors: errorsCount.count ?? 0,
    },
  })
}

// POST /api/ml/catalog-migration/status (cancelar job)
export async function POST(req: NextRequest) {
  const { jobId, action } = await req.json()
  if (!jobId || action !== "cancel") return NextResponse.json({ error: "jobId y action=cancel requeridos" }, { status: 400 })

  const supabase = createAdminClient()
  await supabase.from("ml_catalog_migration_jobs")
    .update({ status: "canceled", last_heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)

  return NextResponse.json({ ok: true, canceled: true })
}
