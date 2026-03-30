"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Play, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react"
import Link from "next/link"

interface PipelineResult {
  action: string
  run_id?: string
  phase?: string
  progress?: { merged: number; total: number; percent: number }
  duration_ms?: number
  error?: string
}

export default function PipelinePage() {
  const searchParams = useSearchParams()
  const adapter = searchParams.get("adapter") ?? ""
  const sourceId = searchParams.get("sourceId") ?? ""
  const sourceName = searchParams.get("name") ?? adapter

  const [status, setStatus] = useState<"idle" | "starting" | "merging" | "finished" | "error">("idle")
  const [progress, setProgress] = useState({ merged: 0, total: 0, percent: 0 })
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [autoTick, setAutoTick] = useState(false)
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    setLogs((prev) => [...prev, `${time} - ${msg}`])
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  // Auto-tick loop
  useEffect(() => {
    if (!autoTick || status !== "merging") return

    async function tick() {
      try {
        const res = await fetch("/api/import/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "tick", run_id: runId }),
        })
        const data: PipelineResult = await res.json()

        if (data.progress) setProgress(data.progress)

        if (data.action === "finished") {
          setStatus("finished")
          setAutoTick(false)
          addLog(`COMPLETADO: ${data.progress?.merged ?? 0} productos actualizados`)
        } else if (data.action === "merging") {
          addLog(`Merge: ${data.progress?.merged}/${data.progress?.total} (${data.progress?.percent}%) — ${data.duration_ms ? (data.duration_ms / 1000).toFixed(1) + "s" : ""}`)
          // Schedule next tick
          tickRef.current = setTimeout(tick, 1000)
        } else if (data.action === "error") {
          setStatus("error")
          setAutoTick(false)
          setError(data.error ?? "Error desconocido")
          addLog(`ERROR: ${data.error}`)
        } else if (data.action === "idle") {
          setStatus("finished")
          setAutoTick(false)
          addLog("Pipeline completado (idle)")
        }
      } catch (e: any) {
        addLog(`Error de conexión: ${e.message}`)
        // Retry after delay
        tickRef.current = setTimeout(tick, 5000)
      }
    }

    tick()

    return () => {
      if (tickRef.current) clearTimeout(tickRef.current)
    }
  }, [autoTick, status])

  async function handleStart() {
    setStatus("starting")
    setError(null)
    setLogs([])
    setProgress({ merged: 0, total: 0, percent: 0 })
    addLog("Iniciando pipeline...")

    try {
      const body: any = { action: "start" }
      if (sourceId) body.source_id = sourceId
      else if (adapter) body.adapter = adapter

      const res = await fetch("/api/import/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.start?.action === "started") {
        setRunId(data.start.run_id)
        const total = data.start.progress?.total ?? 0
        setProgress({ merged: 0, total, percent: 0 })
        addLog(`Staged: ${total} filas válidas`)

        if (data.tick?.progress) {
          setProgress(data.tick.progress)
          addLog(`Primer merge: ${data.tick.progress.merged} actualizados`)
        }

        if (data.tick?.action === "finished") {
          setStatus("finished")
          addLog("COMPLETADO")
        } else {
          setStatus("merging")
          setAutoTick(true)
          addLog("Merge en progreso — ejecutando ticks automáticos...")
        }
      } else if (data.action === "started") {
        setRunId(data.run_id)
        setProgress(data.progress ?? { merged: 0, total: 0, percent: 0 })
        addLog(`Staged: ${data.progress?.total ?? 0} filas válidas`)
        setStatus("merging")
        setAutoTick(true)
      } else if (data.error) {
        setStatus("error")
        setError(data.error)
        addLog(`ERROR: ${data.error}`)
      }
    } catch (e: any) {
      setStatus("error")
      setError(e.message)
      addLog(`ERROR: ${e.message}`)
    }
  }

  function handleStop() {
    setAutoTick(false)
    if (tickRef.current) clearTimeout(tickRef.current)
    addLog("Pausado. Podés reanudar con 'Continuar merge'.")
  }

  function handleResume() {
    setAutoTick(true)
    setStatus("merging")
    addLog("Reanudando merge...")
  }

  const progressPct = progress.total > 0 ? Math.round((progress.merged / progress.total) * 100) : 0

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/inventory/sources">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Pipeline de importación</h1>
          <p className="text-sm text-muted-foreground">{decodeURIComponent(sourceName)}</p>
        </div>
      </div>

      {/* Status card */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status === "idle" && <Badge variant="secondary">Listo para iniciar</Badge>}
            {status === "starting" && <Badge className="bg-blue-100 text-blue-800"><Loader2 className="h-3 w-3 animate-spin mr-1" />Iniciando...</Badge>}
            {status === "merging" && <Badge className="bg-yellow-100 text-yellow-800"><Loader2 className="h-3 w-3 animate-spin mr-1" />Merging...</Badge>}
            {status === "finished" && <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Completado</Badge>}
            {status === "error" && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Error</Badge>}
          </div>
          {runId && <span className="text-xs text-muted-foreground font-mono">{runId.slice(0, 8)}</span>}
        </div>

        {/* Progress bar */}
        {progress.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.merged.toLocaleString("es-AR")} / {progress.total.toLocaleString("es-AR")}</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {status === "idle" && (
            <Button onClick={handleStart} className="gap-1">
              <Play className="h-4 w-4" /> Iniciar pipeline
            </Button>
          )}
          {status === "merging" && autoTick && (
            <Button onClick={handleStop} variant="outline" className="gap-1">
              Pausar
            </Button>
          )}
          {status === "merging" && !autoTick && (
            <Button onClick={handleResume} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Continuar merge
            </Button>
          )}
          {status === "error" && (
            <>
              <Button onClick={handleResume} className="gap-1">
                <RefreshCw className="h-4 w-4" /> Reintentar
              </Button>
              <Button onClick={handleStart} variant="outline" className="gap-1">
                Reiniciar desde cero
              </Button>
            </>
          )}
          {status === "finished" && (
            <Button onClick={handleStart} variant="outline" className="gap-1">
              <RefreshCw className="h-4 w-4" /> Ejecutar de nuevo
            </Button>
          )}
        </div>
      </Card>

      {/* Logs */}
      {logs.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Logs</p>
          <div className="bg-black/90 rounded-lg p-3 max-h-72 overflow-y-auto font-mono text-xs space-y-0.5">
            {logs.map((log, i) => (
              <p key={i} className={log.includes("ERROR") ? "text-red-400" : log.includes("COMPLETADO") ? "text-green-400" : "text-green-300"}>
                {log}
              </p>
            ))}
            <div ref={logsEndRef} />
          </div>
        </Card>
      )}
    </div>
  )
}
