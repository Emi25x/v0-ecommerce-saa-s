"use client"

import React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useState, useEffect } from "react"
import Link from "next/link"

const PackageIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const RefreshIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
  </svg>
)

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

const AlertTriangleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const ExternalLinkIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

export default function DashboardPage() {
  const [mlAccounts, setMlAccounts] = useState<any[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  
  const [importStatus, setImportStatus] = useState<any>(null)
  const [importLoading, setImportLoading] = useState(false)
  
  const [stats, setStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  
  const [syncedCount, setSyncedCount] = useState(0)
  const [syncedLoading, setSyncedLoading] = useState(true)

  // Fetch ML accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/mercadolibre/accounts", { cache: 'no-store' })
        if (!res.ok) {
          setMlAccounts([])
          return
        }
        
        const json = await res.json()
        const accounts = Array.isArray(json) ? json : (json.accounts ?? json.data ?? [])
        setMlAccounts(accounts)
        
        // Auto-select first account
        if (accounts.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accounts[0].id)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch accounts:", error)
        setMlAccounts([])
      } finally {
        setAccountsLoading(false)
      }
    }
    fetchAccounts()
  }, [])

  // Fetch import status when account selected
  useEffect(() => {
    if (!selectedAccountId) return
    
    const fetchImportStatus = async () => {
      setImportLoading(true)
      try {
        const res = await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
        if (res.ok) {
          const data = await res.json()
          setImportStatus(data)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch import status:", error)
      } finally {
        setImportLoading(false)
      }
    }
    
    fetchImportStatus()
    const interval = setInterval(fetchImportStatus, 10000) // Poll every 10s
    return () => clearInterval(interval)
  }, [selectedAccountId])

  // Fetch publication stats
  useEffect(() => {
    if (!selectedAccountId) return
    
    const fetchStats = async () => {
      setStatsLoading(true)
      try {
        const res = await fetch(`/api/debug/import-queue-stats?account_id=${selectedAccountId}`)
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch stats:", error)
      } finally {
        setStatsLoading(false)
      }
    }
    
    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Poll every 30s
    return () => clearInterval(interval)
  }, [selectedAccountId])

  // Fetch synced count (incremental sync)
  useEffect(() => {
    const fetchSynced = async () => {
      try {
        const res = await fetch("/api/inventory/products/synced-count")
        if (res.ok) {
          const data = await res.json()
          setSyncedCount(data.totalSynced || 0)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch synced count:", error)
      } finally {
        setSyncedLoading(false)
      }
    }
    fetchSynced()
    const interval = setInterval(fetchSynced, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRunImport = async () => {
    if (!selectedAccountId) return
    
    try {
      const res = await fetch(`/api/ml/import-pro/run?account_id=${selectedAccountId}`, {
        method: 'POST'
      })
      
      if (res.ok) {
        // Refresh import status immediately
        const statusRes = await fetch(`/api/ml/import-pro/status?account_id=${selectedAccountId}`)
        if (statusRes.ok) {
          const data = await statusRes.json()
          setImportStatus(data)
        }
      }
    } catch (error) {
      console.error("[v0] Failed to run import:", error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'idle':
        return <Badge variant="secondary">Inactivo</Badge>
      case 'running':
        return <Badge className="bg-blue-600">Ejecutando</Badge>
      case 'paused':
        return <Badge variant="outline" className="border-yellow-600 text-yellow-600 bg-transparent">Pausado</Badge>
      case 'done':
        return <Badge className="bg-green-600">Completado</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const progress = importStatus?.publications_total > 0 
    ? (importStatus.publications_offset / importStatus.publications_total) * 100 
    : 0

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <PackageIcon className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Centro de Control ML</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Gestiona tu importación y sincronización de MercadoLibre
          </p>
        </div>

        {/* Sección: Cuentas de Mercado Libre */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Cuentas de Mercado Libre</CardTitle>
            <CardDescription>Selecciona una cuenta para gestionar su importación</CardDescription>
          </CardHeader>
          <CardContent>
            {accountsLoading ? (
              <div className="text-sm text-muted-foreground">Cargando cuentas...</div>
            ) : mlAccounts.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangleIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">No hay cuentas conectadas</p>
                <Button asChild>
                  <Link href="/integrations">Conectar Cuenta ML</Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {mlAccounts.map((account: any) => (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                      selectedAccountId === account.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50 bg-transparent'
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <PackageIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium">{account.nickname || account.ml_user_id}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {account.tokenExpired ? (
                          <>
                            <AlertTriangleIcon className="h-3 w-3 text-red-500" />
                            <span className="text-xs text-red-500">Token expirado</span>
                          </>
                        ) : (
                          <>
                            <CheckCircleIcon className="h-3 w-3 text-green-500" />
                            <span className="text-xs text-green-500">Conectado</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <Link href={`/ml/importer?account_id=${account.id}`}>
                        <ExternalLinkIcon className="h-4 w-4" />
                      </Link>
                    </Button>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedAccountId && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Card grande: Importación Inicial */}
            <Card className="lg:row-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Importación Inicial</CardTitle>
                    <CardDescription>Estado de la importación de publicaciones</CardDescription>
                  </div>
                  {importStatus && getStatusBadge(importStatus.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {importLoading ? (
                  <div className="text-sm text-muted-foreground">Cargando estado...</div>
                ) : !importStatus ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-4">No hay datos de importación</p>
                    <Button onClick={handleRunImport}>Iniciar Importación</Button>
                  </div>
                ) : (
                  <>
                    {/* Alcance */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Alcance</h4>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="bg-transparent">
                          Publicaciones: {importStatus.publications_scope === 'active_only' ? 'Solo activas' : 'Todas'}
                        </Badge>
                        <Badge variant="outline" className="bg-transparent">
                          Actividad: últimos {importStatus.activity_days || 30} días
                        </Badge>
                      </div>
                    </div>

                    {/* Progreso */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">Progreso de Publicaciones</h4>
                        <span className="text-sm text-muted-foreground">
                          {importStatus.publications_offset?.toLocaleString() || 0} / {importStatus.publications_total?.toLocaleString() || 0}
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {progress.toFixed(1)}% completado
                      </p>
                    </div>

                    {/* Última ejecución */}
                    {importStatus.last_run_at && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Última ejecución</h4>
                        <p className="text-sm text-muted-foreground">
                          {new Date(importStatus.last_run_at).toLocaleString('es-ES')}
                        </p>
                      </div>
                    )}

                    {/* Pausado */}
                    {importStatus.status === 'paused' && importStatus.paused_until && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-sm text-yellow-800">
                          Pausado por rate limit. Reintento automático en{' '}
                          {Math.max(0, Math.ceil((new Date(importStatus.paused_until).getTime() - Date.now()) / 1000))}s
                        </p>
                      </div>
                    )}

                    {/* Error */}
                    {importStatus.last_error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-xs text-red-800">{importStatus.last_error}</p>
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="flex gap-3">
                      <Button onClick={handleRunImport} className="flex-1">
                        {importStatus.status === 'idle' ? 'Iniciar' : 'Reanudar'}
                      </Button>
                      <Button variant="outline" asChild className="bg-transparent">
                        <Link href={`/ml/importer?account_id=${selectedAccountId}`}>
                          Ver Detalles
                          <ExternalLinkIcon className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Card: Publicaciones */}
            <Card>
              <CardHeader>
                <CardTitle>Publicaciones</CardTitle>
                <CardDescription>Estado de publicaciones importadas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {statsLoading ? (
                  <div className="text-sm text-muted-foreground">Cargando métricas...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">{stats?.total_publications?.toLocaleString() || 0}</p>
                      <p className="text-xs text-muted-foreground">Total importadas</p>
                    </div>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-2xl font-bold text-green-700">{stats?.matched_publications?.toLocaleString() || 0}</p>
                      <p className="text-xs text-green-700">Vinculadas</p>
                    </div>
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-2xl font-bold text-yellow-700">{stats?.unmatched_publications?.toLocaleString() || 0}</p>
                      <p className="text-xs text-yellow-700">Sin producto</p>
                    </div>
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-2xl font-bold text-blue-700">{stats?.updated_last_hour?.toLocaleString() || 0}</p>
                      <p className="text-xs text-blue-700">Última hora</p>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 bg-transparent" asChild>
                    <Link href="/ml/publications">Ver Publicaciones</Link>
                  </Button>
                  <Button variant="outline" className="flex-1 bg-transparent" asChild>
                    <Link href="/ml/unmatched">Resolver Sin Producto</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Card: Sincronización Incremental */}
            <Card>
              <CardHeader>
                <CardTitle>Sincronización Incremental</CardTitle>
                <CardDescription>Stock y precio en tiempo real</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {syncedLoading ? (
                  <div className="text-sm text-muted-foreground">Cargando...</div>
                ) : (
                  <>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">{syncedCount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Productos sincronizados</p>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      La sincronización de stock y precio se ejecuta automáticamente cada hora. Los cambios en inventario se reflejan en MercadoLibre en tiempo real.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {!selectedAccountId && mlAccounts.length > 0 && (
          <div className="text-center py-12">
            <AlertTriangleIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Selecciona una cuenta para ver el estado de importación</p>
          </div>
        )}
      </main>
    </div>
  )
}
