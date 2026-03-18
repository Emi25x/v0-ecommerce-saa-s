"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RefreshCw, Database, Package, Upload, CheckCircle2 } from "lucide-react"
import type { ImportProgress } from "@/components/inventory/types"

interface ImportProgressDialogProps {
  importProgress: ImportProgress
}

export function ImportProgressDialog({ importProgress }: ImportProgressDialogProps) {
  return (
    <Dialog open={importProgress.show} onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importando Productos</DialogTitle>
          <DialogDescription>Por favor espera mientras se importan los productos...</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <RefreshCw className="h-16 w-16 text-primary animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-medium text-lg">{importProgress.message}</p>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                {importProgress.stage === "downloading" && (
                  <>
                    <Database className="h-4 w-4" />
                    <span>Conectando con la fuente de datos...</span>
                  </>
                )}
                {importProgress.stage === "processing" && (
                  <>
                    <Package className="h-4 w-4" />
                    <span>Validando y procesando productos...</span>
                  </>
                )}
                {importProgress.stage === "inserting" && (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>Guardando en la base de datos...</span>
                  </>
                )}
                {importProgress.stage === "finalizing" && (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Completando importaci&oacute;n...</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
              Este proceso puede tomar varios minutos dependiendo del tama&ntilde;o del archivo.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
