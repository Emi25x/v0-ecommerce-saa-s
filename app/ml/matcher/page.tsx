"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Play, Pause, RefreshCw, Loader2, CheckCircle2, AlertCircle, TrendingUp, XCircle, HelpCircle } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type MatcherOutcome = 'matched' | 'ambiguous' | 'not_found' | 'invalid' | 'skipped' | 'error'

export default function MatcherPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  
  // Progreso en tiempo real
  const [currentRun, setCurrentRun] = useState<any>(null)
  const [progress, setProgress] = useState<any>(null)
  
  // Resultados
  const [results, setResults] = useState<any[]>([])
  const [resultsSummary, setResultsSummary] = useState<any[]>([])
  const [selectedOutcome, setSelectedOutcome] = useState<MatcherOutcome | 'all'>('all')
  const [resultsPage, setResultsPage] = useState(0)
  const [resultsTotal, setResultsTotal] = useState(0)

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (selectedAccountId) {
      fetchLatestRun()
    }
  }, [selectedAccountId])

  // Auto-mode: ejecutar y polling de progreso
  useEffect(() => {
    if (!autoMode || !selectedAccountId) return

    let interval: NodeJS.Timeout

    const runAndPoll = async () => {
      // Si no hay run activo, iniciar uno nuevo
      if (!currentRun || currentRun.status !== 'running') {
        await handleRun()
      }
      
      // Poll progreso cada 2s
      interval = setInterval(async () => {
        if (currentRun?.id) {
          await fetchProgress(currentRun.id)
        }
      }, 2000)
    }

    runAndPoll()

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoMode, selectedAccountId, currentRun])

  // Detener auto-mode cuando el run termina
  useEffect(() => {
    if (autoMode && currentRun && currentRun.status !== 'running') {
      console.log(`[MATCHER] Run finished with status: ${currentRun.status}`)
      
      // Si quedaron pendientes, continuar
      const remaining = progress?.scanned ? (resultTotal - progress.scanned) : 0
      if (remaining > 0) {
        console.log(`[MATCHER] ${remaining} remaining - continuing`)
        setTimeout(() => handleRun(), 1000)
      } else {
        console.log(`[MATCHER] No more remaining - stopping auto-mode`)
        setAutoMode(false)
      }
    }
  }, [currentRun, autoMode, progress])

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

  const fetchLatestRun = async () => {
    if (!selectedAccountId) return

    try {
      const res = await fetch(`/api/ml/matcher/progress?account_id=${selectedAccountId}`)
      const data = await res.json()
      
      if (data.run) {
        setCurrentRun(data.run)
        setProgress(data.progress)
        
        // Cargar resultados si hay run
        if (data.run.id) {
          fetchResults(data.run.id)
        }
      }
    } catch (error) {
      console.error("[MATCHER] Fetch latest run error:", error)
    }
  }

  const fetchProgress = async (runId: string) => {
    try {
      const res = await fetch(`/api/ml/matcher/progress?run_id=${runId}`)
      const data = await res.json()
      
      if (data.run) {
        setCurrentRun(data.run)
        setProgress(data.progress)
      }
    } catch (error) {
      console.error("[MATCHER] Fetch progress error:", error)
    }
  }

  const fetchResults = async (runId: string, outcome: MatcherOutcome | 'all' = 'all', page = 0) => {
    try {
      const params = new URLSearchParams({
        run_id: runId,
        limit: '50',
        offset: String(page * 50)
      })
      
      if (outcome !== 'all') {
        params.append('outcome', outcome)
      }

      const res = await fetch(`/api/ml/matcher/results?${params}`)
      const data = await res.json()
      
      setResults(data.results || [])
      setResultsSummary(data.summary || [])
      setResultsTotal(data.pagination?.total || 0)
      setResultsPage(page)
    } catch (error) {
      console.error("[MATCHER] Fetch results error:", error)
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
          max_seconds: 10,
        }),
      })

      const data = await res.json()
      
      if (data.ok && data.run_id) {
        console.log(`[MATCHER] Run ${data.run_id} started`)
        await fetchProgress(data.run_id)
        await fetchResults(data.run_id)
      }
    } catch (error) {
      console.error("[MATCHER] Run error:", error)
    } finally {
      setRunning(false)
    }
  }

  const handleOutcomeFilter = (outcome: MatcherOutcome | 'all') => {
    setSelectedOutcome(outcome)
    if (currentRun?.id) {
      fetchResults(currentRun.id, outcome, 0)
    }
  }

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'matched': return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'ambiguous': return <HelpCircle className="h-4 w-4 text-yellow-600" />
      case 'not_found': return <XCircle className="h-4 w-4 text-red-600" />
      case 'invalid': return <AlertCircle className="h-4 w-4 text-orange-600" />
      case 'skipped': return <RefreshCw className="h-4 w-4 text-gray-400" />
      case 'error': return <AlertCircle className="h-4 w-4 text-red-600" />
      default: return null
    }
  }

  const getOutcomeBadgeColor = (outcome: string) => {
    switch (outcome) {
      case 'matched': return 'bg-green-100 text-green-800'
      case 'ambiguous': return 'bg-yellow-100 text-yellow-800'
      case 'not_found': return 'bg-red-100 text-red-800'
      case 'invalid': return 'bg-orange-100 text-orange-800'
      case 'skipped': return 'bg-gray-100 text-gray-600'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const progressPercent = progress?.scanned && resultsTotal 
    ? Math.min(100, Math.round((progress.scanned / resultsTotal) * 100))
    : 0

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Matcher PRO</h1>
            <p className="text-muted-foreground">
              Vinculación automática de publicaciones ML con productos
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRun}
              disabled={running || autoMode}
              size="lg"
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
              onClick={() => setAutoMode(!autoMode)}
              variant={autoMode ? "destructive" : "outline"}
              size="lg"
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
          </div>
        </div>

        {/* Selector de cuenta */}
        {accounts.length > 1 && (
          <Card className="p-4">
            <label className="text-sm font-medium">Cuenta ML:</label>
            <select
              value={selectedAccountId || ''}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2"
              disabled={running || autoMode}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.nickname || acc.ml_user_id}
                </option>
              ))}
            </select>
          </Card>
        )}

        {/* Estado del run actual */}
        {currentRun && (
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Run Actual</h2>
              <Badge variant={currentRun.status === 'running' ? 'default' : currentRun.status === 'completed' ? 'secondary' : 'destructive'}>
                {currentRun.status}
              </Badge>
            </div>

            {/* Barra de progreso */}
            <div className="mb-6 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progreso</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              {progress && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progress.scanned} / {resultsTotal} publicaciones</span>
                  {progress.items_per_second && (
                    <span>{progress.items_per_second} items/s</span>
                  )}
                  {progress.estimated_seconds_remaining && (
                    <span>~{progress.estimated_seconds_remaining}s restantes</span>
                  )}
                </div>
              )}
            </div>

            {/* Métricas */}
            {progress && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Vinculadas</span>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{progress.matched}</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Ambiguas</span>
                    <HelpCircle className="h-4 w-4 text-yellow-600" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{progress.ambiguous}</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">No encontradas</span>
                    <XCircle className="h-4 w-4 text-red-600" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{progress.not_found}</p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Inválidas</span>
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{progress.invalid_id}</p>
                </div>
              </div>
            )}

            {currentRun.last_error && (
              <div className="mt-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                <strong>Error:</strong> {currentRun.last_error}
              </div>
            )}
          </Card>
        )}

        {/* Resumen por motivo */}
        {resultsSummary.length > 0 && (
          <Card className="p-6">
            <h2 className="mb-4 text-xl font-semibold">Top Razones</h2>
            <div className="space-y-2">
              {resultsSummary
                .sort((a, b) => b.count - a.count)
                .slice(0, 10)
                .map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      {getOutcomeIcon(item.outcome)}
                      <div>
                        <p className="font-medium">{item.reason_code}</p>
                        <p className="text-sm text-muted-foreground capitalize">{item.outcome}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {/* Resultados detallados */}
        {currentRun && (
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Resultados Detallados</h2>
              <div className="flex gap-2">
                <Button
                  variant={selectedOutcome === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleOutcomeFilter('all')}
                >
                  Todos
                </Button>
                <Button
                  variant={selectedOutcome === 'matched' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleOutcomeFilter('matched')}
                >
                  Vinculadas
                </Button>
                <Button
                  variant={selectedOutcome === 'ambiguous' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleOutcomeFilter('ambiguous')}
                >
                  Ambiguas
                </Button>
                <Button
                  variant={selectedOutcome === 'not_found' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleOutcomeFilter('not_found')}
                >
                  No encontradas
                </Button>
              </div>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ML Item</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Matches</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell className="font-mono text-xs">{result.ml_item_id}</TableCell>
                      <TableCell className="max-w-md truncate">
                        {result.ml_publications?.title || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {result.identifier_type && result.identifier_value_normalized ? (
                          <div>
                            <span className="text-muted-foreground">{result.identifier_type}:</span>{' '}
                            {result.identifier_value_normalized}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getOutcomeBadgeColor(result.outcome)}>
                          {result.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{result.reason_code}</TableCell>
                      <TableCell>{result.match_count ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                  {results.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No hay resultados para mostrar
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginación */}
            {resultsTotal > 50 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando {resultsPage * 50 + 1} - {Math.min((resultsPage + 1) * 50, resultsTotal)} de {resultsTotal}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resultsPage === 0}
                    onClick={() => fetchResults(currentRun.id, selectedOutcome, resultsPage - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(resultsPage + 1) * 50 >= resultsTotal}
                    onClick={() => fetchResults(currentRun.id, selectedOutcome, resultsPage + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
