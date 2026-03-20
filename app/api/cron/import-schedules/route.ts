import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
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

    // Buscar schedules que necesitan ejecutarse
    const now = new Date().toISOString()
    const { data: schedules, error: schedulesError } = await supabase
      .from("import_schedules")
      .select(
        `
        *,
        import_sources (*)
      `,
      )
      .eq("enabled", true)
      .lte("next_run_at", now)

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
        log.info(`Importing source: ${source.name}`, "import_schedules.source", {
          source: source.name,
          feed_type: source.feed_type,
        })

        // Rutear según proveedor: cada proveedor tiene su propio manejador
        const nameLower = source.name.toLowerCase()
        const isAzeta = nameLower.includes("azeta")
        const isArnoiaStock = nameLower.includes("arnoia") && source.feed_type === "stock_price"
        // Only feed_type="api" sources use the Libral API importer.
        // "Libral Argentina" (feed_type="stock_price") goes through executeFullImport.
        const isLibral = source.feed_type === "api"
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
        } else if (isLibral) {
          const sourceKey = source.source_key ?? "libral"
          const r = await runLibralStockImport(sourceKey)
          importResult = {
            success: r.success,
            updated: r.updated,
            message: r.error ?? `${r.updated} actualizados, ${r.zeroed} en cero`,
          }
        } else {
          importResult = await executeFullImport(schedule.source_id, source.feed_type)
        }

        // Calcular próxima ejecución
        const nextRunAt = calculateNextRun(schedule)

        // Actualizar schedule
        await supabase
          .from("import_schedules")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt,
          })
          .eq("id", schedule.id)

        results.push({
          source: schedule.import_sources.name,
          success: importResult.success,
          result: importResult,
        })

        if (source.feed_type === "stock_price" && (importResult.success || (importResult.updated ?? 0) > 0)) {
          log.info("Stock import completed, ML sync pending", "import_schedules.stock_done", {
            source: source.name,
          })
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error"
        log.error(`Error importing schedule ${schedule.id}`, error, "import_schedules.schedule_error", {
          schedule_id: schedule.id,
        })
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

function calculateNextRun(schedule: {
  frequency: string
  hour?: number
  minute?: number
  day_of_week?: number
  day_of_month?: number
}): string {
  const now = new Date()

  const hours = schedule.hour || 0
  const minutes = schedule.minute || 0

  const nextRun = new Date(now)
  nextRun.setHours(hours, minutes, 0, 0)

  // Si la hora ya pasó hoy, empezar desde mañana
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1)
  }

  switch (schedule.frequency) {
    case "daily":
      break

    case "weekly": {
      const targetDay = schedule.day_of_week || 1
      const currentDay = nextRun.getDay()
      let daysToAdd = targetDay - currentDay

      if (daysToAdd < 0) {
        daysToAdd += 7
      } else if (daysToAdd === 0 && nextRun <= now) {
        daysToAdd = 7
      }

      nextRun.setDate(nextRun.getDate() + daysToAdd)
      break
    }

    case "monthly": {
      const targetDayOfMonth = schedule.day_of_month || 1
      nextRun.setDate(targetDayOfMonth)

      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1)
        nextRun.setDate(targetDayOfMonth)
      }
      break
    }
  }

  return nextRun.toISOString()
}
