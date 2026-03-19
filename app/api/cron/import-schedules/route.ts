import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { executeFullImport } from "@/lib/import/batch-import"
import { runCatalogImport } from "@/domains/suppliers/azeta/catalog-import"
import { runAzetaStockUpdate } from "@/domains/suppliers/azeta/stock-import"
import { runLibralStockImport } from "@/domains/suppliers/libral/stock-import"
import { runArnoiaStockImport } from "@/domains/suppliers/arnoia/stock-import"
import { requireCron } from "@/lib/auth/require-auth"
// TODO: Implementar sync ML como función directa en lugar de fetch
// import { syncStockWithML } from "@/lib/ml/sync-stock"

// Este endpoint debe ser llamado por un cron job (ej: Vercel Cron)
// Configurar en vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/import-schedules",
//     "schedule": "0 * * * *"  // Cada hora
//   }]
// }

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const cronAuth = await requireCron(request)
  if (cronAuth.error) return cronAuth.response

  try {
    console.log("[v0] Ejecutando cron job de importaciones programadas")

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
      console.error("[v0] Error obteniendo schedules:", schedulesError)
      return NextResponse.json({ error: schedulesError.message }, { status: 500 })
    }

    if (!schedules || schedules.length === 0) {
      console.log("[v0] No hay importaciones programadas para ejecutar")
      return NextResponse.json({ message: "No hay importaciones programadas para ejecutar", executed: 0 })
    }

    console.log(`[v0] Ejecutando ${schedules.length} importaciones programadas`)

    const results = []

    for (const schedule of schedules) {
      try {
        const source = schedule.import_sources
        console.log(`[v0] Ejecutando importación para fuente: ${source.name} (feed_type: ${source.feed_type})`)

        // Rutear según proveedor: cada proveedor tiene su propio manejador
        const nameLower = source.name.toLowerCase()
        const isAzeta = nameLower.includes("azeta")
        const isArnoiaStock = nameLower.includes("arnoia") && source.feed_type === "stock_price"
        // Only feed_type="api" sources use the Libral API importer.
        // "Libral Argentina" (feed_type="stock_price") goes through executeFullImport.
        const isLibral = source.feed_type === "api"
        let importResult: { success: boolean; created?: number; updated?: number; message?: string }

        if (isAzeta && source.feed_type === "stock_price") {
          // Stock Azeta: usa bulk_update_azeta_stock RPC para no afectar otros proveedores
          console.log(`[v0] Ejecutando actualización de stock AZETA para ${source.name}`)
          const r = await runAzetaStockUpdate(source)
          importResult = {
            success: r.success,
            updated: r.updated,
            message: r.error ?? `${r.updated} actualizados, ${r.not_found} no encontrados`,
          }
        } else if (isAzeta) {
          // Catálogo/parcial Azeta: ZIP + latin1 + EAN normalization
          console.log(`[v0] Ejecutando importación catálogo AZETA para ${source.name}`)
          const r = await runCatalogImport({ source_id: schedule.source_id })
          importResult = {
            success: r.success,
            created: r.created,
            updated: r.updated,
            message: r.error ?? `${r.created} creados, ${r.updated} actualizados`,
          }
        } else if (isArnoiaStock) {
          // Arnoia Stock: CSV latin1, actualiza via bulk_update_stock_price RPC
          console.log(`[v0] Ejecutando actualización de stock ARNOIA para ${source.name}`)
          const r = await runArnoiaStockImport()
          importResult = {
            success: r.success,
            updated: r.updated,
            message: r.error ?? `${r.updated} actualizados, ${r.not_found} no encontrados`,
          }
        } else if (isLibral) {
          // Libral: API JSON con paginación, usa admin client para bypassear RLS
          const sourceKey = source.source_key ?? "libral"
          console.log(`[v0] Ejecutando importación stock LIBRAL para ${source.name} (source_key: ${sourceKey})`)
          const r = await runLibralStockImport(sourceKey)
          importResult = {
            success: r.success,
            updated: r.updated,
            message: r.error ?? `${r.updated} actualizados, ${r.zeroed} en cero`,
          }
        } else {
          // Resto de proveedores: importador genérico CSV (incluye Arnoia catalog, Libral Argentina)
          console.log(`[v0] Ejecutando importación directa para ${source.name}`)
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

        // TODO: Si es una importación de stock/precio, sincronizar con ML
        // Esto se implementará como función directa cuando el cron funcione en producción
        if (source.feed_type === "stock_price" && (importResult.success || (importResult.updated ?? 0) > 0)) {
          console.log(
            `[v0] Importación de stock completada. Sync con ML pendiente de implementar como función directa.`,
          )
          // La sincronización con ML se puede hacer manualmente desde la UI por ahora
        }
      } catch (error: any) {
        console.error(`[v0] Error ejecutando importación para schedule ${schedule.id}:`, error)
        results.push({
          source: schedule.import_sources?.name || "Unknown",
          success: false,
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      message: `Ejecutadas ${schedules.length} importaciones`,
      executed: schedules.length,
      results,
    })
  } catch (error: any) {
    console.error("[v0] Error en cron de importaciones:", error)
    return NextResponse.json(
      {
        error: error.message || "Error desconocido",
        details: error.toString(),
      },
      { status: 500 },
    )
  }
}

function calculateNextRun(schedule: any): string {
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
      // Ya está configurado para mañana si es necesario
      break

    case "weekly":
      // Ajustar al día de la semana especificado
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

    case "monthly":
      // Ajustar al día del mes especificado
      const targetDayOfMonth = schedule.day_of_month || 1
      nextRun.setDate(targetDayOfMonth)

      // Si ya pasó este mes, ir al próximo mes
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1)
        nextRun.setDate(targetDayOfMonth)
      }
      break
  }

  return nextRun.toISOString()
}
