"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search } from "lucide-react"
import type { ImportSummaryData } from "@/components/inventory/types"

interface ImportSummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  importSummary: ImportSummaryData | null
  onSearchSku: (sku: string) => void
}

export function ImportSummaryDialog({ open, onOpenChange, importSummary, onSearchSku }: ImportSummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumen de Importaci&oacute;n</DialogTitle>
          <DialogDescription>Resultados de la importaci&oacute;n completada</DialogDescription>
        </DialogHeader>
        {importSummary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="text-sm text-green-600 dark:text-green-400 font-medium">Productos Nuevos</div>
                <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                  {importSummary.imported || 0}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Productos que no exist&iacute;an en la base de datos
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950/30 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  Ya Exist&iacute;an (Saltados)
                </div>
                <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">{importSummary.updated || 0}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Productos con SKU existente que no se importaron
                </div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Duplicados en CSV</div>
                <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">
                  {importSummary.skipped || 0}
                </div>
                <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                  SKUs repetidos en el archivo que se combinaron
                </div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="text-sm text-red-600 dark:text-red-400 font-medium">Errores</div>
                <div className="text-3xl font-bold text-red-700 dark:text-red-300">{importSummary.failed || 0}</div>
                <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Productos que no pudieron ser procesados
                </div>
              </div>
            </div>

            {importSummary.sampleSkus && importSummary.sampleSkus.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Verificaci&oacute;n de SKUs (Primeros 5 del archivo):</h3>
                <div className="space-y-2">
                  {importSummary.sampleSkus.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        item.status === "nuevo"
                          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                          : item.status === "existente"
                            ? "bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800"
                            : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="font-mono text-sm font-semibold">{item.sku}</div>
                        {item.title && (
                          <div className="text-xs text-muted-foreground truncate max-w-md">{item.title}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            item.status === "nuevo"
                              ? "default"
                              : item.status === "existente"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {item.status === "nuevo"
                            ? "\u2713 Nuevo"
                            : item.status === "existente"
                              ? "\u2298 Ya exist\u00eda"
                              : "\u2717 Error"}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => onSearchSku(item.sku)}>
                          <Search className="h-3 w-3 mr-1" />
                          Buscar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Haz clic en &quot;Buscar&quot; para ver el producto en el inventario
                </p>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="text-sm text-muted-foreground">
                <strong>Total procesado:</strong> {importSummary.total || 0} registros
              </div>
            </div>

            {importSummary.errors && importSummary.errors.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2 text-red-600 dark:text-red-400">
                  Errores Encontrados ({importSummary.errors.length}):
                </h3>
                <div className="max-h-40 overflow-y-auto space-y-1 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-3">
                  {importSummary.errors.map((error, i) => (
                    <div key={i} className="text-sm text-red-600 dark:text-red-400 font-mono">
                      &bull; {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">Resumen:</h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                {(importSummary.imported || 0) > 0 && (
                  <li>
                    {"\u2713"} Se importaron {importSummary.imported} productos nuevos a la base de datos
                  </li>
                )}
                {(importSummary.updated || 0) > 0 && (
                  <li>
                    {"\u2298"} Se saltaron {importSummary.updated} productos porque ya exist&iacute;an (mismo SKU)
                  </li>
                )}
                {(importSummary.skipped || 0) > 0 && (
                  <li>
                    {"\u26a0"} Se encontraron {importSummary.skipped} SKUs duplicados en el CSV que se combinaron
                    autom&aacute;ticamente
                  </li>
                )}
                {(importSummary.failed || 0) > 0 && (
                  <li>
                    {"\u2717"} {importSummary.failed} productos no pudieron ser procesados (ver errores arriba)
                  </li>
                )}
                {(importSummary.imported || 0) === 0 &&
                  (importSummary.updated || 0) === 0 &&
                  (importSummary.failed || 0) === 0 && <li>No se procesaron productos nuevos</li>}
              </ul>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
