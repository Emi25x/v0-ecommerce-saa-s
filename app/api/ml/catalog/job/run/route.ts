import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { mlFetchJson, isMlFetchError } from "@/domains/mercadolibre/api-client"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"

export const dynamic = "force-dynamic"
export const maxDuration = 55

// POST /api/ml/catalog/job/run
// Procesa un batch de items del job. Llamar múltiples veces hasta done=true
// Body: { job_id, batch_size?: number }
export async function POST(req: NextRequest) {
  const { job_id, batch_size = 10 } = await req.json()
  if (!job_id) return NextResponse.json({ error: "job_id requerido" }, { status: 400 })

  const supabase = createAdminClient()

  // Obtener el job y la cuenta
  const { data: job, error: jobErr } = await supabase
    .from("ml_catalog_jobs")
    .select("*, ml_accounts(*)")
    .eq("id", job_id)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 })
  if (job.status === "completed") return NextResponse.json({ ok: true, done: true, message: "Job ya completado" })
  if (job.status === "failed") return NextResponse.json({ error: "Job en estado failed", done: true }, { status: 400 })

  // Marcar como running si estaba idle
  if (job.status === "idle") {
    await supabase.from("ml_catalog_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job_id)
  }

  const account = job.ml_accounts
  const validAccount = await refreshTokenIfNeeded(account)
  const accessToken = validAccount.access_token

  // Obtener próximo batch de items pendientes
  const { data: pendingItems, error: pendingErr } = await supabase
    .from("ml_catalog_job_items")
    .select("*")
    .eq("job_id", job_id)
    .eq("status", "pending")
    .limit(batch_size)

  if (pendingErr) return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  if (!pendingItems || pendingItems.length === 0) {
    // No quedan pendientes — marcar completado
    await supabase.from("ml_catalog_jobs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
    }).eq("id", job_id)
    return NextResponse.json({ ok: true, done: true, processed: 0 })
  }

  const batchResults: any[] = []

  for (const item of pendingItems) {
    try {
      // Items que deben skipearse — no tocar ML
      if (item.action !== "create_new_catalog_item") {
        await supabase.from("ml_catalog_job_items").update({ status: "skipped" }).eq("id", item.id)
        batchResults.push({ id: item.id, old_item_id: item.old_item_id, status: "skipped", action: item.action })
        continue
      }

      // Seguridad: no procesar sin catalog_product_id
      if (!item.catalog_product_id) {
        await supabase.from("ml_catalog_job_items").update({
          status: "failed",
          error: "Sin catalog_product_id — skip seguro",
        }).eq("id", item.id)
        batchResults.push({ id: item.id, old_item_id: item.old_item_id, status: "failed", error: "Sin catalog_product_id" })
        continue
      }

      // Dry run — no tocar ML, marcar como skipped con nota
      if (job.mode === "dry_run") {
        await supabase.from("ml_catalog_job_items").update({
          status: "skipped",
          error: "dry_run: no ejecutado",
        }).eq("id", item.id)
        batchResults.push({ id: item.id, old_item_id: item.old_item_id, status: "skipped", action: "dry_run" })
        continue
      }

      // LIVE: obtener el item original para replicar precio/stock/envíos
      const oldItemData = await mlFetchJson(
        `https://api.mercadolibre.com/items/${item.old_item_id}`,
        { accessToken },
        { account_id: job.account_id, op_name: `get_old_item_${item.old_item_id}` }
      )

      if (isMlFetchError(oldItemData)) {
        await supabase.from("ml_catalog_job_items").update({
          status: "failed",
          error: `Error obteniendo item original: ${oldItemData.body_text?.slice(0, 200)}`,
        }).eq("id", item.id)
        batchResults.push({ id: item.id, status: "failed" })
        continue
      }

      // Construir payload del nuevo item de catálogo
      const newItemPayload: any = {
        catalog_product_id: item.catalog_product_id,
        condition: oldItemData.condition || "new",
        price: oldItemData.price,
        available_quantity: oldItemData.available_quantity || 1,
        buying_mode: "buy_it_now",
        listing_type_id: oldItemData.listing_type_id || "gold_special",
        shipping: oldItemData.shipping || { mode: "me2", free_shipping: false },
      }

      // Crear nuevo item de catálogo en ML
      const newItem = await mlFetchJson(
        "https://api.mercadolibre.com/items",
        { accessToken, method: "POST", body: newItemPayload },
        { account_id: job.account_id, op_name: `create_catalog_item_${item.old_item_id}` }
      )

      if (isMlFetchError(newItem)) {
        await supabase.from("ml_catalog_job_items").update({
          status: "failed",
          error: newItem.body_text?.slice(0, 500) || "Error creando item",
        }).eq("id", item.id)
        batchResults.push({ id: item.id, status: "failed", error: newItem.body_text?.slice(0, 200) })
        continue
      }

      const newItemId = newItem.id
      // Pausar item antiguo
      await mlFetchJson(
        `https://api.mercadolibre.com/items/${item.old_item_id}`,
        { accessToken, method: "PUT", body: { status: "paused" } },
        { account_id: job.account_id, op_name: `pause_old_item_${item.old_item_id}` }
      )

      await supabase.from("ml_catalog_job_items").update({
        status: "ok",
        new_item_id: newItemId,
      }).eq("id", item.id)

      batchResults.push({ id: item.id, old_item_id: item.old_item_id, new_item_id: newItemId, status: "ok" })

      // Pausa para rate limit
      await new Promise((r) => setTimeout(r, 300))

    } catch (err: any) {
      await supabase.from("ml_catalog_job_items").update({
        status: "failed",
        error: err.message?.slice(0, 500),
      }).eq("id", item.id)
      batchResults.push({ id: item.id, status: "failed", error: err.message })
    }
  }

  // Actualizar contadores del job
  const doneCount = batchResults.filter((r) => r.status === "ok" || r.status === "skipped").length
  const failedCount = batchResults.filter((r) => r.status === "failed").length

  await supabase.from("ml_catalog_jobs")
    .update({
      processed: job.processed + batchResults.length,
      success: job.success + doneCount,
      failed: job.failed + failedCount,
    })
    .eq("id", job_id)

  // Verificar si quedan pendientes
  const { count: remainingCount } = await supabase
    .from("ml_catalog_job_items")
    .select("*", { count: "exact", head: true })
    .eq("job_id", job_id)
    .eq("status", "pending")

  const done = (remainingCount ?? 0) === 0

  if (done) {
    await supabase.from("ml_catalog_jobs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
    }).eq("id", job_id)
  }

  return NextResponse.json({
    ok: true,
    done,
    batch_processed: batchResults.length,
    batch_ok: doneCount,
    batch_failed: failedCount,
    remaining: remainingCount ?? 0,
    results: batchResults,
  })
}
