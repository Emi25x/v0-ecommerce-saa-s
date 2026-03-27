import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/db/server"
import { createAdminClient } from "@/lib/db/admin"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Accept both user auth and cron auth
  const supabaseUser = await createClient()
  const { data: { user } } = await supabaseUser.auth.getUser()

  const cronHeader = request.headers.get("authorization")
  const isCron = cronHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!user && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { id: sourceId } = await params
  try {
    const body = await request.json()
    const { enabled, frequency, timezone, hour: hourNum, minute: minuteNum, dayOfWeek, dayOfMonth, interval_hours } = body

    const hour = hourNum ?? 0
    const minute = minuteNum ?? 0

    if (enabled) {
      const nextRunAt = calculateNextRun({ frequency, hour, minute, timezone, dayOfWeek, dayOfMonth })

      const { data: existing } = await supabase
        .from("import_schedules")
        .select("id")
        .eq("source_id", sourceId)
        .maybeSingle()

      console.log("[v0] Schedule existente:", existing)

      const scheduleData = {
        frequency,
        timezone,
        hour,
        minute,
        day_of_week: dayOfWeek ?? null,
        day_of_month: dayOfMonth ?? null,
        interval_hours: interval_hours ?? null,
        enabled: true,
        next_run_at: nextRunAt,
        updated_at: new Date().toISOString(),
      }

      if (existing) {
        const { error } = await supabase
          .from("import_schedules")
          .update(scheduleData)
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("import_schedules")
          .insert({ source_id: sourceId, ...scheduleData })
        if (error) throw error
      }
    } else {
      const { error } = await supabase.from("import_schedules").update({ enabled: false }).eq("source_id", sourceId)
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Error saving schedule:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function calculateNextRun(schedule: {
  frequency: string
  hour: number
  minute: number
  timezone: string
  dayOfWeek?: number | null
  dayOfMonth?: number | null
}): string {
  const now = new Date()

  // Convertir la hora actual a la zona horaria configurada
  const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: schedule.timezone }))

  const nextRun = new Date(nowInTimezone)
  nextRun.setHours(schedule.hour, schedule.minute, 0, 0)

  switch (schedule.frequency) {
    case "hourly":
      // Ejecutar en la próxima hora
      if (nextRun <= nowInTimezone) {
        nextRun.setHours(nextRun.getHours() + 1)
      }
      break

    case "daily":
      // Si la hora ya pasó hoy, programar para mañana
      if (nextRun <= nowInTimezone) {
        nextRun.setDate(nextRun.getDate() + 1)
      }
      break

    case "weekly":
      // Programar para el día de la semana especificado
      if (schedule.dayOfWeek !== null && schedule.dayOfWeek !== undefined) {
        const currentDay = nextRun.getDay()
        let daysUntilTarget = schedule.dayOfWeek - currentDay

        // Si el día ya pasó esta semana, programar para la próxima semana
        if (daysUntilTarget < 0 || (daysUntilTarget === 0 && nextRun <= nowInTimezone)) {
          daysUntilTarget += 7
        }

        nextRun.setDate(nextRun.getDate() + daysUntilTarget)
      } else {
        // Si no hay día especificado, ejecutar en 7 días
        if (nextRun <= nowInTimezone) {
          nextRun.setDate(nextRun.getDate() + 7)
        }
      }
      break

    case "monthly":
      // Programar para el día del mes especificado
      if (schedule.dayOfMonth !== null && schedule.dayOfMonth !== undefined) {
        nextRun.setDate(schedule.dayOfMonth)

        // Si el día ya pasó este mes, programar para el próximo mes
        if (nextRun <= nowInTimezone) {
          nextRun.setMonth(nextRun.getMonth() + 1)
          nextRun.setDate(schedule.dayOfMonth)
        }
      } else {
        // Si no hay día especificado, ejecutar en 30 días
        if (nextRun <= nowInTimezone) {
          nextRun.setMonth(nextRun.getMonth() + 1)
        }
      }
      break
  }

  return nextRun.toISOString()
}
