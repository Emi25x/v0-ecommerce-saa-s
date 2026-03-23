"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RefreshCw, Download, Link2, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react"

interface Account {
  id: string
  nickname: string
}

interface SyncStatus {
  account: {
    id: string
    nickname: string
    total_ml_publications: number
    last_sync: string | null
  }
  publications: {
    total: number
    linked: number
    unlinked: number
    by_status: Record<string, number>
    by_match_type: Record<string, number>
  }
  matcher_progress: any
  latest_run: any
}

export default function MLBootstrapPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Load accounts
  useEffect(() => {
    fetch("/api/mercadolibre/accounts")
      .then((r) => r.json())
      .then((data) => {
        const accs = data.accounts || []
        setAccounts(accs)
        if (accs.length === 1) setSelectedAccount(accs[0].id)
      })
      .catch(() => setError("Error cargando cuentas ML"))
  }, [])

  // Load status when account selected
  const loadStatus = useCallback(async () => {
    if (!selectedAccount) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ml/bootstrap-sync?account_id=${selectedAccount}`)
      const data = await res.json()
      if (data.success) {
        setStatus(data)
      } else {
        setError(data.error)
      }
    } catch {
      setError("Error cargando estado")
    } finally {
      setLoading(false)
    }
  }, [selectedAccount])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Run bootstrap sync
  const runSync = async (options: { skipMatching?: boolean; limit?: number } = {}) => {
    if (!selectedAccount) return
    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const res = await fetch("/api/ml/bootstrap-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccount,
          skip_matching: options.skipMatching ?? false,
          limit: options.limit ?? 0,
        }),
      })
      const data = await res.json()
      setSyncResult(data)
      if (!data.success) {
        setError(data.error || "Error en sincronización")
      }
      // Refresh status
      await loadStatus()
    } catch {
      setError("Error ejecutando sync")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bootstrap Sync — Mercado Libre</h1>
        <p className="text-muted-foreground mt-1">
          Importa publicaciones existentes de una cuenta ML conectada y las vincula al catálogo de productos.
        </p>
      </div>

      {/* Account selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cuenta ML</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Seleccionar cuenta..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.nickname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current status */}
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando estado...
        </div>
      )}

      {status && !loading && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatsCard
              label="Publicaciones ML"
              value={status.publications.total}
              icon={<Download className="h-4 w-4" />}
            />
            <StatsCard
              label="Vinculadas"
              value={status.publications.linked}
              icon={<Link2 className="h-4 w-4 text-green-500" />}
              subtitle={
                status.publications.total > 0
                  ? `${Math.round((status.publications.linked / status.publications.total) * 100)}%`
                  : undefined
              }
            />
            <StatsCard
              label="Sin vincular"
              value={status.publications.unlinked}
              icon={<XCircle className="h-4 w-4 text-orange-500" />}
            />
            <StatsCard
              label="Total en ML"
              value={status.account.total_ml_publications ?? 0}
              icon={<RefreshCw className="h-4 w-4" />}
              subtitle={status.account.last_sync ? `Sync: ${new Date(status.account.last_sync).toLocaleDateString()}` : undefined}
            />
          </div>

          {/* By status */}
          {Object.keys(status.publications.by_status).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Por estado ML</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(status.publications.by_status).map(([s, count]) => (
                    <Badge key={s} variant={s === "active" ? "default" : "secondary"}>
                      {s}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* By match type */}
          {Object.keys(status.publications.by_match_type).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tipo de vinculación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(status.publications.by_match_type).map(([type, count]) => (
                    <Badge key={type} variant="outline">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Latest run */}
          {status.latest_run && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Última ejecución</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  {status.latest_run.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : status.latest_run.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span className="font-medium capitalize">{status.latest_run.status}</span>
                  {status.latest_run.duration_ms && (
                    <span className="text-sm text-muted-foreground">
                      ({(status.latest_run.duration_ms / 1000).toFixed(1)}s)
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-2">
                  <span>Procesados: {status.latest_run.rows_processed ?? 0}</span>
                  <span>Creados: {status.latest_run.rows_created ?? 0}</span>
                  <span>Vinculados: {status.latest_run.rows_updated ?? 0}</span>
                  <span>Errores: {status.latest_run.rows_failed ?? 0}</span>
                </div>
                {status.latest_run.started_at && (
                  <div className="text-xs text-muted-foreground">
                    {new Date(status.latest_run.started_at).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Sync result (after running) */}
      {syncResult && (
        <Card className={syncResult.success ? "border-green-200" : "border-red-200"}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {syncResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Resultado del sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {syncResult.fetch && (
              <div>
                <h4 className="font-medium text-sm mb-1">Fase 1: Importación</h4>
                <div className="text-sm text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-1">
                  <span>Total en ML: {syncResult.fetch.total_in_ml}</span>
                  <span>Importados: {syncResult.fetch.fetched}</span>
                  <span>Guardados: {syncResult.fetch.upserted}</span>
                  <span>Errores: {syncResult.fetch.errors}</span>
                </div>
              </div>
            )}
            {syncResult.match && (
              <div>
                <h4 className="font-medium text-sm mb-1">Fase 2: Vinculación</h4>
                <div className="text-sm text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-1">
                  <span>Vinculados: {syncResult.match.matched}</span>
                  <span>Ambiguos: {syncResult.match.ambiguous}</span>
                  <span>No encontrados: {syncResult.match.not_found}</span>
                  <span>Sin identificador: {syncResult.match.invalid}</span>
                </div>
              </div>
            )}
            {syncResult.error && (
              <Alert variant="destructive">
                <AlertDescription>{syncResult.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {selectedAccount && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Acciones</CardTitle>
            <CardDescription>
              El bootstrap sync puede tardar varios minutos dependiendo de la cantidad de publicaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              onClick={() => runSync()}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Sync completo (importar + vincular)
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => runSync({ skipMatching: true })}
              disabled={syncing}
            >
              <Download className="h-4 w-4 mr-2" />
              Solo importar (sin vincular)
            </Button>

            <Button
              variant="outline"
              onClick={() => runSync({ limit: 50 })}
              disabled={syncing}
            >
              Test (50 items)
            </Button>

            <Button
              variant="ghost"
              onClick={loadStatus}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refrescar estado
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatsCard({
  label,
  value,
  icon,
  subtitle,
}: {
  label: string
  value: number
  icon: React.ReactNode
  subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}
