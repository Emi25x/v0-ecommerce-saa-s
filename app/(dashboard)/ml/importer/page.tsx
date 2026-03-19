"use client"

import Link from "next/link"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ListTodo,
  Zap,
} from "lucide-react"

export default function MLImporterPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [progress, setProgress] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [runResult, setRunResult] = useState<any>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showDiagnostic, setShowDiagnostic] = useState(false)
  const [diagnosticData, setDiagnosticData] = useState<any>(null)
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false)
  const [executionLog, setExecutionLog] = useState<any[]>([])
  const [accountDebug, setAccountDebug] = useState<any>(null)
  const [loadingAccountDebug, setLoadingAccountDebug] = useState(false)

  // Ref para leer autoMode dentro de callbacks async sin stale closure
  const autoModeRef = useRef(autoMode)
  useEffect(() => {
    autoModeRef.current = autoMode
  }, [autoMode])

  // Polling de progreso mientras está corriendo (cada 3s)
  useEffect(() => {
    if (!running || !selectedAccountId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
        const data = await res.json()
        if (data.ok) setProgress(data.progress)
      } catch {
        /* ignorar errores de red durante polling */
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [running, selectedAccountId])

  // Cola de jobs
  const [queueJobs, setQueueJobs] = useState<any[]>([])
  const [enqueueing, setEnqueueing] = useState(false)
  const [runningWorker, setRunningWorker] = useState(false)
  const [workerResult, setWorkerResult] = useState<any>(null)
  const [loadingQueue, setLoadingQueue] = useState(false)

  // Cargar cuentas ML
  useEffect(() => {
    fetch("/api/mercadolibre/accounts")
      .then((r) => r.json())
      .then((data) => {
        const accs = Array.isArray(data) ? data : data.accounts || []
        setAccounts(accs)
        if (accs.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accs[0].id)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error("[IMPORTER] Error loading accounts:", err)
        setLoading(false)
      })
  }, [])

  // Cargar estado de importación y estadísticas
  useEffect(() => {
    if (!selectedAccountId) return

    const loadData = async () => {
      try {
        const [statusRes, statsRes] = await Promise.all([
          fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`),
          fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`),
        ])

        const statusData = await statusRes.json()
        const statsData = await statsRes.json()

        if (statusData.ok) {
          setProgress(statusData.progress)
        }

        if (statsData.ok) {
          setStats(statsData)
        }
      } catch (err) {
        console.error("[IMPORTER] Error loading data:", err)
      }
    }

    loadData()
  }, [selectedAccountId])

  const handleRun = async () => {
    if (!selectedAccountId || running) return

    setRunning(true)
    const startTime = Date.now()

    try {
      const res = await fetch("/api/ml/import-pro/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          max_seconds: 12,
          detail_batch: 20,
          concurrency: 2,
        }),
      })

      const data = await res.json()
      setRunResult(data)

      // 409 = ya está corriendo (concurrent run). Esperar y reintentar.
      if (res.status === 409) {
        const waitMs = data.retry_after_ms ?? 15_000
        if (autoModeRef.current) {
          setTimeout(() => handleRun(), waitMs)
        }
        return
      }

      // Si hay rate limit, pausar auto-mode y reanudar después del tiempo indicado
      if (data.rate_limited) {
        setAutoMode(false)
        setRunning(false)
        const waitMs = (data.wait_seconds ?? 60) * 1000
        setTimeout(() => {
          setAutoMode(true)
          handleRun()
        }, waitMs)
        return
      }

      // Si hay error detallado de ML API, mostrarlo
      if (!data.ok && data.where && data.body) {
        const errorMsg = `Error de MercadoLibre en ${data.where}\nStatus: ${data.status}\nURL: ${data.url}\n\nRespuesta de ML:\n${data.body}`
        alert(errorMsg)
        console.error("[IMPORTER] ML API Error Details:", data)
      }

      // Agregar a log de ejecución
      const logEntry = {
        ranAt: new Date().toISOString(),
        action: data.ok ? (data.paused ? "paused" : "success") : "error",
        imported_delta: data.imported_count || data.publications_processed || 0,
        matched_delta: data.matched || 0,
        retry_after: data.paused ? data.wait_seconds : null,
        elapsed: data.timings
          ? (data.timings.total_ms / 1000).toFixed(1)
          : ((Date.now() - startTime) / 1000).toFixed(1),
        error_details: !data.ok && data.where ? `${data.where}: ${data.status}` : null,
        timings: data.timings || null,
      }

      setExecutionLog((prev) => [logEntry, ...prev].slice(0, 10))

      // Recargar progress y stats
      const statusRes = await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
      const statsRes = await fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`)

      const statusData = await statusRes.json()
      const statsData = await statsRes.json()

      if (statusData.ok) {
        setProgress(statusData.progress)
      }

      if (statsData.ok) {
        setStats(statsData)
      }

      // Si está pausado o completo, detener auto-mode
      const isDone = data.paused || statusData.progress?.status === "done" || !data.has_more
      if (isDone) {
        setAutoMode(false)
      } else if (autoModeRef.current) {
        // Continuar automáticamente al siguiente batch con pequeña pausa
        setTimeout(() => handleRun(), 800)
        return
      }
    } catch (error: any) {
      console.error("[IMPORTER] Network/timeout error:", error)

      // Error de red/timeout - no es error permanente, permitir reintento
      const logEntry = {
        ranAt: new Date().toISOString(),
        action: "network_error",
        imported_delta: 0,
        matched_delta: 0,
        retry_after: null,
        elapsed: ((Date.now() - startTime) / 1000).toFixed(1),
        error_details: `Network error: ${error.message}`,
      }

      setExecutionLog((prev) => [logEntry, ...prev].slice(0, 10))
      setRunResult({ ok: false, error: error.message, network_error: true })

      // Mostrar alerta diferenciada para errores de red
      alert(
        `Error de red o timeout:\n${error.message}\n\nEsto suele ser temporal. El auto-mode reintentará automáticamente.`,
      )
    } finally {
      setRunning(false)
    }
  }

  const loadQueue = async () => {
    if (!selectedAccountId) return
    setLoadingQueue(true)
    try {
      const res = await fetch(`/api/ml/jobs/list?account_id=${selectedAccountId}&limit=20`)
      const data = await res.json()
      if (data.ok) setQueueJobs(data.jobs || [])
    } catch {
      /* ignorar */
    } finally {
      setLoadingQueue(false)
    }
  }

  const handleEnqueue = async () => {
    if (!selectedAccountId) return
    setEnqueueing(true)
    try {
      const res = await fetch("/api/ml/jobs/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          type: "import_publications",
          payload: { max_seconds: 50, detail_batch: 50, concurrency: 2 },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        await loadQueue()
      } else {
        alert(`Error al encolar: ${data.error}`)
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setEnqueueing(false)
    }
  }

  const handleRunWorker = async () => {
    if (!selectedAccountId) return
    setRunningWorker(true)
    setWorkerResult(null)
    try {
      const res = await fetch("/api/ml/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: selectedAccountId, limit: 1 }),
      })
      const data = await res.json()
      setWorkerResult(data)
      // Recargar progreso y cola
      await loadQueue()
      const statusRes = await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
      const statusData = await statusRes.json()
      if (statusData.ok) setProgress(statusData.progress)
    } catch (err: any) {
      setWorkerResult({ ok: false, error: err.message })
    } finally {
      setRunningWorker(false)
    }
  }

  const handleStart = async () => {
    if (!selectedAccountId) return
    setAutoMode(true)
    await handleRun()
  }

  const handlePause = () => {
    setAutoMode(false)
  }

  const handleReset = async () => {
    if (!selectedAccountId) return
    if (
      !confirm("¿Reiniciar importación desde cero? Esto no borra publicaciones ya importadas ni desconecta la cuenta.")
    )
      return

    try {
      const response = await fetch("/api/ml/import-pro/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: selectedAccountId }),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        alert(`Error al resetear: ${data.error || "Unknown error"}`)
        return
      }

      // Recargar progreso
      const statusRes = await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
      const statusData = await statusRes.json()

      if (statusData.ok) {
        setProgress(statusData.progress)
      }
      alert("Importación reseteada exitosamente")
    } catch (error: any) {
      console.error("[IMPORTER] Reset error:", error)
      alert(`Error al resetear: ${error.message}`)
    }
  }

  const handleAccountDebug = async () => {
    if (!selectedAccountId) return

    setLoadingAccountDebug(true)

    try {
      const response = await fetch(`/api/debug/ml-account?account_id=${selectedAccountId}`)
      const data = await response.json()

      if (!response.ok) {
        setAccountDebug({ error: data.error || "Failed to fetch account debug" })
      } else {
        setAccountDebug(data)
      }
    } catch (error: any) {
      console.error("[IMPORTER] Account debug error:", error)
      setAccountDebug({ error: error.message })
    } finally {
      setLoadingAccountDebug(false)
    }
  }

  const handleDiagnostic = async () => {
    if (!selectedAccountId) return

    setLoadingDiagnostic(true)
    setShowDiagnostic(true)

    try {
      const [progressRes, statsRes] = await Promise.all([
        fetch(`/api/debug/import-progress?account_id=${selectedAccountId}`),
        fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`),
      ])

      const progressData = await progressRes.json()
      const statsData = await statsRes.json()

      setDiagnosticData({
        progress: progressData,
        stats: statsData,
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      console.error("[IMPORTER] Diagnostic error:", error)
      setDiagnosticData({ error: error.message })
    } finally {
      setLoadingDiagnostic(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <p className="text-muted-foreground">No hay cuentas de MercadoLibre conectadas</p>
        </Card>
      </div>
    )
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)
  const statusColors = {
    idle: "bg-gray-100 text-gray-700",
    running: "bg-blue-100 text-blue-700",
    done: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    error: "bg-red-100 text-red-700",
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Importación inicial Mercado Libre</h1>
        <p className="text-muted-foreground">Importa publicaciones y actividad para sincronizar tu catálogo</p>
      </div>

      {/* Selector de cuenta */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm font-medium flex-1">Cuenta de MercadoLibre</label>
          <Button
            onClick={handleAccountDebug}
            disabled={loadingAccountDebug || !selectedAccountId}
            size="sm"
            variant="outline"
            className="bg-transparent"
          >
            {loadingAccountDebug ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <AlertCircle className="h-3 w-3 mr-1" />
            )}
            Diagnóstico cuenta
          </Button>
        </div>
        <select
          value={selectedAccountId || ""}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full p-2 border rounded-md"
          disabled={autoMode || running}
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.nickname}
            </option>
          ))}
        </select>

        {/* Mostrar debug de cuenta si existe */}
        {accountDebug && (
          <div className="mt-4 p-3 bg-gray-50 border rounded-md">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium">Diagnóstico de cuenta</h4>
              <Button onClick={() => setAccountDebug(null)} size="sm" variant="ghost" className="h-6 px-2 text-xs">
                Cerrar
              </Button>
            </div>
            {accountDebug.error ? (
              <div className="text-xs text-red-600">{accountDebug.error}</div>
            ) : (
              <pre className="text-xs overflow-auto">{JSON.stringify(accountDebug, null, 2)}</pre>
            )}
          </div>
        )}
      </Card>

      {/* Card Alcance */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Alcance</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="h-8 text-xs">
            {showAdvanced ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Ocultar opciones
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Opciones avanzadas
              </>
            )}
          </Button>
        </div>

        <div className="flex gap-3">
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Publicaciones</span>
            <Badge variant="secondary" className="font-normal">
              {progress?.publications_scope === "active_only" ? "Solo activas" : "Todas"}
            </Badge>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Actividad</span>
            <Badge variant="secondary" className="font-normal">
              Últimos {progress?.activity_days || 30} días
            </Badge>
          </div>
        </div>

        {showAdvanced && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Las opciones avanzadas de alcance se configurarán próximamente.
            </p>
          </div>
        )}
      </Card>

      {/* Card Progreso */}
      {progress && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Progreso</h3>
            <Badge className={statusColors[progress.status as keyof typeof statusColors] || statusColors.idle}>
              {progress.status === "running"
                ? "Ejecutando"
                : progress.status === "done"
                  ? "Completado"
                  : progress.status === "paused"
                    ? "Pausado"
                    : progress.status === "error"
                      ? "Error"
                      : "Listo"}
            </Badge>
          </div>

          <div className="space-y-3">
            {/* Métrica principal: items REALES en la DB (no se resetea con el cursor) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Publicaciones en base de datos</span>
                <span className="text-sm text-muted-foreground font-mono">
                  {(progress.publications_in_db ?? progress.db_rows_upserted_count ?? 0).toLocaleString()}
                  {progress.publications_total ? ` / ${progress.publications_total.toLocaleString()}` : ""}
                </span>
              </div>
              <Progress
                value={
                  progress.publications_total
                    ? Math.min(
                        100,
                        Math.round(((progress.publications_in_db ?? 0) / progress.publications_total) * 100),
                      )
                    : 0
                }
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {progress.status === "done"
                  ? `${(progress.publications_in_db ?? 0).toLocaleString()} publicaciones importadas`
                  : progress.publications_total
                    ? `${Math.min(100, Math.round(((progress.publications_in_db ?? 0) / progress.publications_total) * 100))}% importado`
                    : "Calculando..."}
              </p>
            </div>

            {/* Métrica secundaria: posición del scan actual (se resetea al reiniciar cursor) */}
            {progress.status === "running" && progress.publications_total && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Progreso del scan actual</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {progress.publications_offset?.toLocaleString()} / {progress.publications_total.toLocaleString()}
                  </span>
                </div>
                <Progress value={progress.publications_progress || 0} className="h-1 opacity-60" />
              </div>
            )}

            {progress.finished_at && (
              <p className="text-xs text-muted-foreground">
                Importacion completa: {new Date(progress.finished_at).toLocaleString()}
              </p>
            )}

            {progress.last_run_at && !progress.finished_at && (
              <p className="text-xs text-muted-foreground">
                Ultima ejecucion: {new Date(progress.last_run_at).toLocaleString()}
              </p>
            )}

            {progress.status === "paused" && progress.paused_until && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 font-medium">Pausado por límite de API</p>
                  <p className="text-xs text-yellow-700">
                    Reinicio automático: {new Date(progress.paused_until).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            )}

            {/* Mostrar error solo si: status === 'error' o (status !== 'running' && last_error existe) */}
            {progress.last_error &&
              (progress.status === "error" || (progress.status !== "running" && progress.status !== "done")) && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-800 font-medium">
                      {progress.status === "error" ? "Error activo" : "Error anterior"}
                    </p>
                    <p className="text-xs text-red-700">{progress.last_error}</p>
                    {progress.status !== "error" && (
                      <p className="text-xs text-red-600 mt-1 italic">
                        Este error ocurrió previamente. Inicia la importación para reintentar.
                      </p>
                    )}
                  </div>
                </div>
              )}
          </div>
        </Card>
      )}

      {/* Card Acciones */}
      <Card className="p-5 mb-6">
        <h3 className="font-semibold mb-4">Acciones</h3>

        {progress?.status !== "done" && (
          <div className="flex flex-wrap gap-3">
            {!autoMode && (
              <Button onClick={handleStart} disabled={running} size="lg" className="flex-1 min-w-[180px]">
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ejecutando...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    {progress?.publications_offset > 0 ? "Reanudar" : "Iniciar"}
                  </>
                )}
              </Button>
            )}

            {autoMode && (
              <Button onClick={handlePause} size="lg" variant="outline" className="flex-1 min-w-[180px] bg-transparent">
                <Pause className="mr-2 h-4 w-4" />
                Pausar
              </Button>
            )}

            {!autoMode && !running && (
              <Button onClick={handleRun} disabled={running} size="lg" variant="outline" className="bg-transparent">
                <RefreshCw className="mr-2 h-4 w-4" />
                Paso (1 corrida)
              </Button>
            )}

            {!autoMode && !running && progress && progress.publications_offset > 0 && (
              <Button
                onClick={handleReset}
                size="lg"
                variant="outline"
                className="bg-transparent border-red-600 text-red-700 hover:bg-red-50"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reiniciar desde cero
              </Button>
            )}
          </div>
        )}

        {progress?.status === "done" && (
          <div className="mt-3 space-y-3">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-green-800 font-semibold mb-1">Importación inicial finalizada correctamente</p>
              <p className="text-sm text-green-700">
                Se importaron {progress.publications_total || 0} publicaciones de MercadoLibre.
              </p>
              <div className="mt-3">
                <Button
                  onClick={handleReset}
                  size="sm"
                  variant="outline"
                  className="bg-transparent border-green-600 text-green-700 hover:bg-green-100"
                >
                  <RotateCcw className="mr-2 h-3 w-3" />
                  Reiniciar importación
                </Button>
              </div>
            </div>

            {/* CTA para ir al matcher */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-blue-900 font-semibold mb-1">Siguiente paso: Vincular publicaciones con tu catálogo</p>
              <p className="text-sm text-blue-700 mb-3">
                Las publicaciones importadas deben vincularse con tus productos para que se sincronicen automáticamente.
              </p>
              <Link href="/ml/matcher">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                    <rect width="4" height="12" x="2" y="9" />
                    <circle cx="4" cy="4" r="2" />
                  </svg>
                  Ir a Vinculación de publicaciones
                </Button>
              </Link>
            </div>
          </div>
        )}

        {autoMode && progress?.status !== "done" && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 font-medium mb-1">Modo automático activo</p>
            <p className="text-xs text-blue-600">
              La importación avanza mientras esta página esté abierta. Podés cerrar la página y reanudar luego.
            </p>
          </div>
        )}
      </Card>

      {/* Card Métricas */}
      {stats && (
        <Card className="p-5 mb-6">
          <h3 className="font-semibold mb-4">Métricas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold">{stats.total_publications?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Importadas</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.matched_publications?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Vinculadas</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">
                {stats.unmatched_publications?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground">Sin producto</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{stats.updated_last_hour?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Recientes (1h)</p>
            </div>
          </div>
        </Card>
      )}

      {/* Card Log de ejecución */}
      {executionLog.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="font-semibold mb-4">Log de ejecución</h3>
          <div className="space-y-2">
            {executionLog.map((log, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 border rounded-md text-sm">
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      log.action === "success" ? "default" : log.action === "error" ? "destructive" : "secondary"
                    }
                    className="font-normal"
                  >
                    {log.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{new Date(log.ranAt).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {log.action === "success" && (
                    <>
                      <span>{log.imported_delta} importadas</span>
                      <span>{log.matched_delta} vinculadas</span>
                    </>
                  )}
                  {log.retry_after && <span className="text-yellow-600">Retry en {log.retry_after}s</span>}
                  {log.error && <span className="text-red-600">{log.error}</span>}
                  <span>{log.elapsed}s</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Card Cola de Jobs */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Cola de Jobs (sin timeout)</h3>
          </div>
          <button
            onClick={loadQueue}
            disabled={loadingQueue}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loadingQueue ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Alternativa al modo automático. Los jobs se ejecutan en el servidor y se pueden disparar desde un cron, sin
          depender de que la página esté abierta.
        </p>

        <div className="flex gap-3 mb-4">
          <Button
            onClick={handleEnqueue}
            disabled={enqueueing || !selectedAccountId}
            variant="outline"
            size="sm"
            className="bg-transparent"
          >
            {enqueueing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListTodo className="mr-2 h-4 w-4" />}
            Encolar importación
          </Button>
          <Button onClick={handleRunWorker} disabled={runningWorker || !selectedAccountId} size="sm">
            {runningWorker ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            Run worker (1 tick)
          </Button>
        </div>

        {/* Resultado del worker */}
        {workerResult && (
          <div
            className={`mb-4 p-3 rounded-md border text-sm ${workerResult.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
          >
            {workerResult.ok ? (
              <div>
                <p className="font-medium text-green-800">
                  Worker ejecutado — {workerResult.processed} job(s) procesados
                </p>
                {workerResult.results?.map((r: any, i: number) => (
                  <div key={i} className="mt-1 text-xs text-green-700">
                    Job {r.job_id?.slice(0, 8)} ({r.type}): {r.status}
                    {r.imported_count != null && ` — ${r.imported_count} items importados`}
                    {r.error && ` — Error: ${r.error}`}
                  </div>
                ))}
                {workerResult.message && <p className="text-xs text-green-600 mt-1">{workerResult.message}</p>}
              </div>
            ) : (
              <p className="text-red-700">{workerResult.error}</p>
            )}
          </div>
        )}

        {/* Lista de jobs en cola */}
        {queueJobs.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Jobs recientes</p>
            {queueJobs.map((job: any) => (
              <div key={job.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md text-sm">
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      job.status === "success" ? "default" : job.status === "error" ? "destructive" : "secondary"
                    }
                    className="font-normal text-xs"
                  >
                    {job.status}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{job.type}</span>
                  {job.attempts > 0 && <span className="text-xs text-muted-foreground">intento {job.attempts}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(job.created_at).toLocaleTimeString()}
                  {job.last_error && <span className="ml-2 text-red-500 truncate max-w-[200px]">{job.last_error}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No hay jobs. Hacé click en "Actualizar" o encola una importación.
          </p>
        )}
      </Card>

      {/* Botón diagnóstico */}
      <div className="flex justify-end">
        <Button
          onClick={handleDiagnostic}
          variant="outline"
          size="sm"
          disabled={loadingDiagnostic}
          className="bg-transparent"
        >
          {loadingDiagnostic ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Ver Diagnóstico Técnico
        </Button>
      </div>

      {/* Panel de diagnóstico */}
      {showDiagnostic && (
        <Card className="mt-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Diagnóstico Técnico</h3>
            <Button onClick={() => setShowDiagnostic(false)} size="sm" variant="ghost">
              Cerrar
            </Button>
          </div>

          {loadingDiagnostic ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : diagnosticData ? (
            <div className="space-y-4">
              {diagnosticData.error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{diagnosticData.error}</p>
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Estado de Progreso</h4>
                    <pre className="p-4 bg-gray-50 border rounded-md text-xs overflow-auto max-h-60">
                      {JSON.stringify(diagnosticData.progress, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">Estadísticas de Cola</h4>
                    <pre className="p-4 bg-gray-50 border rounded-md text-xs overflow-auto max-h-60">
                      {JSON.stringify(diagnosticData.stats, null, 2)}
                    </pre>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Generado: {new Date(diagnosticData.timestamp).toLocaleString()}
                  </p>
                </>
              )}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  )
}
