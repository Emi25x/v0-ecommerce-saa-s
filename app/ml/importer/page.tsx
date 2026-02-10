"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { RefreshCw, Play, Pause, RotateCcw, Loader2 } from "lucide-react"

export default function MLImporterPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [progress, setProgress] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [runResult, setRunResult] = useState<any>(null)
  const [showDiagnostic, setShowDiagnostic] = useState(false)
  const [diagnosticData, setDiagnosticData] = useState<any>(null)
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false)

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

  // Cargar estado de importación
  useEffect(() => {
    if (!selectedAccountId) return
    
    fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setProgress(data.progress)
        }
      })
      .catch((err) => {
        console.error("[IMPORTER] Error loading status:", err)
      })
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

      // Recargar progress
      const statusRes = await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
      const statusData = await statusRes.json()
      if (statusData.ok) {
        setProgress(statusData.progress)
      }

      // Si está pausado o completo, detener auto-mode
      if (data.paused || statusData.progress?.status === "done") {
        setAutoMode(false)
      }
    } catch (error: any) {
      console.error("[IMPORTER] Run error:", error)
      setRunResult({ error: error.message })
      setAutoMode(false)
    } finally {
      setRunning(false)
    }
  }

  const handleStart = async () => {
    if (!selectedAccountId) return

    // Actualizar a running
    const supabase = await import("@/lib/supabase/server").then(m => m.createClient())
    
    setAutoMode(true)
    
    // Actualizar status a running
    await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
      .then(() => handleRun())
  }

  const handlePause = () => {
    setAutoMode(false)
  }

  const handleReset = async () => {
    if (!selectedAccountId) return
    if (!confirm("¿Reiniciar importación desde cero? Esto no borra publicaciones ya importadas.")) return

    try {
      // Reset offset to 0
      const supabase = await import("@/lib/supabase/client").then(m => m.createClient())
      // Note: This would need a server endpoint to properly reset
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

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Importador ML Pro</h1>
        <p className="text-muted-foreground">
          Importación inicial completa de todas tus publicaciones de MercadoLibre
        </p>
      </div>

      {/* Selector de cuenta */}
      <Card className="p-6 mb-6">
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

      {/* Información */}
      <Card className="p-6 mb-6 bg-blue-50 border-blue-200">
        <h3 className="font-semibold mb-2">¿Qué hace esta importación?</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Importa TODAS tus publicaciones de MercadoLibre (activas, pausadas y finalizadas)</li>
          <li>Extrae SKU, ISBN y GTIN de cada publicación</li>
          <li>Vincula automáticamente con productos existentes por código</li>
          <li>Proceso reanudable: podés pausar y continuar cuando quieras</li>
          <li>Respeta límites de la API de ML (maneja rate limits automáticamente)</li>
        </ul>
        
        {progress && (
          <div className="mt-4 pt-4 border-t border-blue-300">
            <p className="text-xs font-medium text-blue-900 mb-1">Alcance configurado:</p>
            <div className="flex gap-4 text-xs text-blue-700">
              <div>
                <span className="font-medium">Publicaciones:</span>{" "}
                {progress.publications_scope === 'active_only' ? 'Solo activas' : 'Todas'}
              </div>
              <div>
                <span className="font-medium">Actividad:</span> últimos {progress.activity_days || 30} días
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Estado actual */}
      {progress && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Estado de Importación</h3>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                progress.status === "running"
                  ? "bg-blue-100 text-blue-700"
                  : progress.status === "done"
                  ? "bg-green-100 text-green-700"
                  : progress.status === "paused"
                  ? "bg-yellow-100 text-yellow-700"
                  : progress.status === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {progress.status === "running"
                ? "Ejecutando"
                : progress.status === "done"
                ? "Completado"
                : progress.status === "paused"
                ? "Pausado"
                : progress.status === "error"
                ? "Error"
                : "Listo"}
            </span>
          </div>

          {/* Progreso publicaciones */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Publicaciones</span>
              <span className="text-sm text-muted-foreground">
                {progress.publications_offset} / {progress.publications_total || "?"}
              </span>
            </div>
            <Progress value={progress.publications_progress || 0} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {progress.publications_progress || 0}% completado
            </p>
          </div>

          {/* Última ejecución */}
          {progress.last_run_at && (
            <p className="text-xs text-muted-foreground">
              Última ejecución: {new Date(progress.last_run_at).toLocaleString()}
            </p>
          )}

          {/* Error */}
          {progress.last_error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{progress.last_error}</p>
            </div>
          )}

          {/* Pausado por rate limit */}
          {progress.status === "paused" && progress.paused_until && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-700">
                Pausado por límite de API hasta{" "}
                {new Date(progress.paused_until).toLocaleTimeString()}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Resultado última ejecución */}
      {runResult && (
        <Card className="p-4 mb-6 bg-green-50 border-green-200">
          <p className="text-sm font-medium mb-1">Última ejecución:</p>
          {runResult.ok ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>✓ {runResult.publications_processed} publicaciones procesadas</p>
              <p>✓ {runResult.details_processed} detalles importados</p>
              <p>
                ✓ {runResult.matched} vinculados | {runResult.unmatched} sin vincular
              </p>
              <p>⏱ {runResult.elapsed_seconds}s</p>
            </div>
          ) : runResult.paused ? (
            <p className="text-sm text-yellow-700">
              Pausado por rate limit ({runResult.wait_seconds}s)
            </p>
          ) : (
            <p className="text-sm text-red-700">{runResult.error || "Error desconocido"}</p>
          )}
        </Card>
      )}

      {/* Controles */}
      <div className="flex gap-3">
        {!autoMode && progress?.status !== "done" && (
          <Button onClick={handleStart} disabled={running} size="lg" className="flex-1">
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
          <Button onClick={handlePause} size="lg" variant="outline" className="flex-1 bg-transparent">
            <Pause className="mr-2 h-4 w-4" />
            Pausar Auto-Mode
          </Button>
        )}

        {progress?.status === "done" && (
          <div className="flex-1 p-4 bg-green-50 border border-green-200 rounded-md text-center">
            <p className="text-green-700 font-medium">✓ Importación completada</p>
          </div>
        )}

        {!autoMode && !running && progress && progress.publications_offset > 0 && (
          <Button onClick={handleReset} size="lg" variant="outline" className="bg-transparent">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reiniciar
          </Button>
        )}

        <Button 
          onClick={handleDiagnostic} 
          size="lg" 
          variant="outline"
          disabled={loadingDiagnostic}
          className="bg-transparent"
        >
          {loadingDiagnostic ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Ver Diagnóstico
        </Button>
      </div>

      {/* Panel de diagnóstico */}
      {showDiagnostic && (
        <Card className="mt-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Diagnóstico del Importador</h3>
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
                  {/* Progress data */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Estado de Progreso</h4>
                    <pre className="p-4 bg-gray-50 border rounded-md text-xs overflow-auto">
                      {JSON.stringify(diagnosticData.progress, null, 2)}
                    </pre>
                  </div>

                  {/* Stats data */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Estadísticas de Cola</h4>
                    <pre className="p-4 bg-gray-50 border rounded-md text-xs overflow-auto">
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

      {autoMode && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700">
            🔄 Auto-mode activo: ejecutando automáticamente cada 3 segundos
          </p>
        </div>
      )}
    </div>
  )
}
