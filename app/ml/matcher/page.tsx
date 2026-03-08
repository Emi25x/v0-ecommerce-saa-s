"use client"

import Link from "next/link"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Play, Pause, RotateCcw, Loader2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"

export default function MLMatcherPage() {
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

  // Helpers seguros (NUNCA crashear)
  const formatDate = (dateValue?: string | null) => {
    if (!dateValue) return "—"
    try {
      return new Date(dateValue).toLocaleString()
    } catch {
      return "—"
    }
  }

  const formatNumber = (num?: number | null) => {
    if (num === null || num === undefined) return "0"
    try {
      return num.toLocaleString()
    } catch {
      return "0"
    }
  }

  const formatPercent = (num?: number | null) => {
    if (num === null || num === undefined) return "0.0"
    try {
      return num.toFixed(1)
    } catch {
      return "0.0"
    }
  }

  const formatSpeed = (speedPerSec?: number | null) => {
    if (!speedPerSec || speedPerSec <= 0) return "—"
    return `${speedPerSec.toFixed(1)} items/s`
  }

  const formatETA = (etaSeconds?: number | null) => {
    if (!etaSeconds || etaSeconds <= 0) return "—"
    const minutes = Math.floor(etaSeconds / 60)
    const seconds = Math.floor(etaSeconds % 60)
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
  }

  // Defaults locales para evitar crashes
  const safeProgress = {
    status: progress?.status || "idle",
    total_target: progress?.total_target || 0,
    processed_count: progress?.processed_count || 0,
    matched_count: progress?.matched_count || 0,
    ambiguous_count: progress?.ambiguous_count || 0,
    not_found_count: progress?.not_found_count || 0,
    invalid_identifier_count: progress?.invalid_identifier_count || 0,
    error_count: progress?.error_count || 0,
    percent: progress?.percent || 0,
    speed_per_sec: progress?.speed_per_sec || 0,
    eta_seconds: progress?.eta_seconds || null,
    last_error: progress?.last_error || null,
    last_run_at: progress?.last_run_at || null,
    started_at: progress?.started_at || null,
    finished_at: progress?.finished_at || null
  }

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
        const statusRes = await fetch(`/api/ml/matcher/status?account_id=${selectedAccountId}`)
        
        const statusData = await statusRes.json()
        
        if (statusData.ok) {
          setProgress(statusData.progress)
        }
      } catch (err) {
        console.error("[IMPORTER] Error loading data:", err)
      }
    }
    
    loadData()
  }, [selectedAccountId])

  // Auto-mode: ejecutar cada 3s cuando está activo y hay trabajo pendiente
  useEffect(() => {
    if (!autoMode || !selectedAccountId || running) return

    // Si ya completó, apagar auto-mode (usar safeProgress para evitar crashes)
    if (safeProgress.processed_count >= safeProgress.total_target && safeProgress.total_target > 0) {
      setAutoMode(false)
      return
    }

    if (safeProgress.status === 'completed' || safeProgress.status === 'failed') {
      setAutoMode(false)
      return
    }

    const interval = setInterval(() => { handleRun() }, 15000)
    return () => clearInterval(interval)
  }, [autoMode, selectedAccountId, running, progress])

  const handleRun = async () => {
    if (!selectedAccountId || running) return
    setRunning(true)
    const startTime = Date.now()
    
    try {
      const res = await fetch("/api/ml/matcher/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          max_seconds: 12,
          batch_size: 200,
        }),
      })
      
      const data = await res.json()
      setRunResult(data)

      if (data.rate_limited) {
        setAutoMode(false)
        setTimeout(() => setAutoMode(true), 10000)
        setRunning(false)
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
        action: data.ok ? (data.paused ? 'paused' : 'success') : 'error',
        processed: data.processed || 0,  // Matcher usa 'processed', no 'imported_count'
        matched: data.matched || 0,
        retry_after: data.paused ? data.wait_seconds : null,
        elapsed: data.elapsed_seconds || ((Date.now() - startTime) / 1000).toFixed(1),
        error_details: !data.ok && data.error ? data.error : null,
        timings: data.timings || null
      }
      
      setExecutionLog(prev => [logEntry, ...prev].slice(0, 10))

      // Recargar progress del matcher (NO usar endpoints del importador)
      const statusRes = await fetch(`/api/ml/matcher/status?account_id=${selectedAccountId}`)
      
      const statusData = await statusRes.json()
      
      if (statusData.ok) {
        setProgress(statusData.progress)
      }

      // Si está pausado o completo, detener auto-mode
      if (data.paused || statusData.progress?.status === "done") {
        setAutoMode(false)
      }
    } catch (error: any) {
      const logEntry = {
        ranAt: new Date().toISOString(),
        action: 'network_error',
        imported_delta: 0,
        matched_delta: 0,
        retry_after: null,
        elapsed: ((Date.now() - startTime) / 1000).toFixed(1),
        error_details: `Network error: ${error.message}`
      }
      
      setExecutionLog(prev => [logEntry, ...prev].slice(0, 10))
      setRunResult({ ok: false, error: error.message, network_error: true })
      
      // Mostrar alerta diferenciada para errores de red
      alert(`Error de red o timeout:\n${error.message}\n\nEsto suele ser temporal. El auto-mode reintentará automáticamente.`)
    } finally {
      setRunning(false)
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
      !confirm(
        "¿Reiniciar importación desde cero? Esto no borra publicaciones ya importadas ni desconecta la cuenta."
      )
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
        setAccountDebug({ error: data.error || 'Failed to fetch account debug' })
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
      const res  = await fetch(`/api/ml/matcher/diagnostic?account_id=${selectedAccountId}`)
      const data = await res.json()
      setDiagnosticData(data)
    } catch (error: any) {
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
    error: "bg-red-100 text-red-700"
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Vinculación Automática MercadoLibre</h1>
        <p className="text-muted-foreground">
          Vincula publicaciones de MercadoLibre con productos del catálogo usando ISBN, EAN y SKU
        </p>
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
              <Button
                onClick={() => setAccountDebug(null)}
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
              >
                Cerrar
              </Button>
            </div>
            {accountDebug.error ? (
              <div className="text-xs text-red-600">{accountDebug.error}</div>
            ) : (
              <pre className="text-xs overflow-auto">
                {JSON.stringify(accountDebug, null, 2)}
              </pre>
            )}
          </div>
        )}
      </Card>

      {/* Card Alcance */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Alcance</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-8 text-xs"
          >
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
        
        <div className="space-y-2">
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Publicaciones a vincular</span>
            <Badge variant="secondary" className="font-normal">
              Solo sin vincular
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            El matcher procesa únicamente publicaciones sin <code className="bg-muted px-1 rounded">product_id</code> para vincularlas con productos del catálogo usando identificadores como ISBN, EAN y SKU.
          </p>
        </div>

        {showAdvanced && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <p className="text-xs font-medium">Estrategia de matching</p>
            <p className="text-xs text-muted-foreground">
              Prioridad: ISBN → EAN → SKU. Solo vincula si hay exactamente 1 coincidencia (evita ambigüedades).
            </p>
          </div>
        )}
      </Card>

      {/* Card Progreso */}
      {progress && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Progreso</h3>
            <Badge className={statusColors[progress.status] || statusColors.idle}>
              {progress.status === "running" ? "Ejecutando" :
               progress.status === "done" ? "Completado" :
               progress.status === "paused" ? "Pausado" :
               progress.status === "error" ? "Error" : "Listo"}
            </Badge>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progreso de Vinculación</span>
                <span className="text-sm text-muted-foreground">
                  {formatNumber(safeProgress.processed_count)} / {formatNumber(safeProgress.total_target)}
                </span>
              </div>
              <Progress value={safeProgress.percent} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {formatPercent(safeProgress.percent)}% completado
              </p>
            </div>

            {safeProgress.last_run_at && (
              <p className="text-xs text-muted-foreground">
                Última ejecución: {formatDate(safeProgress.last_run_at)}
              </p>
            )}

            {safeProgress.speed_per_sec > 0 && (
              <p className="text-xs text-muted-foreground">
                Velocidad: {formatSpeed(safeProgress.speed_per_sec)} • ETA: {formatETA(safeProgress.eta_seconds)}
              </p>
            )}

            {progress.status === "paused" && progress.paused_until && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 font-medium">Pausado por límite de API</p>
                  <p className="text-xs text-yellow-700">
                    Reinicio automático: {formatDate(progress.paused_until)}
                  </p>
                </div>
              </div>
            )}

            {/* Mostrar error solo si: status === 'error' o (status !== 'running' && last_error existe) */}
            {progress.last_error && (
              progress.status === 'error' || 
              (progress.status !== 'running' && progress.status !== 'done')
            ) && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm text-red-800 font-medium">
                    {progress.status === 'error' ? 'Error activo' : 'Error anterior'}
                  </p>
                  <p className="text-xs text-red-700">{progress.last_error}</p>
                  {progress.status !== 'error' && (
                    <p className="text-xs text-red-600 mt-1 italic">
                      Este error ocurrió previamente. Inicia el matching para reintentar.
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
                    {safeProgress.processed_count > 0 ? "Reanudar Matching" : "Iniciar Matching"}
                  </>
                )}
              </Button>
            )}

            {autoMode && (
              <Button onClick={handlePause} size="lg" variant="outline" className="flex-1 min-w-[180px] bg-transparent">
                <Pause className="mr-2 h-4 w-4" />
                Pausar Auto-mode
              </Button>
            )}

            {!autoMode && !running && (
              <Button onClick={handleRun} disabled={running} size="lg" variant="outline" className="bg-transparent">
                <RefreshCw className="mr-2 h-4 w-4" />
                Ejecutar Batch
              </Button>
            )}

            {!autoMode && !running && safeProgress.processed_count > 0 && (
              <Button onClick={handleReset} size="lg" variant="outline" className="bg-transparent border-red-600 text-red-700 hover:bg-red-50">
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
                <Button onClick={handleReset} size="sm" variant="outline" className="bg-transparent border-green-600 text-green-700 hover:bg-green-100">
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

        {autoMode && progress?.status !== "completed" && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 font-medium mb-1">
              Modo automático activo
            </p>
            <p className="text-xs text-blue-600">
              El matching avanza automáticamente mientras esta página esté abierta. Podés cerrar y reanudar luego.
            </p>
          </div>
        )}
      </Card>

      {/* Card Métricas de Matching */}
      <Card className="p-5 mb-6">
        <h3 className="font-semibold mb-4">Resultados</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-green-600">{formatNumber(safeProgress.matched_count)}</p>
            <p className="text-xs text-muted-foreground">Vinculadas</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{formatNumber(safeProgress.ambiguous_count)}</p>
            <p className="text-xs text-muted-foreground">Ambiguas</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-600">{formatNumber(safeProgress.not_found_count)}</p>
            <p className="text-xs text-muted-foreground">Sin match</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{formatNumber(safeProgress.invalid_identifier_count)}</p>
            <p className="text-xs text-muted-foreground">Sin identificador</p>
          </div>
        </div>
        
        {safeProgress.last_error && safeProgress.status === 'failed' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm font-medium text-red-800">Error:</p>
            <p className="text-xs text-red-600 mt-1">{safeProgress.last_error}</p>
          </div>
        )}
      </Card>

      {/* Card Log de ejecución */}
      {executionLog.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="font-semibold mb-4">Log de ejecución</h3>
          <div className="space-y-2">
            {executionLog.map((log, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 border rounded-md text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant={log.action === 'success' ? 'default' : log.action === 'error' ? 'destructive' : 'secondary'} className="font-normal">
                    {log.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.ranAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {log.action === 'success' && (
                    <>
                      <span>{log.processed || 0} procesadas</span>
                      <span>{log.matched || 0} vinculadas</span>
                    </>
                  )}
                  {log.retry_after && (
                    <span className="text-yellow-600">Retry en {log.retry_after}s</span>
                  )}
                  {log.error && (
                    <span className="text-red-600">{log.error}</span>
                  )}
                  <span>{log.elapsed}s</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
            <Button onClick={() => setShowDiagnostic(false)} size="sm" variant="ghost">Cerrar</Button>
          </div>

          {loadingDiagnostic ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !diagnosticData ? (
            <p className="text-sm text-muted-foreground">Sin datos de diagnóstico.</p>
          ) : diagnosticData.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{diagnosticData.error}</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Warnings */}
              {diagnosticData.warnings?.length > 0 && (
                <div className="space-y-2">
                  {diagnosticData.warnings.map((w: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Resumen publicaciones */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Publicaciones</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total", value: diagnosticData.publications?.total },
                    { label: "Vinculadas", value: diagnosticData.publications?.linked },
                    { label: "Sin vincular", value: diagnosticData.publications?.unlinked },
                    { label: "Sin identificador", value: diagnosticData.publications?.unlinked_no_identifier },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md border border-border bg-muted/20 p-3">
                      <p className="text-lg font-bold">{value ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {[
                    { label: "Con EAN", value: diagnosticData.publications?.unlinked_with_ean },
                    { label: "Con ISBN", value: diagnosticData.publications?.unlinked_with_isbn },
                    { label: "Con SKU", value: diagnosticData.publications?.unlinked_with_sku },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md border border-border bg-muted/20 p-3">
                      <p className="text-lg font-bold text-emerald-400">{value ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumen products */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Products</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total", value: diagnosticData.products?.total },
                    { label: "Con EAN", value: diagnosticData.products?.with_ean },
                    { label: "Con ISBN", value: diagnosticData.products?.with_isbn },
                    { label: "Con SKU", value: diagnosticData.products?.with_sku },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md border border-border bg-muted/20 p-3">
                      <p className="text-lg font-bold">{value ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Muestras */}
              {diagnosticData.publications?.sample_with_identifiers?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Muestra publicaciones con identificadores
                  </h4>
                  <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground overflow-auto max-h-40 leading-relaxed">
                    {JSON.stringify(diagnosticData.publications.sample_with_identifiers, null, 2)}
                  </pre>
                </div>
              )}

              {diagnosticData.products?.sample?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Muestra products con identificadores
                  </h4>
                  <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground overflow-auto max-h-40 leading-relaxed">
                    {JSON.stringify(diagnosticData.products.sample, null, 2)}
                  </pre>
                </div>
              )}

              {/* Progreso raw */}
              {diagnosticData.progress && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Estado matcher_progress</h4>
                  <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground overflow-auto max-h-48 leading-relaxed">
                    {JSON.stringify(diagnosticData.progress, null, 2)}
                  </pre>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Generado: {diagnosticData.generated_at ? new Date(diagnosticData.generated_at).toLocaleString() : "—"}
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
