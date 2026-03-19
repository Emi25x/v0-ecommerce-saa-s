import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    })

    const body = await request.json()
    const { enabled, frequency, timezone, hour: hourNum, minute: minuteNum, dayOfWeek, dayOfMonth } = body
    const sourceId = id

    console.log("[v0] POST /api/inventory/sources/[id]/schedule - Datos recibidos:", {
      sourceId,
      body,
    })

    const hour = hourNum
    const minute = minuteNum

    console.log("[v0] Hora y minutos:", { hour, minute, dayOfWeek, dayOfMonth })

    if (enabled) {
      const nextRunAt = calculateNextRun({ frequency, hour, minute, timezone, dayOfWeek, dayOfMonth })

      console.log("[v0] Próxima ejecución calculada:", nextRunAt)

      const { data: existing } = await supabase
        .from("import_schedules")
        .select("id")
        .eq("source_id", sourceId)
        .maybeSingle()

      console.log("[v0] Schedule existente:", existing)

      if (existing) {
        console.log("[v0] Actualizando schedule existente con:", {
          frequency,
          timezone,
          hour,
          minute,
          day_of_week: dayOfWeek,
          day_of_month: dayOfMonth,
          enabled: true,
          next_run_at: nextRunAt,
        })

        const { data, error } = await supabase
          .from("import_schedules")
          .update({
            frequency,
            timezone,
            hour,
            minute,
            day_of_week: dayOfWeek,
            day_of_month: dayOfMonth,
            enabled: true,
            next_run_at: nextRunAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()

        if (error) throw error

        console.log("[v0] Schedule actualizado exitosamente:", data)
      } else {
        console.log("[v0] Creando nuevo schedule con:", {
          source_id: sourceId,
          frequency,
          timezone,
          hour,
          minute,
          day_of_week: dayOfWeek,
          day_of_month: dayOfMonth,
          enabled: true,
          next_run_at: nextRunAt,
        })

        const { data, error } = await supabase
          .from("import_schedules")
          .insert({
            source_id: sourceId,
            frequency,
            timezone,
            hour,
            minute,
            day_of_week: dayOfWeek,
            day_of_month: dayOfMonth,
            enabled: true,
            next_run_at: nextRunAt,
          })
          .select()

        if (error) throw error

        console.log("[v0] Schedule creado exitosamente:", data)
      }
    } else {
      // Desactivar programación
      console.log("[v0] Desactivando schedule para source:", sourceId)

      const { error } = await supabase.from("import_schedules").update({ enabled: false }).eq("source_id", sourceId)

      if (error) throw error

      console.log("[v0] Schedule desactivado exitosamente")
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
