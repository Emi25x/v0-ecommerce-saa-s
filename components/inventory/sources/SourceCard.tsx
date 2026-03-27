"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  FileText,
  History,
  Loader2,
  Play,
  Settings,
  StopCircle,
  Trash2,
  CalendarClock,
} from "lucide-react"
import Link from "next/link"
import type { SourceWithSchedule, ImportProgressState } from "./types"

interface SourceCardProps {
  source: SourceWithSchedule
  isExpanded: boolean
  isRunning: boolean
  isImporting: boolean
  backgroundProgress: ImportProgressState | undefined
  sourceToImportId: string | undefined
  onToggleExpand: (id: string) => void
  onRunImport: (source: SourceWithSchedule) => void
  onRunImportPro: (source: SourceWithSchedule) => void
  onSchedule: (source: SourceWithSchedule) => void
  onDelete: (source: SourceWithSchedule) => void
  onCancelImport: () => void
  onCancelBackgroundImport: (source: SourceWithSchedule) => void
}

export function SourceCard({
  source,
  isExpanded,
  isRunning,
  isImporting,
  backgroundProgress,
  sourceToImportId,
  onToggleExpand,
  onRunImport,
  onRunImportPro,
  onSchedule,
  onDelete,
  onCancelImport,
  onCancelBackgroundImport,
}: SourceCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">{source.name}</CardTitle>
              <Badge variant={source.feed_type === "catalog" ? "default" : "secondary"}>
                {source.feed_type === "catalog" ? "Catálogo" : "Stock/Precio"}
              </Badge>
              {isRunning && (
                <Badge variant="outline" className="text-blue-600">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Importando...
                </Badge>
              )}
            </div>
            {source.description && <CardDescription className="mt-1">{source.description}</CardDescription>}
          </div>
          <div className="flex gap-2">
            <Link href={`/inventory/sources/${source.id}`}>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => onRunImport(source)} disabled={isRunning || isImporting}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRunImportPro(source)}
              disabled={isRunning || isImporting}
              title="Importador PRO (anti-timeout)"
            >
              <Database className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSchedule(source)}
              title="Programar ejecución"
              className={source.schedules?.some((s: any) => s.enabled) ? "border-green-500 text-green-600" : ""}
            >
              <CalendarClock className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDelete(source)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onToggleExpand(source.id)}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {backgroundProgress && backgroundProgress.status === "running" && backgroundProgress.total > 0 && (
        <div className="px-6 pb-3">
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Importación en progreso</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  {backgroundProgress.processed} / {backgroundProgress.total}
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    if (sourceToImportId === source.id) {
                      onCancelImport()
                    } else {
                      onCancelBackgroundImport(source)
                    }
                  }}
                >
                  <StopCircle className="h-3 w-3 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
            <div className="w-full bg-blue-100 dark:bg-blue-900/50 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(backgroundProgress.processed / backgroundProgress.total) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex gap-4 text-xs text-blue-700 dark:text-blue-300">
              <span>Nuevos: {backgroundProgress.imported}</span>
              <span>Actualizados: {backgroundProgress.updated}</span>
              <span>Fallidos: {backgroundProgress.failed}</span>
            </div>
          </div>
        </div>
      )}

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {source.last_import && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <History className="h-4 w-4" />
                  <span className="font-medium">Última Importación</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Fecha</div>
                    <div className="font-medium">
                      {new Date(source.last_import.started_at).toLocaleDateString("es-AR")}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Estado</div>
                    <Badge
                      variant={
                        source.last_import.status === "completed"
                          ? "default"
                          : source.last_import.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {source.last_import.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Importados</div>
                    <div className="font-medium">{source.last_import.products_imported}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Actualizados</div>
                    <div className="font-medium">{source.last_import.products_updated}</div>
                  </div>
                </div>
              </div>
            )}

            {source.url_template && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">Configuración</span>
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>URL:</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {source.url_template.length > 60
                        ? source.url_template.substring(0, 60) + "..."
                        : source.url_template}
                    </code>
                  </div>
                </div>
              </div>
            )}

            {source.schedules && source.schedules.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Programaciones</span>
                </div>
                <div className="space-y-2">
                  {source.schedules.map((schedule) => (
                    <div key={schedule.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Switch checked={schedule.enabled} disabled />
                        <span>
                          {schedule.frequency === "daily"
                            ? "Diaria"
                            : schedule.frequency === "weekly"
                              ? "Semanal"
                              : "Mensual"}
                        </span>
                        <Badge variant="outline">
                          {String(schedule.hour).padStart(2, "0")}:{String(schedule.minute).padStart(2, "0")}
                        </Badge>
                      </div>
                      {schedule.next_run_at && (
                        <span className="text-muted-foreground text-xs">
                          Próxima: {new Date(schedule.next_run_at).toLocaleDateString("es-AR")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
