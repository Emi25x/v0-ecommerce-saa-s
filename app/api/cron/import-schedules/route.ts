import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"
import { executeFullImport } from "@/lib/import/batch-import"
import { runCatalogImport } from "@/domains/suppliers/azeta/catalog-import"
import { runAzetaStockUpdate } from "@/domains/suppliers/azeta/stock-import"
import { runLibralStockImport } from "@/domains/suppliers/libral/stock-import"
import { runArnoiaStockImport } from "@/domains/suppliers/arnoia/stock-import"
import { requireCron } from "@/lib/auth/require-auth"
import { createStructuredLogger, genRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const cronAuth = await requireCron(request)
  if (cronAuth.error) return cronAuth.response

  const log = createStructuredLogger({ request_id: genRequestId() })
  log.info("Starting scheduled imports cron", "import_schedules.start")

  try {
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // Buscar schedules que necesitan ejecutarse
    const now = new Date()
    const nowISO = now.toISOString()
    const { data: schedules, error: schedulesError } = await supabaseAdmin
      .from("import_schedules")
      .select(
        `
        *,
        import_sources (*)
      `,
      )
      .eq("enabled", true)
      .lte("next_run_at", nowISO)

    if (schedulesError) {
      log.error("Error fetching schedules", schedulesError, "import_schedules.query_error")
      return NextResponse.json({ error: schedulesError.message }, { status: 500 })
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ message: "No hay importaciones programadas para ejecutar", executed: 0 })
    }

    log.info(`Executing ${schedules.length} scheduled imports`, "import_schedules.run", { count: schedules.length })

    const results = []

    for (const schedule of schedules) {
      try {
        const source = schedule.import_sources

        // ── Guard: skip deactivated sources ─────────────────────────────
        if (source.is_active === false) {
          log.info(`Skipping deactivated source: ${source.name}`, "import_schedules.skip_inactive")
          // Still advance next_run_at so we don't re-check every hour
          const nextRunAt = calculateNextRun(schedule)
          await supabaseAdmin
            .from("import_schedules")
            .update({ next_run_at: nextRunAt })
            .eq("id", schedule.id)
          results.push({ source: source.name, success: true, skipped: "source_inactive" })
          continue
        }

        // ── Guard: prevent duplicate execution (last_run < 5 min ago) ───
        if (schedule.last_run_at) {
          const lastRun = new Date(schedule.last_run_at)
          const minsSinceLastRun = (now.getTime() - lastRun.getTime()) / 60000
          if (minsSinceLastRun < 5) {
            log.info(`Skipping ${source.name} — last ran ${Math.round(minsSinceLastRun)}min ago`, "import_schedules.skip_recent")
            results.push({ source: source.name, success: true, skipped: "ran_recently" })
            continue
          }
        }

        log.info(`Importing source: ${source.name}`, "import_schedules.source", {
          source: source.name,
          feed_type: source.feed_type,
          source_key: source.source_key,
        })

        // ── Router: cada proveedor tiene su propio manejador ────────────
        const nameLower = source.name.toLowerCase()
        const isAzeta = nameLower.includes("azeta")
        const isArnoiaStock = nameLower.includes("arnoia") && source.feed_type === "stock_price"
        // Only feed_type="api" Libral sources use the Libral REST API importer.
        // "Libral Argentina" (feed_type="stock_price") goes through executeFullImport.
        const isLibralApi = source.feed_type === "api" && nameLower.includes("libral")
        let importResult: { success: boolean; created?: number; updated?: number; message?: string }

        if (isAzeta && source.feed_type === "stock_price") {
          const r = await runAzetaStockUpdate(source)
          importResult = {
            success: r.success,
            updated: r.updated,
            message: r.error ?? `${r.updated} actualizados, ${r.not_found} no encontrados`,
          }
        } else if (isAzeta) {
          const r = await runCatalogImport({ source_id: schedule.source_id })
          importResult = {
            success: r.success,
            created: r.created,
            updated: r.updated,
            message: r.error ?? `${r.created} creados, ${r.updated} actualizados`,
          }
        } else if (isArnoiaStock) {
          const r = await runArnoiaStockImport()
          importResult = {
            success: r.success,
            updated: r.updated,
            message: r.error ?? `${r.updated} actualizados, ${r.not_found} no encontrados`,
          }
        } else if (isLibralApi) {
          const sourceKey = source.source_key ?? "libral_argentina"
          const r = await runLibralStockImport(sourceKey)
          importResult = {
            success: r.success,
            updated: r.updated,
            message: r.error ?? `${r.updated} actualizados, ${r.zeroed} en cero`,
          }
        } else {
          // Generic path: Libral Argentina (stock_price), Arnoia catálogo, any CSV source
          importResult = await executeFullImport(schedule.source_id, source.feed_type)
        }

        // Calcular próxima ejecución y actualizar schedule
        const nextRunAt = calculateNextRun(schedule)

        await supabaseAdmin
          .from("import_schedules")
          .update({
            last_run_at: now.toISOString(),
            next_run_at: nextRunAt,
          })
          .eq("id", schedule.id)

        results.push({
          source: source.name,
          success: importResult.success,
          next_run_at: nextRunAt,
          result: importResult,
        })

        if (source.feed_type === "stock_price" && (importResult.success || (importResult.updated ?? 0) > 0)) {
          log.info("Stock import completed", "import_schedules.stock_done", {
            source: source.name,
            updated: importResult.updated,
          })
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error"
        log.error(`Error importing schedule ${schedule.id}`, error, "import_schedules.schedule_error", {
          schedule_id: schedule.id,
        })

        // Advance next_run_at even on error to avoid infinite retry loop
        try {
          const nextRunAt = calculateNextRun(schedule)
          await supabaseAdmin
            .from("import_schedules")
            .update({ next_run_at: nextRunAt })
            .eq("id", schedule.id)
        } catch { /* ignore update error */ }

        results.push({
          source: schedule.import_sources?.name || "Unknown",
          success: false,
          error: msg,
        })
      }
    }

    return NextResponse.json({
      message: `Ejecutadas ${schedules.length} importaciones`,
      executed: schedules.length,
      results,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    log.error("Fatal error in import schedules cron", error, "import_schedules.fatal")
    return NextResponse.json({ ok: false, error: { code: "internal_error", detail: msg } }, { status: 500 })
  }
}

// ── calculateNextRun ─────────────────────────────────────────────────────────
// Soporta: hourly, every_n_hours, daily, weekly, monthly
function calculateNextRun(schedule: {
  frequency: string
  hour?: number
  minute?: number
  day_of_week?: number
  day_of_month?: number
  interval_hours?: number
}): string {
  const now = new Date()
  const hours = schedule.hour ?? 0
  const minutes = schedule.minute ?? 0

  switch (schedule.frequency) {
    case "hourly": {
      // Próxima hora en punto (o minuto configurado)
      const nextRun = new Date(now)
      nextRun.setMinutes(minutes, 0, 0)
      if (nextRun <= now) {
        nextRun.setHours(nextRun.getHours() + 1)
      }
      return nextRun.toISOString()
    }

    case "every_n_hours": {
      // Cada N horas desde ahora
      const intervalH = schedule.interval_hours ?? 3
      const nextRun = new Date(now.getTime() + intervalH * 3600_000)
      nextRun.setMinutes(minutes, 0, 0)
      return nextRun.toISOString()
    }

    case "daily": {
      const nextRun = new Date(now)
      nextRun.setHours(hours, minutes, 0, 0)
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1)
      }
      return nextRun.toISOString()
    }

    case "weekly": {
      const nextRun = new Date(now)
      nextRun.setHours(hours, minutes, 0, 0)
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1)
      }
      const targetDay = schedule.day_of_week ?? 1
      const currentDay = nextRun.getDay()
      let daysToAdd = targetDay - currentDay
      if (daysToAdd < 0) daysToAdd += 7
      else if (daysToAdd === 0 && nextRun <= now) daysToAdd = 7
      nextRun.setDate(nextRun.getDate() + daysToAdd)
      return nextRun.toISOString()
    }

    case "monthly": {
      const nextRun = new Date(now)
      nextRun.setHours(hours, minutes, 0, 0)
      const targetDayOfMonth = schedule.day_of_month ?? 1
      nextRun.setDate(targetDayOfMonth)
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1)
        nextRun.setDate(targetDayOfMonth)
      }
      return nextRun.toISOString()
    }

    default: {
      // Fallback: daily
      const nextRun = new Date(now)
      nextRun.setHours(hours, minutes, 0, 0)
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1)
      }
      return nextRun.toISOString()
    }
  }
}
