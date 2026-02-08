"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { SyncStatusCard } from "@/components/sync-status-card"


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

const ShoppingBagIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
)

const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)

const AlertCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

export default function DashboardPage() {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string>("")

  const [accountsData, setAccountsData] = useState<any>(null)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState(false)
  const [productsData, setProductsData] = useState<any>({ products: [], paging: { total: 0, limit: 1, offset: 0 } })
  const [productsLoading, setProductsLoading] = useState(true)
  const [competitionStats, setCompetitionStats] = useState<any>(null)
  const [syncedData, setSyncedData] = useState<any>({ totalSynced: 0, libralSynced: 0 })
  const [syncedLoading, setSyncedLoading] = useState(true)
  const [updatingStock, setUpdatingStock] = useState(false)
  const [stockMessage, setStockMessage] = useState<string>("")

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/mercadolibre/accounts")
        
        // Verificar si la respuesta es exitosa
        if (!res.ok) {
          console.error("[v0] ML accounts fetch failed with status:", res.status)
          setAccountsError(true)
          setAccountsData({ accounts: [] })
          return
        }
        
        const json = await res.json()
        
        // Debug: log formato de respuesta (solo en desarrollo)
        if (process.env.NODE_ENV !== 'production') {
          console.log("[v0] ML accounts response format:", json)
        }
        
        // Robustecer parseo: soportar múltiples formatos
        // A) { accounts: [...] } - formato actual
        // B) { data: [...] } - formato alternativo
        // C) [...] - array directo
        const accounts = Array.isArray(json) ? json : (json.accounts ?? json.data ?? [])
        
        setAccountsData({ accounts })
        setAccountsError(false)
      } catch (error) {
        console.error("[v0] Failed to fetch accounts:", error)
        setAccountsError(true)
        setAccountsData({ accounts: [] })
      } finally {
        setAccountsLoading(false)
      }
    }
    fetchAccounts()
    // Desactivar el interval para evitar rate limit
    // const interval = setInterval(fetchAccounts, 30000)
    // return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchProducts = async () => {
      // DESACTIVADO: No hacer llamadas a ML cada 30s - consume cuota
      // Los datos se sincronizan automáticamente con el cron a las 9:00 AM
      console.log("[v0] ML items fetch desactivado (se sincroniza con cron)")
      setProductsData({ products: [], paging: { total: 0, limit: 1, offset: 0 } })
      setProductsLoading(false)
    }
    fetchProducts()
    // const interval = setInterval(fetchProducts, 30000)
    // return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchCompetition = async () => {
      try {
        const res = await fetch("/api/competition/stats")
        const data = await res.json()
        setCompetitionStats(data)
      } catch (error) {
        console.error("[v0] Failed to fetch competition stats:", error)
      }
    }
    fetchCompetition()
    const interval = setInterval(fetchCompetition, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchSynced = async () => {
      try {
        console.log("[v0] Fetching synced count...")
        const res = await fetch("/api/inventory/products/synced-count")
        console.log("[v0] Synced count response status:", res.status)

        if (!res.ok) {
          const text = await res.text()
          console.error("[v0] Synced count error response:", text)
          throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`)
        }

        const data = await res.json()
        console.log("[v0] Synced count data:", data)
        setSyncedData(data)
      } catch (error) {
        console.error("[v0] Failed to fetch synced count:", error)
        setSyncedData({ totalSynced: 0, libralSynced: 0 })
      } finally {
        setSyncedLoading(false)
      }
    }
    fetchSynced()
    const interval = setInterval(fetchSynced, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const savedLastSync = localStorage.getItem("lastSync")
    if (savedLastSync) {
      setLastSync(savedLastSync)
    }
  }, [])

  const mlAccounts = accountsData?.accounts || []
  const mlProductsCount = productsData?.paging?.total || 0
  const syncedProductsCount = syncedData?.totalSynced || 0
  const loading = accountsLoading || productsLoading

  const handleUpdateStock = async () => {
    setUpdatingStock(true)
    setStockMessage("Actualizando stock desde proveedores...")
    try {
      const response = await fetch("/api/cron/import-schedules", { method: "GET" })
      const data = await response.json()
      
      if (data.success || data.executed) {
        setStockMessage(`Stock actualizado: ${data.executed || 0} fuentes procesadas`)
        // Refrescar datos
        const syncedRes = await fetch("/api/inventory/products/synced-count")
        const syncedResult = await syncedRes.json()
        setSyncedData(syncedResult)
        setTimeout(() => setStockMessage(""), 5000)
      } else {
        setStockMessage(data.message || "No hay actualizaciones pendientes")
        setTimeout(() => setStockMessage(""), 5000)
      }
    } catch (error) {
      console.error("[v0] Stock update failed:", error)
      setStockMessage("Error al actualizar stock")
      setTimeout(() => setStockMessage(""), 5000)
    } finally {
      setUpdatingStock(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage("Sincronizando productos...")
    try {
      const response = await fetch("/api/sync", { method: "POST" })
      const data = await response.json()

      if (data.success) {
        const syncTime = new Date().toLocaleString("es-ES")
        setLastSync(syncTime)
        localStorage.setItem("lastSync", syncTime)
        setSyncMessage(`Sincronización completada: ${data.synced || 0} productos`)

        // Solo refrescar accounts (mercadolibre/accounts no hace llamadas a ML)
        try {
          const accountsRes = await fetch("/api/mercadolibre/accounts")
          if (accountsRes.ok) {
            const accountsData = await accountsRes.json()
            setAccountsData(accountsData)
          }
        } catch (e) {
          console.error("[v0] Error refreshing accounts:", e)
        }

        setTimeout(() => setSyncMessage(""), 5000)
      } else {
        setSyncMessage("Error en la sincronización")
      }
    } catch (error) {
      console.error("[v0] Sync failed:", error)
      setSyncMessage("Error en la sincronización")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <PackageIcon className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Ecommerce Manager</h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {syncMessage && <span className="text-sm text-muted-foreground">{syncMessage}</span>}
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshIcon className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Gestiona tus productos y sincroniza entre plataformas
            {lastSync && <span className="ml-2 text-xs">• Última actualización: {lastSync}</span>}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cuentas ML</CardTitle>
              <PackageIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : mlAccounts.length}</div>
  <p className="text-xs text-muted-foreground">
  {accountsError ? "Error cargando cuentas" : mlAccounts.length === 0 ? "No hay cuentas conectadas" : "Cuentas activas"}
  </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Publicaciones ML</CardTitle>
              <PackageIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "..." : mlProductsCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total en todas las cuentas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Productos Sincronizados</CardTitle>
              <RefreshIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{syncedLoading ? "..." : syncedProductsCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {syncedData?.libralSynced ? `${syncedData.libralSynced} desde Libral` : "Desde fuentes externas"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Competencia</CardTitle>
              <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{competitionStats?.winning || 0}</div>
              <p className="text-xs text-muted-foreground">
                Productos ganando • {competitionStats?.losing || 0} perdiendo
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Botón prominente para actualizar stock */}
        <div className="mt-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6">
              <div>
                <h3 className="text-lg font-semibold">Actualizar Stock de Proveedores</h3>
                <p className="text-sm text-muted-foreground">
                  Ejecuta la importación de stock desde Arnoia y otras fuentes
                  {stockMessage && <span className="ml-2 text-primary font-medium">• {stockMessage}</span>}
                </p>
              </div>
              <Button 
                onClick={handleUpdateStock} 
                disabled={updatingStock}
                size="lg"
                className="min-w-[200px]"
              >
                <RefreshIcon className={`mr-2 h-5 w-5 ${updatingStock ? "animate-spin" : ""}`} />
                {updatingStock ? "Actualizando..." : "Actualizar Stock Ahora"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alertas</CardTitle>
              <AlertCircleIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{competitionStats?.penalized || 0}</div>
              <p className="text-xs text-muted-foreground">Productos penalizados</p>
            </CardContent>
          </Card>
          
          {/* Card de Estado de Sincronización ML */}
          <div className="md:col-span-2">
            <SyncStatusCard />
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cuentas de Mercado Libre</CardTitle>
              <CardDescription>Gestiona tus cuentas conectadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
  {loading ? (
  <div className="text-sm text-muted-foreground">Cargando...</div>
  ) : accountsError ? (
  <div className="text-center py-4">
  <p className="text-sm text-red-500 mb-4">Error cargando cuentas. Intenta recargar la página.</p>
  </div>
  ) : mlAccounts.length === 0 ? (
  <div className="text-center py-4">
  <p className="text-sm text-muted-foreground mb-4">No hay cuentas conectadas</p>
                  <Button asChild>
                    <a href="/integrations">Conectar Cuenta</a>
                  </Button>
                </div>
              ) : (
                <>
                  {mlAccounts.slice(0, 3).map((account: any) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-lg border border-border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <PackageIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{account.nickname || account.ml_user_id}</p>
                          <p className="text-sm text-muted-foreground">
                            {account.expired ? (
                              <span className="text-red-500">Token expirado</span>
                            ) : (
                              <span className="text-green-500">Conectado</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href="/integrations">Ver</a>
                      </Button>
                    </div>
                  ))}
                  {mlAccounts.length > 3 && (
                    <Button variant="outline" className="w-full bg-transparent" asChild>
                      <a href="/integrations">Ver todas las cuentas ({mlAccounts.length})</a>
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>Últimas sincronizaciones y cambios</CardDescription>
            </CardHeader>
            <CardContent>
              {lastSync || mlProductsCount > 0 || competitionStats?.analyzed > 0 ? (
                <div className="space-y-3">
                  {lastSync && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <RefreshIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Sincronización completada</p>
                        <p className="text-xs text-muted-foreground">{lastSync}</p>
                      </div>
                    </div>
                  )}
                  {mlProductsCount > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        <PackageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{mlProductsCount.toLocaleString()} productos activos</p>
                        <p className="text-xs text-muted-foreground">En Mercado Libre</p>
                      </div>
                    </div>
                  )}
                  {competitionStats && competitionStats.analyzed > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                        <TrendingUpIcon className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{competitionStats.analyzed} productos analizados</p>
                        <p className="text-xs text-muted-foreground">
                          {competitionStats.winning} ganando, {competitionStats.losing} perdiendo
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  No hay actividad reciente
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
