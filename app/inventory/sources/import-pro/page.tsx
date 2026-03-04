"use client"

import { useState, useRef, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Play, Square, RotateCcw } from "lucide-react"
import Link from "next/link"

/**
 * Importador PRO Anti-Timeout
 * - Descarga CSV una sola vez a Storage
 * - Procesa por chunks de 2000 filas
 * - Resumible y cancelable
 * - Sin re-descarga en cada batch
 */
export default function ImportProPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const [sourceId, setSourceId] = useState<string>("")
  const [sourceName, setSourceName] = useState<string>("")
  const [importMode, setImportMode] = useState<string>("upsert")
  
  const [runId, setRunId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  
  const [status, setStatus] = useState<string>("idle")
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [created, setCreated] = useState(0)
  const [updated, setUpdated] = useState(0)
  const [skippedMissing, setSkippedMissing] = useState(0)
  const [skippedInvalid, setSkippedInvalid] = useState(0)
  const [speedRowsSec, setSpeedRowsSec] = useState(0)
  const [etaSec, setEtaSec] = useState<number | null>(null)
  
  const [logs, setLogs] = useState<string[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const addLog = (message: string) => {
    setLogs((prev) => [...prev.slice(-50), `${new Date().toLocaleTimeString()} - ${message}`])
  }

  // Leer parámetros de URL
  useEffect(() => {
    const urlSourceId = searchParams.get("sourceId")
    const urlName = searchParams.get("name")
    const urlMode = searchParams.get("mode")
    
    if (urlSourceId) setSourceId(urlSourceId)
    if (urlName) setSourceName(decodeURIComponent(urlName))
    if (urlMode && ["create", "update", "upsert"].includes(urlMode)) setImportMode(urlMode)
  }, [searchParams])

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const startImport = async () => {
    if (!sourceId) {
      addLog("Error: No se especificó source_id")
      return
    }

    setIsInitializing(true)
    addLog("Iniciando importación PRO...")

    try {
      const response = await fetch("/api/inventory/import/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: sourceId,
          feed_kind: "catalog",
          mode: importMode
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Error al iniciar importación")
      }

      setRunId(result.run_id)
      setTotal(result.total_rows || 0)
      setStatus("running")
      setIsRunning(true)
      addLog(`CSV descargado y guardado en Storage (${(result.bytes / 1024 / 1024).toFixed(2)} MB)`)
      addLog(`Total estimado de filas: ${result.total_rows}`)
      addLog("Iniciando procesamiento por chunks...")

      // Iniciar loop de procesamiento
      startProcessingLoop(result.run_id)

    } catch (error: any) {
      addLog(`Error: ${error.message}`)
      setStatus("failed")
    } finally {
      setIsInitializing(false)
    }
  }

  const startProcessingLoop = (run_id: string) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    const processStep = async () => {
      try {
        const response = await fetch("/api/inventory/import/run/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ run_id })
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || "Error en step")
        }

        // Actualizar estado
        setStatus(result.status)
        setProcessed(result.processed_rows)
        setCreated(result.created_count)
        setUpdated(result.updated_count)
        setSkippedMissing(result.skipped_missing_key || 0)
        setSkippedInvalid(result.skipped_invalid_key || 0)
        
        if (result.total_rows) {
          setTotal(result.total_rows)
          setProgress(Math.round((result.processed_rows / result.total_rows) * 100))
        } else {
          setProgress(0)
        }

        // Mostrar debug del primer chunk si existe
        if (result.debug_first_chunk) {
          const d = result.debug_first_chunk
          addLog(`[DEBUG] === HEADERS DETECTADOS ===`)
          addLog(`[DEBUG] Delimiter: "${d.delimiter}"`)
          addLog(`[DEBUG] Headers originales (primeros 10): ${d.headers_original?.slice(0, 10).join(', ')}`)
          addLog(`[DEBUG] Headers normalizados (primeros 10): ${d.headers_normalized?.slice(0, 10).join(', ')}`)
          addLog(`[DEBUG] === PRIMERA FILA ===`)
          addLog(`[DEBUG] Claves disponibles (primeras 10): ${d.first_row_keys?.slice(0, 10).join(', ')}`)
          addLog(`[DEBUG] row["ean"] = "${d.first_row_ean}"`)
          addLog(`[DEBUG] row["isbn"] = "${d.first_row_isbn}"`)
          if (d.first_row_sample) {
            addLog(`[DEBUG] Muestra de valores:`)
            Object.entries(d.first_row_sample).forEach(([k, v]) => {
              addLog(`[DEBUG]   "${k}" = "${v}"`)
            })
          }
        }

        // Si terminó o no debe continuar, detener loop
        if (!result.continue || result.status !== "running") {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          setIsRunning(false)
          
          if (result.status === "completed") {
            addLog(`✅ Importación completada. Creados: ${result.created_count}, Actualizados: ${result.updated_count}`)
          } else if (result.status === "canceled") {
            addLog("⚠️ Importación cancelada")
          } else {
            addLog(`⚠️ Importación detenida: ${result.status}`)
          }
        }

      } catch (error: any) {
        addLog(`Error procesando chunk: ${error.message}`)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        setIsRunning(false)
        setStatus("failed")
      }
    }

    // Ejecutar primer step inmediatamente
    processStep()

    // Luego cada 2 segundos
    intervalRef.current = setInterval(processStep, 2000)
  }

  const cancelImport = async () => {
    if (!runId) return

    try {
      const response = await fetch("/api/inventory/import/run/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Error al cancelar")
      }

      addLog("Cancelando importación...")
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      
      setIsRunning(false)
      setStatus("canceled")

    } catch (error: any) {
      addLog(`Error al cancelar: ${error.message}`)
    }
  }

  const formatETA = (seconds: number | null) => {
    if (!seconds) return "Calculando..."
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/inventory/sources">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Importador PRO</h1>
        <Badge variant="outline" className="ml-auto">Anti-Timeout</Badge>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Importación por Lotes - {sourceName}</CardTitle>
          <CardDescription>
            Procesa archivos CSV grandes (430k+ filas) sin timeouts. El CSV se descarga una sola vez y se procesa por chunks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Configuración */}
          {!runId && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="mode">Modo de importación</Label>
                <Select value={importMode} onValueChange={setImportMode} disabled={isInitializing}>
                  <SelectTrigger id="mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create">Crear nuevos (ignorar duplicados)</SelectItem>
                    <SelectItem value="update">Actualizar existentes</SelectItem>
                    <SelectItem value="upsert">Crear y actualizar (por EAN)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  {importMode === "create" && "Crea productos nuevos y actualiza los existentes (por EAN)"}
                  {importMode === "update" && "Solo actualiza productos que ya existen"}
                  {importMode === "upsert" && "Crea productos nuevos y actualiza los existentes (por EAN)"}
                </p>
              </div>

              <Button 
                onClick={startImport} 
                disabled={isInitializing || !sourceId}
                className="w-full"
                size="lg"
              >
                {isInitializing ? (
                  <>Descargando CSV...</>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Iniciar Importación
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Progreso */}
          {runId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progreso: {progress}%</span>
                <span className="text-muted-foreground">
                  {processed.toLocaleString()} / {total.toLocaleString()} filas
                </span>
              </div>
              <Progress value={progress} />

              {/* Contadores */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Creados</div>
                  <div className="text-2xl font-bold text-blue-600">{created.toLocaleString()}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Actualizados</div>
                  <div className="text-2xl font-bold text-green-600">{updated.toLocaleString()}</div>
                </div>
              </div>

              {/* Debug */}
              {(skippedMissing > 0 || skippedInvalid > 0) && (
                <div className="border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 rounded p-3 text-xs">
                  <div className="font-medium mb-2">Descartados:</div>
                  <div className="space-y-1">
                    {skippedMissing > 0 && <div>• Sin EAN/ISBN: <span className="font-mono font-bold">{skippedMissing.toLocaleString()}</span></div>}
                    {skippedInvalid > 0 && <div>• EAN inválido: <span className="font-mono font-bold">{skippedInvalid.toLocaleString()}</span></div>}
                  </div>
                </div>
              )}

              {/* Estado */}
              <div className="p-3 bg-muted rounded text-sm">
                <div className="font-medium mb-1">Estado</div>
                <div className="flex items-center gap-2">
                  <Badge variant={status === "completed" ? "default" : status === "running" ? "secondary" : "outline"}>
                    {status}
                  </Badge>
                  {etaSec && status === "running" && (
                    <span className="text-muted-foreground">ETA: {formatETA(etaSec)}</span>
                  )}
                </div>
              </div>

              {/* Controles */}
              <div className="flex gap-2">
                {isRunning && (
                  <Button onClick={cancelImport} variant="destructive" className="flex-1">
                    <Square className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                )}
                {!isRunning && status !== "completed" && (
                  <Button onClick={() => router.push("/inventory/sources")} variant="outline" className="flex-1">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Volver a Fuentes
                  </Button>
                )}
                {status === "completed" && (
                  <Button onClick={() => router.push("/inventory/sources")} className="flex-1">
                    ✅ Completado - Volver a Fuentes
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="space-y-2">
            <Label>Logs</Label>
            <div className="bg-black/90 text-green-400 p-4 rounded font-mono text-xs h-64 overflow-auto">
              {logs.length === 0 ? (
                <div className="text-gray-500">Esperando inicio...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
