"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StopCircle } from "lucide-react"
import type { ImportProgressState } from "./types"

interface ImportProgressDialogProps {
  open: boolean
  onClose: () => void
  importProgress: ImportProgressState
  onCancel: () => void
}

export function ImportProgressDialog({ open, onClose, importProgress, onCancel }: ImportProgressDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Progreso de Importación</DialogTitle>
          <DialogDescription>
            {importProgress.status === "running"
              ? "Procesando productos..."
              : importProgress.status === "completed"
                ? "Importación completada"
                : importProgress.status === "cancelled"
                  ? "Importación cancelada"
                  : "Error en la importación"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progreso</span>
              <span>
                {importProgress.processed} / {importProgress.total}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  importProgress.status === "completed"
                    ? "bg-green-600"
                    : importProgress.status === "error"
                      ? "bg-red-600"
                      : importProgress.status === "cancelled"
                        ? "bg-yellow-600"
                        : "bg-primary"
                }`}
                style={{
                  width: `${importProgress.total > 0 ? (importProgress.processed / importProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {importProgress.csvInfo && (
            <div className="border rounded-lg p-3 bg-muted/30 text-sm">
              <div className="font-medium mb-2">Información del CSV</div>
              <div className="space-y-1 text-muted-foreground">
                <div>
                  Separador: {importProgress.csvInfo.separator === "\t" ? "TAB" : importProgress.csvInfo.separator}
                </div>
                <div>Columnas: {importProgress.csvInfo.headers.length}</div>
                <div className="text-xs">
                  Headers: {importProgress.csvInfo.headers.slice(0, 5).join(", ")}
                  {importProgress.csvInfo.headers.length > 5 && "..."}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Importados</div>
              <div className="text-2xl font-bold text-green-600">{importProgress.imported}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Actualizados</div>
              <div className="text-2xl font-bold text-blue-600">{importProgress.updated}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Fallidos</div>
              <div className="text-2xl font-bold text-red-600">{importProgress.failed}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-sm text-muted-foreground">Saltados</div>
              <div className="text-2xl font-bold text-yellow-600">{importProgress.skipped}</div>
            </div>
          </div>

          {importProgress.speed > 0 && (
            <div className="text-sm text-muted-foreground">
              Velocidad: {importProgress.speed.toFixed(1)} productos/segundo
            </div>
          )}

          {importProgress.errors.length > 0 && (
            <div className="border rounded-lg p-3 bg-red-50 dark:bg-red-950/20 max-h-32 overflow-y-auto">
              <div className="font-medium text-sm text-red-900 dark:text-red-100 mb-2">Últimos errores</div>
              <div className="space-y-1">
                {importProgress.errors.map((error, idx) => (
                  <div key={idx} className="text-xs text-red-800 dark:text-red-200">
                    <span className="font-mono">{error.sku}</span>: {error.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {importProgress.status === "running" ? (
            <Button variant="destructive" onClick={onCancel}>
              <StopCircle className="mr-2 h-4 w-4" />
              Cancelar Importación
            </Button>
          ) : (
            <Button onClick={onClose}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
