"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Play, Pause, RotateCcw, Loader2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"

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
          fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`)
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

  // Auto-mode: ejecutar cada 3s si está en running
  useEffect(() => {
    if (!autoMode || !selectedAccountId || !progress) return
    if (progress.status !== "running") return

    const interval = setInterval(() => {
      handleRun()
    }, 3000)

    return () => clearInterval(interval)
  }, [autoMode, selectedAccountId, progress])

  const handleRun = async () => {
    if (!selectedAccountId) return
    
    setRunning(true)
    const startTime = Date.now()
    
    try {
      const res = await fetch("/api/ml/import-pro/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          max_seconds: 20,
          publications_page: 50,
          detail_batch: 20,
        }),
      })

      const data = await res.json()
      setRunResult(data)

      // Agregar a log de ejecución
      const logEntry = {
        ranAt: new Date().toISOString(),
        action: data.ok ? (data.paused ? 'paused' : 'success') : 'error',
        imported_delta: data.publications_processed || 0,
        matched_delta: data.matched || 0,
        retry_after: data.paused ? data.wait_seconds : null,
        elapsed: ((Date.now() - startTime) / 1000).toFixed(1)
      }
      
      setExecutionLog(prev => [logEntry, ...prev].slice(0, 10))

      // Recargar progress y stats
      const [statusRes, statsRes] = await Promise.all([
        fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`),
        fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`)
      ])
      
      const statusData = await statusRes.json()
      const statsData = await statsRes.json()
      
      if (statusData.ok) {
        setProgress(statusData.progress)
      }
      
      if (statsData.ok) {
        setStats(statsData)
      }

      // Si está pausado o completo, detener auto-mode
      if (data.paused || statusData.progress?.status === "done") {
        setAutoMode(false)
      }
    } catch (error: any) {
      console.error("[IMPORTER] Run error:", error)
      setRunResult({ error: error.message })
      setAutoMode(false)
      
      setExecutionLog(prev => [{
        ranAt: new Date().toISOString(),
        action: 'error',
        error: error.message,
        elapsed: ((Date.now() - startTime) / 1000).toFixed(1)
      }, ...prev].slice(0, 10))
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
    if (!confirm("¿Reiniciar importación desde cero? Esto no borra publicaciones ya importadas.")) return

    try {
      alert("Reset function needs server endpoint implementation")
    } catch (error: any) {
      console.error("[IMPORTER] Reset error:", error)
    }
  }

  const handleDiagnostic = async () => {
    if (!selectedAccountId) return
    
    setLoadingDiagnostic(true)
    setShowDiagnostic(true)
    
    try {
      const [progressRes, statsRes] = await Promise.all([
        fetch(`/api/debug/import-progress?account_id=${selectedAccountId}`),
        fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`)
      ])
      
      const progressData = await progressRes.json()
      const statsData = await statsRes.json()
      
      setDiagnosticData({
        progress: progressData,
        stats: statsData,
        timestamp: new Date().toISOString()
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
    error: "bg-red-100 text-red-700"
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Importación inicial Mercado Libre</h1>
        <p className="text-muted-foreground">
          Importa publicaciones y actividad para sincronizar tu catálogo
        </p>
      </div>

      {/* Selector de cuenta */}
      <Card className="p-4 mb-6">
        <label className="text-sm font-medium mb-2 block">Cuenta de MercadoLibre</label>
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
        
        <div className="flex gap-3">
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Publicaciones</span>
            <Badge variant="secondary" className="font-normal">
              {progress?.publications_scope === 'active_only' ? 'Solo activas' : 'Todas'}
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
                <span className="text-sm font-medium">Publicaciones</span>
                <span className="text-sm text-muted-foreground">
                  {progress.publications_offset.toLocaleString()} / {progress.publications_total?.toLocaleString() || "?"}
                </span>
              </div>
              <Progress value={progress.publications_progress || 0} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {(progress.publications_progress || 0).toFixed(1)}% completado
              </p>
            </div>

            {progress.last_run_at && (
              <p className="text-xs text-muted-foreground">
                Última ejecución: {new Date(progress.last_run_at).toLocaleString()}
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

            {progress.last_error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm text-red-800 font-medium">Error</p>
                  <p className="text-xs text-red-700">{progress.last_error}</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Card Acciones */}
      <Card className="p-5 mb-6">
        <h3 className="font-semibold mb-4">Acciones</h3>
        <div className="flex flex-wrap gap-3">
          {!autoMode && progress?.status !== "done" && (
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

          {!autoMode && !running && progress?.status !== "done" && (
            <Button onClick={handleRun} disabled={running} size="lg" variant="outline" className="bg-transparent">
              <RefreshCw className="mr-2 h-4 w-4" />
              Paso (1 corrida)
            </Button>
          )}

          {!autoMode && !running && progress && progress.publications_offset > 0 && (
            <Button onClick={handleReset} size="lg" variant="destructive">
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        {progress?.status === "done" && (
          <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-md text-center">
            <p className="text-green-700 font-medium">✓ Importación completada</p>
          </div>
        )}

        {autoMode && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700">
              🔄 Modo automático activo - ejecutando cada 3 segundos
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
              <p className="text-2xl font-bold text-yellow-600">{stats.unmatched_publications?.toLocaleString() || 0}</p>
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
                      <span>{log.imported_delta} importadas</span>
                      <span>{log.matched_delta} vinculadas</span>
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
            <Button 
              onClick={() => setShowDiagnostic(false)} 
              size="sm" 
              variant="ghost"
            >
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
