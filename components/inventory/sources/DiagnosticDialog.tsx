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
import { AlertTriangle, CheckCircle2, Loader2, Search, Trash2 } from "lucide-react"

interface DiagnosticDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAnalyzing: boolean
  isCleaning: boolean
  analysisResult: any
  onAnalyze: () => void
  onClean: () => void
}

export function DiagnosticDialog({
  open,
  onOpenChange,
  isAnalyzing,
  isCleaning,
  analysisResult,
  onAnalyze,
  onClean,
}: DiagnosticDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Análisis Automático</DialogTitle>
          <DialogDescription>
            Analiza tu base de datos para detectar productos con SKUs duplicados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button onClick={onAnalyze} disabled={isAnalyzing} className="w-full" size="lg">
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Analizando... Esto puede tomar 2-3 minutos
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Analizar Duplicados
              </>
            )}
          </Button>

          {analysisResult && (
            <>
              {analysisResult.needsSQLSetup ? (
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="font-semibold text-yellow-900 dark:text-yellow-100">
                        Configuración SQL requerida
                      </div>
                      <div className="text-sm text-yellow-800 dark:text-yellow-200">
                        {analysisResult.instructions}
                      </div>
                      <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                        <div className="font-medium">Pasos para configurar:</div>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>Abre el script SQL en la carpeta <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">scripts/</code></li>
                          <li>Copia el contenido del archivo <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">EJECUTAR_PRIMERO_crear_funciones.sql</code></li>
                          <li>Abre el SQL Editor de Supabase</li>
                          <li>Pega y ejecuta el script</li>
                          <li>Vuelve aquí y analiza nuevamente</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {analysisResult.method && (
                    <div className="text-xs text-muted-foreground text-center mb-4">
                      Método: {analysisResult.method === "sql_direct" ? "SQL Directo (completo)" : "Análisis de muestra"}
                      {analysisResult.note && ` • ${analysisResult.note}`}
                    </div>
                  )}

                  {analysisResult.totalDuplicateSKUs > 0 ? (
                    <div className="space-y-4">
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          <div className="font-semibold text-red-900 dark:text-red-100">
                            Se detectaron duplicados
                          </div>
                        </div>
                        <div className="text-sm text-red-800 dark:text-red-200">
                          {analysisResult.totalDuplicateProducts !== undefined ? (
                            <>
                              Se encontraron <span className="font-bold">{analysisResult.totalDuplicateSKUs} SKUs duplicados</span> con un total de{" "}
                              <span className="font-bold">{analysisResult.totalDuplicateProducts.toLocaleString()} productos duplicados</span> en tu base de datos.
                              <div className="mt-2 text-xs">
                                Promedio: ~{Math.round(analysisResult.totalDuplicateProducts / analysisResult.totalDuplicateSKUs)} productos por cada SKU duplicado
                              </div>
                            </>
                          ) : (
                            <>Se encontraron {analysisResult.totalDuplicateSKUs} SKUs con productos duplicados en tu base de datos.</>
                          )}
                        </div>
                      </div>

                      <Button onClick={onClean} disabled={isCleaning} variant="destructive" className="w-full" size="lg">
                        {isCleaning ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Eliminando duplicados...
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-5 w-5" />
                            Eliminar {analysisResult.totalDuplicateProducts !== undefined ? `${analysisResult.totalDuplicateProducts.toLocaleString()} ` : ""}Duplicados
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div className="font-semibold text-green-900 dark:text-green-100">
                          ¡Base de datos saludable!
                        </div>
                      </div>
                      <div className="text-sm text-green-800 dark:text-green-200">
                        No se detectaron problemas
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
