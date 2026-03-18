import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mlFetchJson, isMlFetchError } from "@/domains/mercadolibre/api-client"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

export const dynamic = "force-dynamic"
export const maxDuration = 55

// POST /api/ml/catalog-migration/resolve/run
// Busca catalog_product_id en ML por EAN para un lote de candidatos pendientes.
// Solo acepta match exacto único — ambiguo o no encontrado se marca como tal.
// Body: { jobId, batchSize?: number }
export async function POST(req: NextRequest) {
  const { jobId, batchSize = 50 } = await req.json()
  if (!jobId) return NextResponse.json({ error: "jobId requerido" }, { status: 400 })

  const supabase = createAdminClient()

  const { data: job } = await supabase
    .from("ml_catalog_migration_jobs")
    .select("*, ml_accounts(*)")
    .eq("id", jobId)
    .single()

  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
  if (job.status === "canceled") return NextResponse.json({ ok: false, done: true, reason: "canceled" })

  await supabase.from("ml_catalog_migration_jobs")
    .update({ status: "running", last_heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)

  const account = job.ml_accounts
  const validAccount = await refreshTokenIfNeeded(account)
  const accessToken = validAccount.access_token

  // Obtener candidatos pendientes de resolver
  const { data: pending } = await supabase
    .from("ml_catalog_migration_items")
    .select("id, item_id, ean")
    .eq("job_id", jobId)
    .eq("is_candidate", true)
    .eq("resolve_status", "pending")
    .limit(batchSize)

  if (!pending || pending.length === 0) {
    await supabase.from("ml_catalog_migration_jobs").update({
      status: "completed",
      phase: "resolve_catalog_product",
    }).eq("id", jobId)
    return NextResponse.json({ ok: true, done: true, processed: 0 })
  }

  let resolved = 0, notFound = 0, ambiguous = 0, errors = 0

  for (const item of pending) {
    if (!item.ean) {
      await supabase.from("ml_catalog_migration_items")
        .update({ resolve_status: "not_found", error: "EAN nulo" })
        .eq("id", item.id)
      notFound++
      continue
    }

    try {
      // Buscar en ML catalog por GTIN
      const site = account.ml_accounts?.site_id || "MLA"
      const searchUrl = `https://api.mercadolibre.com/products/search?status=active&site_id=${site}&GTIN=${item.ean}&limit=5`
      const searchData = await mlFetchJson(searchUrl, { accessToken }, { account_id: job.account_id, op_name: `resolve_ean_${item.ean}` })

      if (isMlFetchError(searchData)) {
        await supabase.from("ml_catalog_migration_items").update({
          resolve_status: "error",
          error: searchData.body_text?.slice(0, 300),
        }).eq("id", item.id)
        errors++
        continue
      }

      const results: any[] = searchData.results || []

      if (results.length === 0) {
        await supabase.from("ml_catalog_migration_items").update({ resolve_status: "not_found" }).eq("id", item.id)
        notFound++
      } else if (results.length === 1) {
        await supabase.from("ml_catalog_migration_items").update({
          resolve_status: "resolved",
          catalog_product_id: results[0].id,
        }).eq("id", item.id)
        resolved++
      } else {
        // Múltiples matches — ambiguo, no migrar
        await supabase.from("ml_catalog_migration_items").update({
          resolve_status: "ambiguous",
          error: `${results.length} matches para EAN ${item.ean}`,
        }).eq("id", item.id)
        ambiguous++
      }
    } catch (err: any) {
      await supabase.from("ml_catalog_migration_items").update({
        resolve_status: "error",
        error: err.message?.slice(0, 300),
      }).eq("id", item.id)
      errors++
    }

    // Rate-limit gentil
    await new Promise((r) => setTimeout(r, 150))
  }

  // Actualizar contadores del job
  await supabase.from("ml_catalog_migration_jobs").update({
    resolved_count: job.resolved_count + resolved,
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", jobId)

  // Verificar si quedan pendientes
  const { count: remaining } = await supabase
    .from("ml_catalog_migration_items")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("is_candidate", true)
    .eq("resolve_status", "pending")

  const done = (remaining ?? 0) === 0

  if (done) {
    await supabase.from("ml_catalog_migration_jobs").update({
      status: "completed",
      phase: "resolve_catalog_product",
    }).eq("id", jobId)
  }

  return NextResponse.json({
    ok: true,
    done,
    batch_processed: pending.length,
    resolved,
    not_found: notFound,
    ambiguous,
    errors,
    remaining: remaining ?? 0,
  })
}
