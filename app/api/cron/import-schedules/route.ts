import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { executeFullImport } from "@/lib/import/batch-import"
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

export async function GET(request: Request) {
  try {
    // Verificar CRON_SECRET solo si está configurado
    // En Vercel, los crons están protegidos por defecto (solo Vercel puede invocarlos)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    // Solo verificar si CRON_SECRET está configurado Y la petición viene con auth header
    if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
      console.log("[v0] Cron job no autorizado - secret incorrecto")
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    console.log("[v0] Ejecutando cron job de importaciones programadas")

    const supabase = await createClient()

    // Buscar schedules que necesitan ejecutarse
    const now = new Date().toISOString()
    const { data: schedules, error: schedulesError } = await supabase
      .from("import_schedules")
      .select(`
        *,
        import_sources (*)
      `)
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

        // Ejecutar importación directamente (sin fetch interno)
        console.log(`[v0] Ejecutando importación directa para ${source.name}`)
        const importResult = await executeFullImport(schedule.source_id, source.feed_type)

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
        if (source.feed_type === "stock_price" && (importResult.success || importResult.updated > 0)) {
          console.log(`[v0] Importación de stock completada. Sync con ML pendiente de implementar como función directa.`)
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
