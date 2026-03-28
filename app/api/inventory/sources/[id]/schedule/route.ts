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

      const scheduleData: Record<string, unknown> = {
        frequency,
        timezone,
        hour,
        minute,
        day_of_week: dayOfWeek ?? null,
        day_of_month: dayOfMonth ?? null,
        enabled: true,
        next_run_at: nextRunAt,
        updated_at: new Date().toISOString(),
      }
      // Only include interval_hours if frequency requires it (column may not exist yet)
      if (frequency === "every_n_hours" && interval_hours) {
        scheduleData.interval_hours = interval_hours
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
  // Calculate the next run time correctly handling timezone.
  // The hour/minute are in the configured timezone (e.g., 16:00 Argentina).
  // We need to store next_run_at in UTC.

  const tz = schedule.timezone || "America/Argentina/Buenos_Aires"

  // Get current time in target timezone
  const nowUTC = new Date()
  const nowInTz = new Date(nowUTC.toLocaleString("en-US", { timeZone: tz }))

  // Build target date/time in the timezone
  const targetInTz = new Date(nowInTz)
  targetInTz.setHours(schedule.hour, schedule.minute, 0, 0)

  switch (schedule.frequency) {
    case "hourly":
      if (targetInTz <= nowInTz) {
        targetInTz.setHours(targetInTz.getHours() + 1)
      }
      break
    case "daily":
      if (targetInTz <= nowInTz) {
        targetInTz.setDate(targetInTz.getDate() + 1)
      }
      break
    case "weekly":
      if (schedule.dayOfWeek !== null && schedule.dayOfWeek !== undefined) {
        const currentDay = targetInTz.getDay()
        let daysToAdd = schedule.dayOfWeek - currentDay
        if (daysToAdd < 0 || (daysToAdd === 0 && targetInTz <= nowInTz)) {
          daysToAdd += 7
        }
        targetInTz.setDate(targetInTz.getDate() + daysToAdd)
      } else if (targetInTz <= nowInTz) {
        targetInTz.setDate(targetInTz.getDate() + 7)
      }
      break
    case "monthly":
      if (schedule.dayOfMonth !== null && schedule.dayOfMonth !== undefined) {
        targetInTz.setDate(schedule.dayOfMonth)
        if (targetInTz <= nowInTz) {
          targetInTz.setMonth(targetInTz.getMonth() + 1)
          targetInTz.setDate(schedule.dayOfMonth)
        }
      } else if (targetInTz <= nowInTz) {
        targetInTz.setMonth(targetInTz.getMonth() + 1)
      }
      break
  }

  // Convert from timezone-local back to UTC.
  // The difference between nowUTC and nowInTz gives us the offset.
  const offsetMs = nowUTC.getTime() - nowInTz.getTime()
  const nextRunUTC = new Date(targetInTz.getTime() + offsetMs)

  return nextRunUTC.toISOString()
}
