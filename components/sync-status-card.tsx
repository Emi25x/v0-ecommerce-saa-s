"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle, XCircle, RefreshCw, Package, TrendingUp } from "lucide-react"

interface AccountSyncStatus {
  id: string
  nickname: string
  auto_sync_stock: boolean
  auto_sync_new_listings: boolean
  last_stock_sync_at: string | null
  last_new_listings_sync_at: string | null
  stock_sync_count: number
  new_listings_count: number
}

interface AccountStats {
  total_in_ml: number
  total_publications: number
  linked_publications: number
  active_publications: number
  unlinked_publications: number
  pending_import: number
}

export function SyncStatusCard() {
  const [accounts, setAccounts] = useState<AccountSyncStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [accountStats, setAccountStats] = useState<Record<string, AccountStats>>({})
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncAllResult, setSyncAllResult] = useState<string | null>(null)
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [autoSyncResult, setAutoSyncResult] = useState<string | null>(null)

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()
      if (data.accounts) {
        setAccounts(data.accounts)
        // Fetch stats for each account
        for (const account of data.accounts) {
          fetchAccountStats(account.id)
        }
      }
    } catch (error) {
      console.error("Error fetching accounts:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAccountStats = async (accountId: string) => {
    try {
      const response = await fetch(`/api/ml/account-stats?account_id=${accountId}`)
      const stats = await response.json()
      if (!stats.error) {
        setAccountStats(prev => ({ ...prev, [accountId]: stats }))
      }
    } catch (error) {
      console.error("Error fetching account stats:", error)
    }
  }

  const handleAutoSyncComplete = async () => {
    setAutoSyncing(true)
    setAutoSyncResult("Iniciando sincronización automática completa...")
    
    try {
      const response = await fetch("/api/cron/auto-sync-all-accounts", {
        method: "POST"
      })
      
      if (response.ok) {
        const data = await response.json()
        setAutoSyncResult(`✓ Sincronización iniciada: ${data.summary}`)
        // Refrescar cuentas después de 5 segundos
        setTimeout(() => {
          fetchAccounts()
          setAutoSyncResult(null)
        }, 5000)
      } else {
        const error = await response.json()
        setAutoSyncResult(`Error: ${error.error || "Error desconocido"}`)
      }
    } catch (error) {
      console.error("Error auto sync:", error)
      setAutoSyncResult("Error al iniciar sincronización automática")
    } finally {
      setAutoSyncing(false)
    }
  }

  const handleSyncAll = async () => {
    setSyncingAll(true)
    setSyncAllResult("Sincronizando proveedores...")
    
    try {
      // 1. Sync Libral (proveedores)
      const libralRes = await fetch("/api/cron/sync-libral", { method: "POST" })
      if (!libralRes.ok) throw new Error("Error en sync proveedores")
      
      setSyncAllResult("Sincronizando MercadoLibre...")
      
      // 2. Sync ML Stock para cada cuenta
      for (const account of accounts) {
        const mlRes = await fetch("/api/ml/sync-stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: account.id, limit: 200 })
        })
        if (!mlRes.ok) throw new Error("Error en sync ML")
      }
      
      setSyncAllResult("Sincronizando órdenes...")
      
      // 3. Sync Orders
      const ordersRes = await fetch("/api/ml/sync-orders", { method: "POST" })
      if (!ordersRes.ok) throw new Error("Error en sync órdenes")
      
      setSyncAllResult("✓ Sincronización completa exitosa")
      await fetchAccounts()
      setTimeout(() => setSyncAllResult(null), 8000)
    } catch (error) {
      console.error("Error syncing all:", error)
      setSyncAllResult(`Error: ${error instanceof Error ? error.message : "Desconocido"}`)
      setTimeout(() => setSyncAllResult(null), 8000)
    } finally {
      setSyncingAll(false)
    }
  }

  const handleSyncStock = async (accountId: string) => {
    setSyncing(accountId)
    setSyncResult(null)
    try {
      const response = await fetch("/api/ml/sync-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, limit: 100 }),
      })
      const data = await response.json()
      
      if (data.rate_limited) {
        setSyncResult("Límite de API. Intenta más tarde.")
      } else if (data.error) {
        setSyncResult(`Error: ${data.error}`)
      } else {
        setSyncResult(`Procesados: ${data.processed}, Vinculados: ${data.linked}, Sin EAN: ${data.no_ean || 0}, Sin producto: ${data.no_product_match || 0}${data.has_more ? " - Hay más" : ""}`)
      }
      
      // NO refrescar automáticamente para evitar rate limit
      // Solo mostrar el resultado
      setTimeout(() => setSyncResult(null), 8000)
    } catch (error) {
      console.error("Error syncing stock:", error)
      setSyncResult("Error al sincronizar")
    } finally {
      setSyncing(null)
    }
  }

  const isToday = (dateStr: string | null) => {
    if (!dateStr) return false
    const date = new Date(dateStr)
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isThisWeek = (dateStr: string | null) => {
    if (!dateStr) return false
    const date = new Date(dateStr)
    const today = new Date()
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    return date >= weekAgo
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Estado de Sincronización ML
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Estado de Sincronización ML
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No hay cuentas de ML conectadas</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Estado de Sincronización ML
            </CardTitle>
            <CardDescription>
              Última actualización de stock y publicaciones
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleAutoSyncComplete}
              disabled={autoSyncing}
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {autoSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  Sincronizar Completo
                </>
              )}
            </Button>
            <Button
              onClick={handleSyncAll}
              disabled={syncingAll}
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              {syncingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Sincronizar Todo
                </>
              )}
            </Button>
          </div>
        </div>
        {autoSyncResult && (
          <div className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded">{autoSyncResult}</div>
        )}
        {syncAllResult && (
          <div className="mt-2 text-sm text-primary bg-primary/10 p-2 rounded">{syncAllResult}</div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.map((account) => {
          const stockSyncedToday = isToday(account.last_stock_sync_at)
          const newListingsThisWeek = isThisWeek(account.last_new_listings_sync_at)

          return (
            <div key={account.id} className="p-3 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{account.nickname}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSyncStock(account.id)}
                  disabled={syncing === account.id}
                  className="bg-transparent"
                >
                  {syncing === account.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  <span className="ml-1">Sync Stock</span>
                </Button>
              </div>
              {syncResult && (
                <div className="text-sm text-primary bg-primary/10 p-2 rounded">{syncResult}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Stock Status */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Stock</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stockSyncedToday ? (
                      <Badge className="bg-green-500 text-white">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Actualizado hoy
                      </Badge>
                    ) : account.last_stock_sync_at ? (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        <XCircle className="h-3 w-3 mr-1" />
                        {new Date(account.last_stock_sync_at).toLocaleDateString("es-AR")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-600">
                        <XCircle className="h-3 w-3 mr-1" />
                        Nunca
                      </Badge>
                    )}
                  </div>
                  {account.stock_sync_count > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {account.stock_sync_count} productos
                    </p>
                  )}
                </div>

                {/* Publications Stats */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Publicaciones</span>
                  </div>
                  {accountStats[account.id] ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-500 text-white">
                          {accountStats[account.id].linked_publications} vinculadas
                        </Badge>
                        {accountStats[account.id].pending_import > 0 && (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                            {accountStats[account.id].pending_import} pendientes
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {accountStats[account.id].total_in_ml} en ML / {accountStats[account.id].total_publications} importadas / {accountStats[account.id].unlinked_publications} sin producto
                      </p>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Cargando...
                    </Badge>
                  )}
                </div>
              </div>

              {/* Auto-sync status */}
              <div className="flex gap-2 text-xs">
                <span className={account.auto_sync_stock ? "text-green-600" : "text-muted-foreground"}>
                  {account.auto_sync_stock ? "Auto-sync stock activo" : "Auto-sync stock inactivo"}
                </span>
                <span className="text-muted-foreground">|</span>
                <span className={account.auto_sync_new_listings ? "text-green-600" : "text-muted-foreground"}>
                  {account.auto_sync_new_listings ? "Auto-publicar activo" : "Auto-publicar inactivo"}
                </span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
