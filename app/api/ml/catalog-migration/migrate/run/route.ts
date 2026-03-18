import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/db/admin"
import { mlFetchJson, isMlFetchError } from "@/domains/mercadolibre/api-client"
import { refreshTokenIfNeeded } from "@/lib/mercadolibre"
import { optinItemToCatalog } from "@/domains/mercadolibre/catalog-optin"

export const dynamic = "force-dynamic"
export const maxDuration = 55

// POST /api/ml/catalog-migration/migrate/run
// Aplica OPTIN a publicaciones tradicionales existentes usando el mismo mecanismo
// que ya existe en el sistema (POST /items/catalog_listings).
// NO crea publicaciones nuevas. Solo hace optin al catálogo.
// Si ML pausa la tradicional automáticamente, se registra sin reactivar.
// Body: { jobId, batchSize?: number }
export async function POST(req: NextRequest) {
  const { jobId, batchSize = 20 } = await req.json()
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
  const isDryRun = job.dry_run === true

  // Solo items que tienen resolve_status=resolved Y catalog_product_id (match único)
  // Las "Sin match" (not_found, ambiguous) quedan fuera siempre
  const { data: pending } = await supabase
    .from("ml_catalog_migration_items")
    .select("id, item_id, catalog_product_id, ean")
    .eq("job_id", jobId)
    .eq("is_candidate", true)
    .eq("resolve_status", "resolved")
    .not("catalog_product_id", "is", null)
    .eq("migrate_status", "pending")
    .limit(Math.min(batchSize, 50))

  if (!pending || pending.length === 0) {
    await supabase.from("ml_catalog_migration_jobs").update({
      status: "completed",
      phase: "migrate",
    }).eq("id", jobId)
    return NextResponse.json({ ok: true, done: true, processed: 0 })
  }

  let optin_ok = 0, skipped = 0, errors = 0

  for (const item of pending) {
    // Seguridad: nunca hacer optin sin catalog_product_id
    if (!item.catalog_product_id) {
      await supabase.from("ml_catalog_migration_items").update({
        migrate_status: "error",
        error: "catalog_product_id nulo — skip seguro",
      }).eq("id", item.id)
      errors++
      continue
    }

    // Dry run: solo marcar sin tocar ML
    if (isDryRun) {
      await supabase.from("ml_catalog_migration_items").update({
        migrate_status: "skipped",
        error: "dry_run",
      }).eq("id", item.id)
      skipped++
      continue
    }

    try {
      // Verificar estado actual del item antes del optin
      const currentItem = await mlFetchJson(
        `https://api.mercadolibre.com/items/${item.item_id}`,
        { accessToken },
        { account_id: job.account_id, op_name: `pre_optin_check_${item.item_id}` }
      )

      if (isMlFetchError(currentItem)) {
        await supabase.from("ml_catalog_migration_items").update({
          migrate_status: "error",
          error: `Error al leer item: ${currentItem.body_text?.slice(0, 300)}`,
        }).eq("id", item.id)
        errors++
        continue
      }

      // Si ya es catálogo, marcar como ok sin tocar
      if (currentItem.catalog_product_id) {
        await supabase.from("ml_catalog_migration_items").update({
          migrate_status: "optin_ok",
          error: "ya_era_catalogo",
        }).eq("id", item.id)
        optin_ok++
        continue
      }

      // Si está pausado, activar primero (igual que el mecanismo existente en /api/ml/publish)
      if (currentItem.status === "paused") {
        const activateRes = await fetch(`https://api.mercadolibre.com/items/${item.item_id}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "active" }),
        })
        if (!activateRes.ok) {
          const activateErr = await activateRes.json().catch(() => ({}))
          await supabase.from("ml_catalog_migration_items").update({
            migrate_status: "error",
            error: `Item pausado, no se pudo activar: ${JSON.stringify(activateErr).slice(0, 300)}`,
          }).eq("id", item.id)
          errors++
          continue
        }
        // Esperar igual que el mecanismo existente
        await new Promise((r) => setTimeout(r, 2000))
      }

      // OPTIN usando función compartida
      const optinResult = await optinItemToCatalog({
        itemId: item.item_id,
        catalogProductId: item.catalog_product_id,
        accessToken,
      })

      if (optinResult.ok) {
        // Verificar si ML pausó la tradicional automáticamente — registrar sin reactivar
        const postOptinCheck = await fetch(`https://api.mercadolibre.com/items/${item.item_id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const postOptinItem = postOptinCheck.ok ? await postOptinCheck.json().catch(() => ({})) : {}
        const traditionalPaused = postOptinItem.status === "paused"

        await supabase.from("ml_catalog_migration_items").update({
          migrate_status: "optin_ok",
          error: traditionalPaused
            ? `optin_ok — tradicional pausada automáticamente por ML (id=${item.item_id})`
            : null,
          catalog_product_id: optinResult.data?.catalog_product_id || item.catalog_product_id,
        }).eq("id", item.id)
        optin_ok++
      } else {
        console.error(`[CATALOG-MIGRATE] OPTIN error item=${item.item_id}:`, optinResult.error)
        await supabase.from("ml_catalog_migration_items").update({
          migrate_status: "optin_failed",
          error: optinResult.error,
        }).eq("id", item.id)
        errors++
      }
    } catch (err: any) {
      await supabase.from("ml_catalog_migration_items").update({
        migrate_status: "error",
        error: err.message?.slice(0, 400),
      }).eq("id", item.id)
      errors++
    }

    // Rate-limit: 400ms entre items (igual que mecanismo existente)
    await new Promise((r) => setTimeout(r, 400))
  }

  await supabase.from("ml_catalog_migration_jobs").update({
    migrated_count: (job.migrated_count ?? 0) + optin_ok,
    last_heartbeat_at: new Date().toISOString(),
  }).eq("id", jobId)

  const { count: remaining } = await supabase
    .from("ml_catalog_migration_items")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("is_candidate", true)
    .eq("resolve_status", "resolved")
    .eq("migrate_status", "pending")

  const done = (remaining ?? 0) === 0
  if (done) {
    await supabase.from("ml_catalog_migration_jobs").update({
      status: "completed",
      phase: "migrate",
    }).eq("id", jobId)
  }

  return NextResponse.json({
    ok: true,
    done,
    dry_run: isDryRun,
    batch_processed: pending.length,
    optin_ok,
    skipped,
    errors,
    remaining: remaining ?? 0,
  })
}
