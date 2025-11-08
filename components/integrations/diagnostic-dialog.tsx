"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react"
import type { DiagnosticResult } from "@/lib/integrations/diagnostics"

interface DiagnosticDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integrationName: string
  onRunDiagnostics: () => Promise<DiagnosticResult[]>
}

export function DiagnosticDialog({ open, onOpenChange, integrationName, onRunDiagnostics }: DiagnosticDialogProps) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<DiagnosticResult[]>([])

  const handleRun = async () => {
    setRunning(true)
    setResults([])

    try {
      const diagnosticResults = await onRunDiagnostics()
      setResults(diagnosticResults)
    } catch (error) {
      console.error("[v0] Error ejecutando diagnósticos:", error)
    } finally {
      setRunning(false)
    }
  }

  const successfulTest = results.find((r) => r.success)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diagnóstico de Conexión - {integrationName}</DialogTitle>
          <DialogDescription>
            Prueba diferentes configuraciones de autenticación para encontrar la correcta
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {results.length === 0 && !running && (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>Haz clic en "Ejecutar Diagnóstico" para probar diferentes configuraciones</p>
            </div>
          )}

          {running && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-500" />
              <p className="text-muted-foreground">Ejecutando pruebas de diagnóstico...</p>
            </div>
          )}

          {results.length > 0 && (
            <>
              {successfulTest && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-green-900">Configuración exitosa encontrada</h4>
                      <p className="text-sm text-green-700 mt-1">{successfulTest.testName}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 ${
                      result.success ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {result.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">{result.testName}</h4>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>
                            Status: {result.status} {result.statusText}
                          </p>
                          <p>Duración: {result.duration}ms</p>
                          {result.error && <p className="text-red-600">Error: {result.error}</p>}
                          {result.response && (
                            <details className="mt-2">
                              <summary className="cursor-pointer hover:text-foreground">Ver respuesta</summary>
                              <pre className="mt-2 p-2 bg-white rounded text-xs overflow-x-auto">
                                {JSON.stringify(result.response, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button onClick={handleRun} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ejecutando...
                </>
              ) : (
                "Ejecutar Diagnóstico"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
