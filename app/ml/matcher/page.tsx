"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Play, Pause, RefreshCw, Loader2, CheckCircle2, AlertCircle, TrendingUp, XCircle } from "lucide-react"

export default function MatcherPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  
  // Progreso unificado desde ml_matcher_progress
  const [progress, setProgress] = useState<any>(null)

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (selectedAccountId) {
      fetchProgress()
    }
  }, [selectedAccountId])

  // Polling de progreso cada 2s en auto-mode
  useEffect(() => {
    if (!autoMode || !selectedAccountId) return

    const interval = setInterval(() => {
      fetchProgress()
    }, 2000)

    return () => clearInterval(interval)
  }, [autoMode, selectedAccountId])

  // Ejecutar matching cada 15s en auto-mode
  useEffect(() => {
    if (!autoMode || !selectedAccountId) return

    const runInterval = setInterval(() => {
      if (!running) {
        handleRun()
      }
    }, 15000)

    // Primera ejecución inmediata
    if (!running) {
      handleRun()
    }

    return () => clearInterval(runInterval)
  }, [autoMode, selectedAccountId, running])

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/mercadolibre/accounts")
      const data = await res.json()
      setAccounts(data.accounts || [])
      if (data.accounts && data.accounts.length > 0) {
        setSelectedAccountId(data.accounts[0].id)
      }
    } catch (error) {
      console.error("Error loading accounts:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProgress = async () => {
    if (!selectedAccountId) return

    try {
      const res = await fetch(`/api/ml/matcher/progress?account_id=${selectedAccountId}`)
      const data = await res.json()
      setProgress(data)
      
      // Actualizar estado de running basado en status
      if (data.status === 'running') {
        setRunning(true)
      } else if (running) {
        setRunning(false)
      }
    } catch (error) {
      console.error("[MATCHER] Error fetching progress:", error)
    }
  }

  const handleRun = async () => {
    if (!selectedAccountId || running) return

    setRunning(true)

    try {
      const res = await fetch("/api/ml/matcher/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          batch_size: 200,
          max_seconds: 10
        })
      })

      const data = await res.json()
      
      if (data.ok) {
        console.log(`[MATCHER] Run completed: ${data.matched} matched`)
        await fetchProgress()
      } else {
        console.error("[MATCHER] Run failed:", data.error)
      }
    } catch (error) {
      console.error("[MATCHER] Run error:", error)
    } finally {
      setRunning(false)
    }
  }

  const handleToggleAutoMode = () => {
    setAutoMode(!autoMode)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Calcular porcentaje de progreso
  const totalToProcess = progress ? (progress.scanned_count || 0) + (progress.candidate_count - progress.scanned_count || 0) : 0
  const processed = progress?.scanned_count || 0
  const percentage = totalToProcess > 0 ? Math.round((processed / totalToProcess) * 100) : 0

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Matcher PRO</h1>
          <p className="text-muted-foreground">
            Vinculación automática de publicaciones ML con productos del catálogo
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            onClick={handleRun}
            disabled={running || !selectedAccountId}
            variant="default"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Ejecutando...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Ejecutar Matching
              </>
            )}
          </Button>
          
          <Button
            onClick={handleToggleAutoMode}
            variant={autoMode ? "destructive" : "outline"}
          >
            {autoMode ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Detener Auto-mode
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Auto-mode
              </>
            )}
          </Button>

          <Button onClick={fetchProgress} variant="ghost" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Selector de cuenta */}
      {accounts.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Cuenta:</label>
            <select
              value={selectedAccountId || ""}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {/* Mensaje inicial sin runs */}
      {!progress || progress.status === 'idle' && progress.scanned_count === 0 ? (
        <Card className="p-8">
          <div className="text-center py-8">
            <TrendingUp className="mx-auto h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-xl font-semibold mb-3">No hay matching ejecutado aún</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Inicia el proceso de matching para vincular automáticamente publicaciones de MercadoLibre con productos del catálogo usando SKU, ISBN o EAN
            </p>
            <Button onClick={handleRun} size="lg">
              <Play className="mr-2 h-5 w-5" />
              Iniciar Primer Matching
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Estado y progreso */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Estado del Matching</h3>
                <Badge variant={progress.status === 'running' ? 'default' : progress.status === 'completed' ? 'secondary' : 'destructive'}>
                  {progress.status === 'running' ? 'En Ejecución' : progress.status === 'completed' ? 'Completado' : progress.status === 'failed' ? 'Error' : 'Inactivo'}
                </Badge>
              </div>

              {/* Barra de progreso */}
              {progress.status === 'running' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Procesadas: {progress.scanned_count || 0}</span>
                    <span className="font-medium">{percentage}%</span>
                  </div>
                  <Progress value={percentage} />
                  {progress.items_per_second > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{progress.items_per_second} items/seg</span>
                      {progress.eta_seconds && (
                        <span>ETA: {Math.ceil(progress.eta_seconds / 60)}min</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Métricas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold">{progress.matched_count || 0}</div>
                    <div className="text-sm text-muted-foreground">Vinculados</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold">{progress.ambiguous_count || 0}</div>
                    <div className="text-sm text-muted-foreground">Ambiguos</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold">{progress.not_found_count || 0}</div>
                    <div className="text-sm text-muted-foreground">No Encontrados</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-gray-500 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold">{progress.invalid_identifier_count || 0}</div>
                    <div className="text-sm text-muted-foreground">Inválidos</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Totales históricos */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Totales Históricos</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-3xl font-bold text-green-600">{progress.total_matched || 0}</div>
                <div className="text-sm text-muted-foreground">Total Vinculados</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-600">{progress.total_unmatched || 0}</div>
                <div className="text-sm text-muted-foreground">Total No Vinculados</div>
              </div>
            </div>
          </Card>

          {/* Última ejecución */}
          {progress.last_run_at && (
            <Card className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Última ejecución:</span>
                <span className="font-medium">
                  {new Date(progress.last_run_at).toLocaleString('es-AR')}
                </span>
              </div>
              {progress.last_error && (
                <div className="mt-2 text-sm text-red-600">
                  Error: {progress.last_error}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
