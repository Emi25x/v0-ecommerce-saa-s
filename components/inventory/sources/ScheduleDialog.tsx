"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, CalendarClock } from "lucide-react"

interface ScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: { id: string; name: string; schedules?: any[] } | null
  onSaved: () => void
}

const FREQUENCIES = [
  { value: "hourly", label: "Cada hora" },
  { value: "every_n_hours", label: "Cada N horas" },
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
]

const DAYS_OF_WEEK = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
]

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, "0"),
}))

const MINUTES = [
  { value: "0", label: "00" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
]

const INTERVAL_OPTIONS = [
  { value: "2", label: "Cada 2 horas" },
  { value: "3", label: "Cada 3 horas" },
  { value: "4", label: "Cada 4 horas" },
  { value: "6", label: "Cada 6 horas" },
  { value: "8", label: "Cada 8 horas" },
  { value: "12", label: "Cada 12 horas" },
]

export function ScheduleDialog({ open, onOpenChange, source, onSaved }: ScheduleDialogProps) {
  const [enabled, setEnabled] = useState(false)
  const [frequency, setFrequency] = useState("daily")
  const [hour, setHour] = useState("9")
  const [minute, setMinute] = useState("0")
  const [dayOfWeek, setDayOfWeek] = useState("1")
  const [dayOfMonth, setDayOfMonth] = useState("1")
  const [intervalHours, setIntervalHours] = useState("3")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing schedule when dialog opens
  useEffect(() => {
    if (!source) return
    const existing = source.schedules?.[0]
    if (existing) {
      setEnabled(existing.enabled ?? false)
      setFrequency(existing.frequency ?? "daily")
      setHour(String(existing.hour ?? 9))
      setMinute(String(existing.minute ?? 0))
      setDayOfWeek(String(existing.day_of_week ?? 1))
      setDayOfMonth(String(existing.day_of_month ?? 1))
      setIntervalHours(String(existing.interval_hours ?? 3))
    } else {
      setEnabled(false)
      setFrequency("daily")
      setHour("9")
      setMinute("0")
      setDayOfWeek("1")
      setDayOfMonth("1")
      setIntervalHours("3")
    }
    setError(null)
  }, [source, open])

  async function handleSave() {
    if (!source) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/inventory/sources/${source.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          frequency,
          timezone: "America/Argentina/Buenos_Aires",
          hour: parseInt(hour),
          minute: parseInt(minute),
          dayOfWeek: frequency === "weekly" ? parseInt(dayOfWeek) : null,
          dayOfMonth: frequency === "monthly" ? parseInt(dayOfMonth) : null,
          interval_hours: frequency === "every_n_hours" ? parseInt(intervalHours) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al guardar")
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const existing = source?.schedules?.[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Programar ejecución
          </DialogTitle>
          {source && (
            <p className="text-sm text-muted-foreground mt-1">{source.name}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <Label>Programación activa</Label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
          </div>

          {enabled && (
            <>
              {/* Frequency */}
              <div className="space-y-1.5">
                <Label className="text-sm">Frecuencia</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Interval hours (only for every_n_hours) */}
              {frequency === "every_n_hours" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Intervalo</Label>
                  <Select value={intervalHours} onValueChange={setIntervalHours}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Day of week (only for weekly) */}
              {frequency === "weekly" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Día de la semana</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Day of month (only for monthly) */}
              {frequency === "monthly" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Día del mes</Label>
                  <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Time (not for hourly) */}
              {frequency !== "hourly" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Hora (Argentina)</Label>
                  <div className="flex gap-2 items-center">
                    <Select value={hour} onValueChange={setHour}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => (
                          <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select value={minute} onValueChange={setMinute}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTES.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="outline" className="text-xs ml-2">AR</Badge>
                  </div>
                </div>
              )}

              {/* Minute only (for hourly) */}
              {frequency === "hourly" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Minuto de cada hora</Label>
                  <Select value={minute} onValueChange={setMinute}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MINUTES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* Existing schedule info */}
          {existing && (
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              {existing.next_run_at && (
                <div className="flex justify-between">
                  <span>Próxima ejecución:</span>
                  <span>{new Date(existing.next_run_at).toLocaleString("es-AR")}</span>
                </div>
              )}
              {existing.last_run_at && (
                <div className="flex justify-between">
                  <span>Última ejecución:</span>
                  <span>{new Date(existing.last_run_at).toLocaleString("es-AR")}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
              {saving ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
