"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react"
import type { DiagnosticsData } from "@/components/inventory/types"

interface DiagnosticsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  diagnosticsData: DiagnosticsData | null
}

function getStatusIcon(status: string) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />
    case "error":
      return <XCircle className="h-5 w-5 text-red-600" />
    case "partial":
      return <AlertCircle className="h-5 w-5 text-yellow-600" />
    case "running":
      return <Clock className="h-5 w-5 text-blue-600 animate-spin" />
    default:
      return null
  }
}

export function DiagnosticsDialog({
  open,
  onOpenChange,
  loading,
  diagnosticsData,
}: DiagnosticsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diagn&oacute;stico del Sistema</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-8">Cargando diagn&oacute;stico...</div>
        ) : diagnosticsData ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Total de Productos</h3>
              <p className="text-3xl font-bold">{diagnosticsData.totalProducts}</p>
            </div>

            {diagnosticsData.productsBySource && (
              <div>
                <h3 className="font-semibold mb-2">Productos por Fuente</h3>
                <div className="space-y-2">
                  {diagnosticsData.productsBySource.map((item: any) => (
                    <div key={item.source} className="flex justify-between">
                      <span>{item.source || "Sin fuente"}</span>
                      <Badge>{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diagnosticsData.schedules && diagnosticsData.schedules.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Importaciones Programadas</h3>
                <div className="space-y-3">
                  {diagnosticsData.schedules.map((schedule: any) => (
                    <div key={schedule.id} className="border rounded-lg p-3 bg-muted/30">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium">
                            {schedule.import_sources?.name || "Fuente desconocida"}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            Frecuencia: {schedule.frequency === "daily" && "Diaria"}
                            {schedule.frequency === "weekly" && "Semanal"}
                            {schedule.frequency === "monthly" && "Mensual"}
                            {" a las " + schedule.time}
                            {schedule.timezone && ` (${schedule.timezone})`}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Pr&oacute;xima ejecuci&oacute;n:{" "}
                            {schedule.next_run_at
                              ? new Date(schedule.next_run_at).toLocaleString()
                              : "No programada"}
                          </div>
                          {schedule.last_run_at && (
                            <div className="text-sm text-muted-foreground">
                              &Uacute;ltima ejecuci&oacute;n: {new Date(schedule.last_run_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                        <Badge variant={schedule.is_active ? "default" : "secondary"}>
                          {schedule.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diagnosticsData.history && diagnosticsData.history.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Historial de Importaciones (&Uacute;ltimas 20)</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {diagnosticsData.history.slice(0, 20).map((item: any) => (
                    <div key={item.id} className="border rounded-lg p-3 flex items-start gap-3">
                      <div className="mt-0.5">{getStatusIcon(item.status)}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{item.import_sources?.name || "Fuente desconocida"}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(item.started_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-4 mt-1 text-sm">
                          <span className="text-green-600 dark:text-green-400">
                            +{item.products_imported} nuevos
                          </span>
                          <span className="text-blue-600 dark:text-blue-400">
                            ~{item.products_updated} actualizados
                          </span>
                          {item.products_failed > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              {"\u2715"}{item.products_failed} errores
                            </span>
                          )}
                        </div>
                        {item.error_message && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                            Error: {item.error_message}
                          </div>
                        )}
                        {item.completed_at && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Duraci&oacute;n:{" "}
                            {Math.round(
                              (new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) /
                                1000,
                            )}
                            s
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diagnosticsData.recentProducts && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">&Uacute;ltimos 10 Productos Creados</h3>
                <div className="space-y-2 text-sm">
                  {diagnosticsData.recentProducts.map((product: any) => (
                    <div key={product.id} className="border rounded p-2">
                      <p className="font-mono text-xs">{product.sku}</p>
                      <p className="truncate">{product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(product.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
