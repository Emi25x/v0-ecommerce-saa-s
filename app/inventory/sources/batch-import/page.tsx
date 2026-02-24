"use client"

import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

export default function BatchImportPage() {
  const searchParams = useSearchParams()
  const [isRunning, setIsRunning] = useState(false)
  const [sourceId, setSourceId] = useState<string>("0477aa50-1c71-40b2-9530-9c794eb32793") // Default Arnoia
  const [sourceName, setSourceName] = useState<string>("Arnoia")
  const [importMode, setImportMode] = useState<string>("upsert")
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [updated, setUpdated] = useState(0)
  const [created, setCreated] = useState(0)
  const [status, setStatus] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])
  const [debugCounters, setDebugCounters] = useState({ skipped_missing_ean: 0, skipped_invalid_ean: 0, processed_valid_rows: 0 })
  const abortRef = useRef(false)

  const addLog = (message: string) => {
    setLogs((prev) => [...prev.slice(-50), `${new Date().toLocaleTimeString()} - ${message}`])
  }

  // Leer parámetros de URL al cargar y auto-iniciar si viene desde sources
  useEffect(() => {
    const urlSourceId = searchParams.get("sourceId")
    const urlMode = searchParams.get("mode")
    const urlName = searchParams.get("name")
    const autoStart = searchParams.get("autoStart") // Si viene este parámetro, inicia automáticamente
    
    if (urlSourceId) {
      setSourceId(urlSourceId)
    }
    
    if (urlName) {
      setSourceName(decodeURIComponent(urlName))
    }
    
    if (urlMode && ["update", "create", "upsert"].includes(urlMode)) {
      setImportMode(urlMode)
    }

    // Auto-iniciar importación si viene el parámetro autoStart=true
    if (autoStart === "true" && urlSourceId && !isRunning) {
      console.log("[v0] Auto-iniciando importación desde URL")
      // Usar setTimeout para asegurar que los estados se actualicen primero
      setTimeout(() => {
        startBatchImport()
      }, 500)
    }
  }, [searchParams])

  const startBatchImport = async () => {
    // Obtener sourceId directamente de la URL para evitar problemas de timing con el estado
    const urlSourceId = searchParams.get("sourceId") || sourceId
    console.log("[v0] Starting batch import with sourceId:", urlSourceId, "mode:", importMode)
    
    setIsRunning(true)
    setProgress(0)
    setTotal(0)
    setProcessed(0)
    setUpdated(0)
    setCreated(0)
    setLogs([])
    abortRef.current = false

    let offset = 0
    let totalUpdated = 0
    let totalCreated = 0
    let done = false

    addLog(`Iniciando importacion por lotes de ${sourceName}...`)

    // Detectar si es AZETA y usar endpoint especializado
    const isAzeta = sourceName.toLowerCase().includes('azeta')
    
    if (isAzeta) {
      // AZETA usa endpoint especializado que maneja ZIP grandes
      try {
        setStatus(`Procesando catálogo completo de AZETA...`)
        addLog(`Usando importador especializado para AZETA`)

        const response = await fetch("/api/azeta/import-catalog-direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })

        const responseText = await response.text()
        
        if (!response.ok) {
          let errorMessage = `Error ${response.status}: ${response.statusText}`
          try {
            const error = JSON.parse(responseText)
            errorMessage = error.error || errorMessage
          } catch {
            errorMessage = responseText.substring(0, 200) || errorMessage
          }
          addLog(`Error: ${errorMessage}`)
          setStatus(`Error: ${errorMessage}`)
          return
        }

        let result
        try {
          result = JSON.parse(responseText)
        } catch (e) {
          addLog(`Error: Respuesta inválida del servidor`)
          setStatus(`Error: Respuesta inválida del servidor`)
          return
        }

        setTotalCreated(result.created || 0)
        setTotalUpdated(result.updated || 0)
        addLog(`Importación completada: ${result.created || 0} creados, ${result.updated || 0} actualizados`)
        setStatus(`Importación completada`)
        return
      } catch (error: any) {
        addLog(`Error: ${error.message}`)
        setStatus(`Error: ${error.message}`)
        return
      }
    }

    // Importación por lotes para otras fuentes
    while (!done && !abortRef.current) {
      try {
        setStatus(`Procesando lote desde offset ${offset}...`)
        addLog(`Procesando lote desde offset ${offset}`)

        const response = await fetch("/api/inventory/import/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: urlSourceId, offset, mode: importMode }),
        })

        // Leer el body UNA SOLA VEZ
        const responseText = await response.text()
        
        if (!response.ok) {
          let errorMessage = `Error ${response.status}: ${response.statusText}`
          try {
            const error = JSON.parse(responseText)
            errorMessage = error.error || errorMessage
          } catch {
            errorMessage = responseText.substring(0, 200) || errorMessage
          }
          addLog(`Error: ${errorMessage}`)
          setStatus(`Error: ${errorMessage}`)
          break
        }

        let result
        try {
          result = JSON.parse(responseText)
        } catch (e) {
          addLog(`Error: Respuesta inválida del servidor: ${responseText.substring(0, 200)}`)
          setStatus(`Error: Respuesta inválida del servidor`)
          break
        }

        // Mostrar debug del primer batch
        if (result.debug) {
          addLog(`[DEBUG] Delimiter: "${result.debug.delimiter}"`)
          addLog(`[DEBUG] Headers (10 primeros): ${result.debug.headers_normalized?.slice(0, 10).join(", ")}`)
          addLog(`[DEBUG] Sample EAN: ${result.debug.sample_ean}`)
        }
        
        totalUpdated += result.updated || 0
        totalCreated += result.created || 0
        setUpdated(totalUpdated)
        setCreated(totalCreated)
        
        // Actualizar processed (suma acumulada de rows_processed)
        const newProcessed = processed + (result.rows_processed || 0)
        setProcessed(newProcessed)
        
        // Total es 0 (no lo calculamos)
        setTotal(0)
        setProgress(0)

        const skipped = (result.missing_ean || 0) + (result.invalid_ean || 0)
        addLog(`Lote: ${result.rows_seen} vistas, ${result.rows_processed} válidas, ${result.updated} actualizadas, ${skipped} descartadas`)

        // Mostrar razón si hay problema
        if (result.last_reason && result.last_reason !== "success") {
          addLog(`[DEBUG] Razón: ${result.last_reason}`)
        }
        if (result.last_error) {
          addLog(`[ERROR] ${result.last_error}`)
        }

        // Actualizar contadores de debug
        setDebugCounters({
          skipped_missing_ean: result.missing_ean || 0,
          skipped_invalid_ean: result.invalid_ean || 0,
          processed_valid_rows: result.rows_processed || 0
        })

        // Detener cuando done=true
        if (result.done) {
          done = true
          setStatus("Importacion completada")
          addLog(`✓ Finalizado. Procesadas: ${newProcessed}, Actualizadas: ${totalUpdated}, Creadas: ${totalCreated}`)
        } else {
          offset = result.next_offset || (offset + result.rows_seen)
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
<CardTitle>Importacion por Lotes - {sourceName}</CardTitle>
  <CardDescription>
  Importa productos procesando en lotes. Mantené esta página abierta durante el proceso.
            El proceso puede tardar varios minutos pero no se interrumpira si cambias de pagina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Selector de modo de importación */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Procesadas: {processed}</span>
              <span>{updated + created} actualizadas/creadas</span>
            </div>
            <Progress value={isRunning ? undefined : 100} className="h-2" />
          </div>

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
              <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Creados</div>
                  <div className="text-2xl font-bold text-blue-600">{created.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Actualizados</div>
                  <div className="text-2xl font-bold text-green-600">{updated.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Estado</div>
                  <div className="text-sm">{status}</div>
                </div>
              </div>
              
              {/* Debug counters */}
              {debugCounters.processed_valid_rows > 0 && (
                <div className="border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 rounded p-3 text-xs">
                  <div className="font-medium mb-2">Debug - Último lote:</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-muted-foreground">Procesadas:</span>{" "}
                      <span className="font-mono font-bold text-green-600">{debugCounters.processed_valid_rows}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sin EAN:</span>{" "}
                      <span className="font-mono font-bold text-orange-600">{debugCounters.skipped_missing_ean || 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">EAN inválido:</span>{" "}
                      <span className="font-mono font-bold text-red-600">{debugCounters.skipped_invalid_ean || 0}</span>
                    </div>
                  </div>
                </div>
              )}
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
