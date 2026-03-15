"use client"

import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

// Estimado de bytes restantes para barra de progreso (CSV Azeta ~150MB descomprimido)
const CHUNK_ESTIMATE = 150 * 1024 * 1024

export default function BatchImportPage() {
  const searchParams = useSearchParams()
  const [isRunning, setIsRunning] = useState(false)
  const [sourceId, setSourceId] = useState<string>("0477aa50-1c71-40b2-9530-9c794eb32793")
  const [sourceName, setSourceName] = useState<string>("Arnoia")
  const [importMode, setImportMode] = useState<string>("upsert")

  // Contadores acumulados (solo se suman si upsert ok)
  const [totalProcessed, setTotalProcessed] = useState(0)
  const [totalCreated, setTotalCreated] = useState(0)
  const [totalUpdated, setTotalUpdated] = useState(0)
  const [totalFailed, setTotalFailed] = useState(0)
  const [totalTimeouts, setTotalTimeouts] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])

  // Métricas dinámicas del último lote
  const [lastBatchSize, setLastBatchSize] = useState(500)
  const [lastDurationMs, setLastDurationMs] = useState(0)

  const abortRef = useRef(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = (message: string) => {
    setLogs(prev => [...prev.slice(-100), `${new Date().toLocaleTimeString()} - ${message}`])
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  useEffect(() => {
    const urlSourceId = searchParams.get("sourceId")
    const urlMode = searchParams.get("mode")
    const urlName = searchParams.get("name")
    const autoStart = searchParams.get("autoStart")

    if (urlSourceId) setSourceId(urlSourceId)
    if (urlName) setSourceName(decodeURIComponent(urlName))
    if (urlMode && ["update", "create", "upsert"].includes(urlMode)) setImportMode(urlMode)

    if (autoStart === "true" && urlSourceId && !isRunning) {
      setTimeout(() => startBatchImport(), 500)
    }
  }, [searchParams])

  const startBatchImport = async () => {
    const urlSourceId = searchParams.get("sourceId") || sourceId

    setIsRunning(true)
    setProgress(0)
    setTotalRows(0)
    setTotalProcessed(0)
    setTotalUpdated(0)
    setTotalCreated(0)
    setTotalFailed(0)
    setTotalTimeouts(0)
    setLastBatchSize(500)
    setLastDurationMs(0)
    setLogs([])
    abortRef.current = false

    addLog(`Iniciando importacion por lotes de ${sourceName}...`)

    const nameLower = sourceName.toLowerCase()
    // Ambas fuentes Azeta (Total y Parcial) usan el flujo azeta/download → azeta/process.
    // El batch genérico no puede manejar el ZIP de Total (~230MB) ni los errores del servidor de Azeta.
    const isAzeta = nameLower.includes("azeta")

    // AZETA: llama directamente a import-catalog (descarga ZIP/CSV server-side, sin Blob intermedio)
    if (isAzeta) {
      try {
        const isStock = nameLower.includes("stock")
        if (isStock) {
          // Azeta Stock: endpoint dedicado (CSV sin headers, col0=EAN col1=stock)
          setStatus("Actualizando stock AZETA...")
          addLog("Descargando y procesando Azeta Stock (CSV sin headers)...")
          const res = await fetch("/api/azeta/import-stock", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          })
          const result = await res.json().catch(() => ({}))
          if (!res.ok) {
            addLog(`Error: ${result.error || `HTTP ${res.status}`}`)
            setStatus("Error")
            setIsRunning(false)
            return
          }
          const s = result.stats ?? {}
          setTotalProcessed(s.processed ?? 0)
          setTotalUpdated(s.updated ?? 0)
          setProgress(100)
          addLog(`Completado: ${s.updated ?? 0} actualizados, ${s.not_found ?? 0} no encontrados, ${s.zeroed ?? 0} puestos a 0`)
          setStatus("Importacion completada")
          setIsRunning(false)
          return
        }

        // Azeta Total/Parcial: flujo chunked (download → process en lotes de 4MB)
        // Paso 1: /api/azeta/download guarda el CSV en Vercel Blob (≤300s)
        // Paso 2: /api/azeta/process procesa chunks de 4MB en loop (≤60s c/u)
        setStatus("Descargando catálogo AZETA...")
        addLog("Descargando ZIP de AZETA (~230MB, puede tardar 3-5 min)...")
        addLog("El proceso corre en el servidor. Mantené esta página abierta.")

        let blobUrl: string
        try {
          const dlRes = await fetch("/api/azeta/download", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_id: urlSourceId }),
            signal: AbortSignal.timeout(295_000),
          })
          const dlResult = await dlRes.json().catch(() => ({ error: `HTTP ${dlRes.status}` }))
          if (!dlRes.ok || dlResult.error) {
            addLog(`Error al descargar: ${dlResult.error || `HTTP ${dlRes.status}`}`)
            setStatus("Error en descarga")
            setIsRunning(false)
            return
          }
          blobUrl = dlResult.blob_url
          addLog(`Descarga completada en ${dlResult.elapsed_seconds}s. Procesando en lotes...`)
        } catch (fetchErr: any) {
          addLog(`Error de conexion en descarga: ${fetchErr.message}`)
          setStatus("Error de conexion")
          setIsRunning(false)
          return
        }

        // Paso 2: procesar CSV en chunks de 4MB
        setStatus("Procesando catálogo AZETA en lotes...")
        let byteStart = 0
        let headerLine: string | undefined
        let accCreated = 0, accUpdated = 0, accErrors = 0, accProcessed = 0
        let procDone = false

        while (!procDone && !abortRef.current) {
          try {
            const procRes = await fetch("/api/azeta/process", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ blob_url: blobUrl, byte_start: byteStart, header_line: headerLine, source_id: urlSourceId }),
              signal: AbortSignal.timeout(65_000),
            })
            const procResult = await procRes.json().catch(() => ({ error: `HTTP ${procRes.status}` }))
            if (!procRes.ok || procResult.error) {
              addLog(`Error en chunk: ${procResult.error || `HTTP ${procRes.status}`}`)
              setStatus("Error en procesamiento")
              break
            }

            accCreated   += procResult.created   ?? 0
            accUpdated   += procResult.updated   ?? 0
            accErrors    += procResult.errors    ?? 0
            accProcessed += procResult.rows_processed ?? 0
            if (!headerLine && procResult.header_line) headerLine = procResult.header_line

            setTotalCreated(accCreated)
            setTotalUpdated(accUpdated)
            setTotalProcessed(accProcessed)
            const pct = procResult.next_byte_start
              ? Math.min(99, Math.round((procResult.next_byte_start / CHUNK_ESTIMATE) * 100))
              : 99
            setProgress(pct)

            addLog(`Chunk: ${procResult.rows_processed} filas (total: ${accProcessed}) | +${procResult.created} creados, +${procResult.updated} actualizados`)

            if (procResult.done) {
              procDone = true
              setProgress(100)
              setTotalRows(accProcessed)
              setStatus("Importacion completada")
              addLog(`Completado: ${accCreated} creados, ${accUpdated} actualizados, ${accErrors} errores`)
            } else {
              byteStart = procResult.next_byte_start ?? byteStart
              if (procResult.header_line) headerLine = procResult.header_line
            }
          } catch (err: any) {
            addLog(`Error de conexion en chunk: ${err.message}`)
            setStatus("Error de conexion")
            break
          }
        }

        // Limpiar blob (best-effort)
        fetch("/api/azeta/process", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blob_url: blobUrl, cleanup: true }),
        }).catch(() => {})

        setIsRunning(false)
        return
      } catch (err: any) {
        addLog(`Error: ${err.message}`)
        setStatus(`Error: ${err.message}`)
        setIsRunning(false)
        return
      }
    }

    // Batch generico para otras fuentes
    let offset = 0
    let accProcessed = 0
    let accCreated = 0
    let accUpdated = 0
    let accFailed = 0
    let accTimeouts = 0
    let currentBatchSize = 500
    let done = false

    while (!done && !abortRef.current) {
      try {
        setStatus(`Procesando lote desde offset ${offset}...`)
        addLog(`Procesando lote desde offset ${offset}`)

        const response = await fetch("/api/inventory/import/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: urlSourceId, offset, mode: importMode, batch_size: currentBatchSize }),
        })

        const responseText = await response.text()

        if (!response.ok) {
          let msg = `Error ${response.status}`
          try { msg = JSON.parse(responseText).error || msg } catch {}
          addLog(`Error: ${msg}`)
          setStatus(`Error: ${msg}`)
          break
        }

        let result: any
        try {
          result = JSON.parse(responseText)
        } catch {
          addLog(`Error: Respuesta invalida del servidor`)
          setStatus("Error: Respuesta invalida")
          break
        }

        // Debug primer lote
        if (result.debug) {
          addLog(`[DEBUG] Delimiter: "${result.debug.delimiter}"`)
          addLog(`[DEBUG] Headers (10 primeros): ${result.debug.headers_normalized?.slice(0, 10).join(", ")}`)
          addLog(`[DEBUG] Sample EAN: ${result.debug.sample_ean}`)
          addLog(`[DEBUG] Total filas en archivo: ${result.debug.total_rows_in_file}`)
          if (result.debug.total_rows_in_file) {
            setTotalRows(result.debug.total_rows_in_file)
          }
        }

        // Acumular SOLO si no hubo error en ese lote
        const loteOk = !result.last_error || result.last_reason === "success"
        if (loteOk) {
          accCreated += result.created || 0
          accUpdated += result.updated || 0
        } else {
          accFailed += result.failed_rows || 0
        }
        accProcessed += result.rows_processed || 0
        accTimeouts += result.timeout_count || 0

        // Actualizar estado (sin closures stale — usar vars locales)
        setTotalCreated(accCreated)
        setTotalUpdated(accUpdated)
        setTotalProcessed(accProcessed)
        setTotalFailed(accFailed)
        setTotalTimeouts(accTimeouts)
        setLastDurationMs(result.duration_ms || 0)

        // Batch size dinámico según sugerencia del server
        if (result.suggested_next_batch_size) {
          currentBatchSize = result.suggested_next_batch_size
          setLastBatchSize(currentBatchSize)
        }

        // Progreso
        if (totalRows > 0) {
          setProgress(Math.min(99, Math.round((accProcessed / totalRows) * 100)))
        } else if (!result.done) {
          setProgress(prev => Math.min(90, prev + 5))
        }

        const skipped = (result.missing_ean || 0) + (result.invalid_ean || 0)
        addLog(
          `Lote: ${result.rows_seen} vistas, ${result.rows_processed} validas, ` +
          `${result.created || 0} creadas, ${result.updated || 0} actualizadas, ` +
          `${skipped} saltadas, ${result.failed_rows || 0} fallidas, ` +
          `${result.duration_ms}ms, batch=${result.batch_size}`
        )

        if (result.timeout_count > 0) {
          addLog(`[WARN] ${result.timeout_count} timeout(s) en este lote, batch reducido a ${currentBatchSize}`)
        }
        if (result.last_error && result.last_reason !== "success") {
          addLog(`[ERROR] ${result.last_error}`)
        }

        if (result.done) {
          done = true
          setProgress(100)
          setStatus(`Importacion completada`)
          addLog(
            `Finalizado. Procesadas: ${accProcessed}, Creadas: ${accCreated}, ` +
            `Actualizadas: ${accUpdated}, Fallidas: ${accFailed}, Timeouts: ${accTimeouts}`
          )
        } else {
          offset = result.next_offset ?? offset + result.rows_seen
          await new Promise(r => setTimeout(r, 300))
        }
      } catch (error: any) {
        addLog(`Error de conexion: ${error.message || error}`)
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

  const fmt = (n: number) => n.toLocaleString("es-ES")

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Importacion por Lotes - {sourceName}</CardTitle>
          <CardDescription>
            Importa productos procesando en lotes. Mantene esta pagina abierta durante el proceso.
            El proceso puede tardar varios minutos pero no se interrumpira si cambias de pagina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Barra progreso superior */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Procesadas: {fmt(totalProcessed)}</span>
              <span>{fmt(totalUpdated + totalCreated)} actualizadas/creadas</span>
            </div>
            <Progress value={isRunning ? undefined : progress} className="h-2" />
          </div>

          {/* Botones */}
          <div className="flex gap-4">
            <Button onClick={startBatchImport} disabled={isRunning}>
              {isRunning ? "Ejecutando..." : "Iniciar Importacion"}
            </Button>
            {isRunning && (
              <Button variant="destructive" onClick={stopImport}>Cancelar</Button>
            )}
          </div>

          {/* Métricas detalladas */}
          {(isRunning || totalProcessed > 0) && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Progreso: {progress}%</span>
                <span>{fmt(totalProcessed)} / {fmt(totalRows || 0)} filas</span>
              </div>
              <Progress value={progress} />

              {/* Contadores principales */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Creados</div>
                  <div className="text-2xl font-bold text-blue-600">{fmt(totalCreated)}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Actualizados</div>
                  <div className="text-2xl font-bold text-green-600">{fmt(totalUpdated)}</div>
                </div>
                <div className="p-3 bg-muted rounded">
                  <div className="font-medium">Estado</div>
                  <div className="text-sm">{status}</div>
                </div>
              </div>

              {/* Métricas de estabilidad */}
              <div className="border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 rounded p-3 text-xs">
                <div className="font-medium mb-2">Metricas ultimo lote:</div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <span className="text-muted-foreground">Fallidas:</span>{" "}
                    <span className={`font-mono font-bold ${totalFailed > 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(totalFailed)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Timeouts:</span>{" "}
                    <span className={`font-mono font-bold ${totalTimeouts > 0 ? "text-orange-600" : "text-green-600"}`}>
                      {totalTimeouts}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Batch size:</span>{" "}
                    <span className="font-mono font-bold text-blue-600">{fmt(lastBatchSize)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duracion:</span>{" "}
                    <span className="font-mono font-bold">{lastDurationMs > 0 ? `${(lastDurationMs / 1000).toFixed(1)}s` : "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Logs</h3>
              <div className="bg-black text-green-400 p-4 rounded font-mono text-xs max-h-64 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  )
}
