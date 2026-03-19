"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ImportSource } from "@/components/inventory/types"
import { TIMEZONES } from "@/components/inventory/types"

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  importSources: ImportSource[]
  selectedSource: string
  onSelectedSourceChange: (value: string) => void
  scheduleFrequency: string
  onScheduleFrequencyChange: (value: string) => void
  scheduleTimezone: string
  onScheduleTimezoneChange: (value: string) => void
  scheduleTime: string
  onScheduleTimeChange: (value: string) => void
  scheduleDayOfWeek: number
  onScheduleDayOfWeekChange: (value: number) => void
  scheduleDayOfMonth: number
  onScheduleDayOfMonthChange: (value: number) => void
  onImport: () => void
}

export function ImportDialog({
  open,
  onOpenChange,
  importSources,
  selectedSource,
  onSelectedSourceChange,
  scheduleFrequency,
  onScheduleFrequencyChange,
  scheduleTimezone,
  onScheduleTimezoneChange,
  scheduleTime,
  onScheduleTimeChange,
  scheduleDayOfWeek,
  onScheduleDayOfWeekChange,
  scheduleDayOfMonth,
  onScheduleDayOfMonthChange,
  onImport,
}: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar desde Fuente</DialogTitle>
          <DialogDescription>Selecciona una fuente de importaci&oacute;n configurada</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Fuente de Importaci&oacute;n</Label>
            <select
              className="w-full mt-1 p-2 border rounded-md bg-background text-foreground dark:bg-background dark:text-foreground"
              value={selectedSource}
              onChange={(e) => onSelectedSourceChange(e.target.value)}
            >
              <option value="">Seleccionar fuente...</option>
              {importSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Nota:</strong> Solo se importar&aacute;n productos nuevos. Los productos con SKU existente
              ser&aacute;n saltados autom&aacute;ticamente.
            </p>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-semibold">Programaci&oacute;n de Importaci&oacute;n</h3>

            <div>
              <Label>Frecuencia</Label>
              <select
                className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                value={scheduleFrequency}
                onChange={(e) => onScheduleFrequencyChange(e.target.value)}
              >
                <option value="daily">Diariamente</option>
                <option value="monthly">Mensualmente</option>
                <option value="once">Una vez (ahora)</option>
                <option value="weekly">Semanalmente</option>
              </select>
            </div>

            {scheduleFrequency !== "once" && (
              <>
                <div>
                  <Label>Zona Horaria</Label>
                  <select
                    className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                    value={scheduleTimezone}
                    onChange={(e) => {
                      console.log("Cambiando zona horaria a:", e.target.value)
                      onScheduleTimezoneChange(e.target.value)
                    }}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.timezone} value={tz.timezone}>
                        {tz.country}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    La hora de ejecuci&oacute;n se ajustar&aacute; a la zona horaria seleccionada
                  </p>
                </div>

                <div>
                  <Label>Hora de Ejecuci&oacute;n</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => {
                      console.log("Cambiando hora a:", e.target.value)
                      onScheduleTimeChange(e.target.value)
                    }}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Hora en formato 24h (ej: 14:30 para 2:30 PM)</p>
                </div>

                {console.log("scheduleFrequency actual:", scheduleFrequency)}
                {console.log("\u00bfDeber\u00eda mostrar selector de d\u00eda?:", scheduleFrequency === "weekly")}

                {scheduleFrequency === "weekly" && (
                  <div>
                    <Label>D&iacute;a de la Semana</Label>
                    <select
                      className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                      value={scheduleDayOfWeek}
                      onChange={(e) => {
                        console.log("Cambiando d\u00eda de la semana a:", e.target.value)
                        onScheduleDayOfWeekChange(Number(e.target.value))
                      }}
                    >
                      <option value={0}>Domingo</option>
                      <option value={1}>Lunes</option>
                      <option value={2}>Martes</option>
                      <option value={3}>Mi&eacute;rcoles</option>
                      <option value={4}>Jueves</option>
                      <option value={5}>Viernes</option>
                      <option value={6}>S&aacute;bado</option>
                    </select>
                  </div>
                )}

                {scheduleFrequency === "monthly" && (
                  <div>
                    <Label>D&iacute;a del Mes</Label>
                    <select
                      className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                      value={scheduleDayOfMonth}
                      onChange={(e) => onScheduleDayOfMonthChange(Number(e.target.value))}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Solo d&iacute;as 1-28 para evitar problemas con meses cortos
                    </p>
                  </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Nota:</strong> La importaci&oacute;n programada se ejecutar&aacute; autom&aacute;ticamente
                    seg&uacute;n la frecuencia seleccionada.
                    {scheduleFrequency === "daily" &&
                      " Se ejecutar\u00e1 todos los d\u00edas a las " + scheduleTime + "."}
                    {scheduleFrequency === "weekly" &&
                      " Se ejecutar\u00e1 todos los " +
                        ["domingos", "lunes", "martes", "mi\u00e9rcoles", "jueves", "viernes", "s\u00e1bados"][
                          scheduleDayOfWeek
                        ] +
                        " a las " +
                        scheduleTime +
                        "."}
                    {scheduleFrequency === "monthly" &&
                      " Se ejecutar\u00e1 el d\u00eda " +
                        scheduleDayOfMonth +
                        " de cada mes a las " +
                        scheduleTime +
                        "."}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onImport}>{scheduleFrequency === "once" ? "Importar Ahora" : "Importar y Programar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
