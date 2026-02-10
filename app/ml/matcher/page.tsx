"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Play, Pause, RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

export default function MatcherPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [executionLog, setExecutionLog] = useState<any[]>([])

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (selectedAccountId) {
      fetchStats()
    }
  }, [selectedAccountId])

  // Auto-mode: ejecutar cada 3s cuando está activo
  useEffect(() => {
    if (!autoMode || !selectedAccountId || running) return

    // Si ya no hay pendientes, apagar auto-mode
    if (stats && stats.unmatched === 0) {
      console.log("[v0] No unmatched publications - disabling auto-mode")
      setAutoMode(false)
      return
    }

    const interval = setInterval(() => {
      handleRun()
    }, 3000)

    return () => clearInterval(interval)
  }, [autoMode, selectedAccountId, running, stats])

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

  const fetchStats = async () => {
    if (!selectedAccountId) return
    
    try {
      const res = await fetch(`/api/ml/matcher/stats?account_id=${selectedAccountId}`)
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error("Error loading stats:", error)
    }
  }

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
          batch_size: 200,
          max_seconds: 10,
        }),
      })

      const data = await res.json()

      const logEntry = {
        ranAt: new Date().toISOString(),
        action: data.ok ? 'success' : 'error',
        processed: data.processed || 0,
        matched: data.matched || 0,
        remaining: data.remaining || 0,
        elapsed: ((Date.now() - startTime) / 1000).toFixed(1)
      }
      
      setExecutionLog(prev => [logEntry, ...prev].slice(0, 10))

      await fetchStats()
    } catch (error: any) {
      console.error("[MATCHER] Run error:", error)
    } finally {
      setRunning(false)
    }
  }

  const handleStart = async () => {
    setAutoMode(true)
    await handleRun()
  }

  const handlePause = () => {
    setAutoMode(false)
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
      <div className="p-8">
        <Card className="p-6">
          <p className="text-muted-foreground">
            No hay cuentas de MercadoLibre conectadas. Conecta una cuenta primero.
          </p>
        </Card>
      </div>
    )
  }

  const matchedPercent = stats?.total_publications > 0 
    ? Math.round(((stats.total_publications - stats.unmatched) / stats.total_publications) * 100)
    : 0

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Matcher Automático</h1>
        <p className="text-muted-foreground mt-1">
          Vincula publicaciones ML con productos usando SKU, EAN o ISBN
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

      {/* Card Estadísticas */}
      <Card className="p-5 mb-6">
        <h3 className="font-semibold mb-4">Estadísticas</h3>
        
        {stats && (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Progreso</span>
                <span className="text-sm font-medium">{matchedPercent}%</span>
              </div>
              <Progress value={matchedPercent} className="h-2" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-md border">
                <div className="text-2xl font-bold">{stats.total_publications}</div>
                <div className="text-xs text-muted-foreground">Total publicaciones</div>
              </div>

              <div className="p-3 bg-green-50 rounded-md border border-green-200">
                <div className="text-2xl font-bold text-green-700">{stats.auto_matched}</div>
                <div className="text-xs text-green-600">Vinculadas automáticamente</div>
              </div>

              <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                <div className="text-2xl font-bold text-blue-700">{stats.manual_matched}</div>
                <div className="text-xs text-blue-600">Vinculadas manualmente</div>
              </div>

              <div className="p-3 bg-amber-50 rounded-md border border-amber-200">
                <div className="text-2xl font-bold text-amber-700">{stats.unmatched}</div>
                <div className="text-xs text-amber-600">Sin vincular</div>
              </div>
            </div>

            {stats.last_run_at && (
              <div className="mt-3 text-xs text-muted-foreground">
                Última ejecución: {new Date(stats.last_run_at).toLocaleString()}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Card Acciones */}
      <Card className="p-5 mb-6">
        <h3 className="font-semibold mb-4">Acciones</h3>
        
        {stats && stats.unmatched > 0 ? (
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
                    Iniciar matching
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
          </div>
        ) : (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-green-800 font-semibold">Matching completo</p>
                <p className="text-sm text-green-700">Todas las publicaciones vinculables fueron procesadas</p>
              </div>
            </div>
          </div>
        )}

        {autoMode && stats && stats.unmatched > 0 && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 font-medium mb-1">
              Modo automático activo
            </p>
            <p className="text-xs text-blue-600">
              El matcher ejecuta cada 3 segundos hasta vincular todas las publicaciones posibles
            </p>
          </div>
        )}
      </Card>

      {/* Log de ejecución */}
      {executionLog.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Log de ejecución</h3>
          <div className="space-y-2 max-h-60 overflow-auto">
            {executionLog.map((entry, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded border">
                <div className="flex items-center gap-2">
                  <Badge variant={entry.action === 'success' ? 'default' : 'destructive'} className="text-xs">
                    {entry.action}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(entry.ranAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>Procesadas: {entry.processed}</span>
                  <span className="text-green-600">Vinculadas: +{entry.matched}</span>
                  <span className="text-amber-600">Pendientes: {entry.remaining}</span>
                  <span>{entry.elapsed}s</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
