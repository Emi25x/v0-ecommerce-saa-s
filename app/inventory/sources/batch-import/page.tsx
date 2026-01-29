"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export default function BatchImportPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [updated, setUpdated] = useState(0)
  const [status, setStatus] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])
  const abortRef = useRef(false)

  const addLog = (message: string) => {
    setLogs((prev) => [...prev.slice(-50), `${new Date().toLocaleTimeString()} - ${message}`])
  }

  const startBatchImport = async () => {
    // ID de Arnoia (hardcodeado por ahora)
    const sourceId = "0477aa50-1c71-40b2-9530-9c794eb32793"

    setIsRunning(true)
    setProgress(0)
    setTotal(0)
    setProcessed(0)
    setUpdated(0)
    setLogs([])
    abortRef.current = false

    let offset = 0
    let totalUpdated = 0
    let done = false

    addLog("Iniciando importacion por lotes de Arnoia...")

    while (!done && !abortRef.current) {
      try {
        setStatus(`Procesando lote desde posicion ${offset}...`)
        addLog(`Procesando lote desde offset ${offset}`)

        const response = await fetch("/api/inventory/import/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId, offset }),
        })

        if (!response.ok) {
          const error = await response.json()
          addLog(`Error: ${error.error}`)
          setStatus(`Error: ${error.error}`)
          break
        }

        const result = await response.json()

        setTotal(result.total)
        setProcessed(result.processed)
        setProgress(result.progress || 0)
        totalUpdated += result.updated || 0
        setUpdated(totalUpdated)

        addLog(`Lote completado: ${result.updated} actualizados, progreso ${result.progress}%`)

        if (result.done) {
          done = true
          setStatus("Importacion completada")
          addLog(`Importacion completada. Total actualizados: ${totalUpdated}`)
        } else {
          offset = result.nextOffset
          // Pequeña pausa entre lotes
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      } catch (error) {
        addLog(`Error de conexion: ${error}`)
        setStatus("Error de conexion")
        break
      }
    }

    if (abortRef.current) {
      setStatus("Importacion cancelada")
      addLog("Importacion cancelada por el usuario")
    }

    setIsRunning(false)
  }

  const stopImport = () => {
    abortRef.current = true
    setStatus("Cancelando...")
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Importacion por Lotes - Arnoia</CardTitle>
          <CardDescription>
            Importa los EANs de Arnoia procesando en lotes de 3000 productos.
            El proceso puede tardar varios minutos pero no se interrumpira si cambias de pagina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-4">
            <Button onClick={startBatchImport} disabled={isRunning}>
              {isRunning ? "Ejecutando..." : "Iniciar Importacion"}
            </Button>
            {isRunning && (
              <Button variant="destructive" onClick={stopImport}>
                Cancelar
              </Button>
            )}
          </div>

          {(isRunning || processed > 0) && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Progreso: {progress}%</span>
                <span>
                  {processed.toLocaleString()} / {total.toLocaleString()} filas
                </span>
              </div>
              <Progress value={progress} />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">EANs Actualizados</div>
                  <div className="text-2xl font-bold text-green-600">{updated.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Estado</div>
                  <div className="text-sm">{status}</div>
                </div>
              </div>
            </div>
          )}

          {logs.length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium mb-2">Logs</h3>
              <div className="bg-black text-green-400 p-4 rounded font-mono text-xs max-h-64 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
