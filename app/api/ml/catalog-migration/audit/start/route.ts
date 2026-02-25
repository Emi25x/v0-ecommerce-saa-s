import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// POST /api/ml/catalog-migration/audit/start
// Crea o retoma un job de auditoría para la cuenta dada.
// Si ya hay un job running para esa cuenta, devuelve ese job sin crear otro.
export async function POST(req: NextRequest) {
  const { accountId } = await req.json()
  if (!accountId) return NextResponse.json({ error: "accountId requerido" }, { status: 400 })

  const supabase = createAdminClient()

  // Verificar que la cuenta existe
  const { data: account, error: accErr } = await supabase
    .from("ml_accounts")
    .select("id, nickname")
    .eq("id", accountId)
    .single()
  if (accErr || !account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  // Buscar job running o idle para esta cuenta en fase audit
  const { data: existing } = await supabase
    .from("ml_catalog_migration_jobs")
    .select("*")
    .eq("account_id", accountId)
    .in("status", ["running", "idle"])
    .eq("phase", "audit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log(`[CATALOG-MIGRATION] Retomando job existente ${existing.id} status=${existing.status}`)
    return NextResponse.json({ ok: true, jobId: existing.id, resumed: true, job: existing })
  }

  // Crear job nuevo
  const { data: job, error: jobErr } = await supabase
    .from("ml_catalog_migration_jobs")
    .insert({
      account_id: accountId,
      status: "idle",
      phase: "audit",
      cursor: {},
    })
    .select()
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || "Error creando job" }, { status: 500 })
  }

  console.log(`[CATALOG-MIGRATION] Job creado: ${job.id} account=${account.nickname}`)
  return NextResponse.json({ ok: true, jobId: job.id, resumed: false, job })
}
