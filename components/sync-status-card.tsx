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

export function SyncStatusCard() {
  const [accounts, setAccounts] = useState<AccountSyncStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [fixingSku, setFixingSku] = useState<string | null>(null)
  const [fixProgress, setFixProgress] = useState<{ current: number, total: number, updated: number } | null>(null)
  const [republishing, setRepublishing] = useState<string | null>(null)
  const [republishResult, setRepublishResult] = useState<string | null>(null)

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()
      if (data.accounts) {
        setAccounts(data.accounts)
      }
    } catch (error) {
      console.error("Error fetching accounts:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncStock = async (accountId: string) => {
    setSyncing(accountId)
    try {
      await fetch("/api/ml/sync-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      })
      await fetchAccounts()
    } catch (error) {
      console.error("Error syncing stock:", error)
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
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Estado de Sincronización ML
        </CardTitle>
        <CardDescription>
          Última actualización de stock y publicaciones
        </CardDescription>
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

                {/* New Listings Status */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Publicaciones</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {newListingsThisWeek ? (
                      <Badge className="bg-green-500 text-white">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Esta semana
                      </Badge>
                    ) : account.last_new_listings_sync_at ? (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        {new Date(account.last_new_listings_sync_at).toLocaleDateString("es-AR")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Sin publicaciones
                      </Badge>
                    )}
                  </div>
                  {account.new_listings_count > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {account.new_listings_count} nuevas
                    </p>
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
