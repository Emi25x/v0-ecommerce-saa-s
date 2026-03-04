import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mlFetchJson, isMlFetchError } from "@/lib/ml/http"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

export const dynamic = "force-dynamic"
export const maxDuration = 55

const BATCH_SIZE_DEFAULT = 200

// POST /api/ml/catalog-migration/audit/run
// Procesa un lote de items del seller paginando con scroll_id.
// Llamar en loop desde la UI hasta que done=true.
// Body: { jobId, batchSize?: number }
export async function POST(req: NextRequest) {
  const { jobId, batchSize = BATCH_SIZE_DEFAULT } = await req.json()
  if (!jobId) return NextResponse.json({ error: "jobId requerido" }, { status: 400 })

  const supabase = createAdminClient()

  const { data: job, error: jobErr } = await supabase
    .from("ml_catalog_migration_jobs")
    .select("*, ml_accounts(*)")
    .eq("id", jobId)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
  if (job.status === "canceled") return NextResponse.json({ ok: false, done: true, reason: "canceled" })
  if (job.status === "completed" && job.phase === "audit") {
    return NextResponse.json({ ok: true, done: true, reason: "already_completed", job })
  }

  // Marcar running
  await supabase.from("ml_catalog_migration_jobs")
    .update({ status: "running", last_heartbeat_at: new Date().toISOString() })
    .eq("id", jobId)

  const account = job.ml_accounts
  const validAccount = await refreshTokenIfNeeded(account)
  const accessToken = validAccount.access_token
  const mlUserId = validAccount.ml_user_id

  // Paginación por offset (scroll_id de ML no mantiene filtros y es poco fiable en cuentas grandes)
  const cursor = job.cursor || {}
  const offset: number = cursor.offset || 0
  const limit = Math.min(batchSize, 200) // ML max 200 por request

  // Fetch del listado de items del seller por offset
  const itemsUrl = `https://api.mercadolibre.com/users/${mlUserId}/items/search?offset=${offset}&limit=${limit}&status=active`

  const searchData = await mlFetchJson(itemsUrl, { accessToken }, { account_id: job.account_id, op_name: "catalog_audit_search" })

  if (isMlFetchError(searchData)) {
    await supabase.from("ml_catalog_migration_jobs").update({
      status: "failed",
      last_error: `Error buscando items ML: ${searchData.body_text?.slice(0, 300)}`,
    }).eq("id", jobId)
    return NextResponse.json({ ok: false, done: true, error: searchData.body_text?.slice(0, 300) }, { status: 502 })
  }

  const itemIds: string[] = searchData.results || []
  const paging = searchData.paging || {}
  const totalEstimated: number = paging.total || job.total_estimated || 0

  console.log(`[CATALOG-AUDIT-RUN] job=${jobId.slice(0,8)} offset=${offset} limit=${limit} got=${itemIds.length} total=${totalEstimated}`)

  // Si no hay más items, fase audit completada
  if (itemIds.length === 0) {
    await supabase.from("ml_catalog_migration_jobs").update({
      status: "completed",
      phase: "audit",
      total_estimated: totalEstimated,
      last_heartbeat_at: new Date().toISOString(),
    }).eq("id", jobId)
    return NextResponse.json({ ok: true, done: true, processed: 0, total_estimated: totalEstimated })
  }

  // Fetch detalles de cada item en sub-batches de 20 (límite ML multi-get)
  const SUB_BATCH = 20
  let batchProcessed = 0
  let batchAlreadyCatalog = 0
  let batchNoEan = 0
  let batchCandidates = 0

  for (let i = 0; i < itemIds.length; i += SUB_BATCH) {
    const subIds = itemIds.slice(i, i + SUB_BATCH)
    const detailUrl = `https://api.mercadolibre.com/items?ids=${subIds.join(",")}&attributes=id,catalog_product_id,attributes,status`

    const detailData = await mlFetchJson(detailUrl, { accessToken }, { account_id: job.account_id, op_name: "catalog_audit_detail" })
    if (isMlFetchError(detailData)) {
      console.error(`[CATALOG-AUDIT-RUN] Error detalle batch i=${i}:`, detailData.body_text?.slice(0, 200))
      continue
    }

    const entries: any[] = Array.isArray(detailData) ? detailData : []

    const upsertRows = entries
      .map((entry: any) => {
        const item = entry.body || entry
        if (!item?.id) return null

        const already_catalog = !!item.catalog_product_id
        const isActive = !item.status || item.status === "active"

        // Extraer EAN de attributes
        let ean: string | null = null
        if (item.attributes) {
          const gtinAttr = (item.attributes as any[]).find(
            (a: any) => a.id === "GTIN" || a.id === "EAN" || a.id === "ISBN"
          )
          if (gtinAttr?.value_name) ean = String(gtinAttr.value_name).replace(/\D/g, "") || null
        }

        const is_candidate = isActive && !already_catalog && !!ean && ean.length === 13

        if (already_catalog) batchAlreadyCatalog++
        else if (!ean) batchNoEan++
        if (is_candidate) batchCandidates++
        batchProcessed++

        return {
          job_id: jobId,
          account_id: job.account_id,
          item_id: item.id,
          ean,
          is_catalog: already_catalog,
          is_candidate,
          catalog_product_id: item.catalog_product_id || null,
          resolve_status: "pending",
          migrate_status: "pending",
        }
      })
      .filter(Boolean) as any[]

    if (upsertRows.length > 0) {
      await supabase
        .from("ml_catalog_migration_items")
        .upsert(upsertRows, { onConflict: "job_id,item_id", ignoreDuplicates: false })
    }
  }

  // Calcular nuevo cursor — siempre por offset
  const newOffset = offset + itemIds.length
  const newCursor = { offset: newOffset }

  // Fin real: recibimos menos items que el limit O ya llegamos al total conocido
  const cumulativeProcessed = job.processed_count + batchProcessed
  const isLastPage = itemIds.length < limit || (totalEstimated > 0 && newOffset >= totalEstimated)

  console.log(`[CATALOG-AUDIT-RUN] newOffset=${newOffset} cumulative=${cumulativeProcessed} isLastPage=${isLastPage}`)

  // Actualizar job
  await supabase.from("ml_catalog_migration_jobs").update({
    status: isLastPage ? "completed" : "running",
    phase: "audit",
    total_estimated: totalEstimated || job.total_estimated,
    processed_count: cumulativeProcessed,
    already_catalog_count: job.already_catalog_count + batchAlreadyCatalog,
    no_ean_count: job.no_ean_count + batchNoEan,
    candidates_count: job.candidates_count + batchCandidates,
    cursor: newCursor,
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", jobId)

  return NextResponse.json({
    ok: true,
    done: isLastPage,
    batch_processed: batchProcessed,
    batch_candidates: batchCandidates,
    batch_already_catalog: batchAlreadyCatalog,
    batch_no_ean: batchNoEan,
    total_estimated: totalEstimated || job.total_estimated,
    cumulative_processed: cumulativeProcessed,
    new_offset: newOffset,
  })
}
