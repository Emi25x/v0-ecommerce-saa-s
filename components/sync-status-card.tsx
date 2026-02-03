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
  const [importing, setImporting] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [listingNoSku, setListingNoSku] = useState<string | null>(null)
  const [noSkuItems, setNoSkuItems] = useState<Array<{id: string; title: string; permalink: string}> | null>(null)

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

  // Listar publicaciones sin SKU
  const handleListWithoutSku = async (accountId: string) => {
    setListingNoSku(accountId)
    setNoSkuItems(null)
    try {
      const response = await fetch("/api/ml/list-without-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      })
      const data = await response.json()
      
      if (data.items_without_sku) {
        setNoSkuItems(data.items_without_sku)
      }
    } catch (error) {
      console.error("Error listing items without SKU:", error)
    } finally {
      setListingNoSku(null)
    }
  }

  // Importar publicaciones desde ML a nuestra DB
  const handleImportPublications = async (accountId: string) => {
    setImporting(accountId)
    setImportResult(null)
    try {
      const response = await fetch("/api/ml/import-publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      })
      const data = await response.json()
      
      if (data.error) {
        setImportResult(`Error: ${data.error}`)
      } else {
        setImportResult(`Importadas: ${data.imported}, Sin match: ${data.noMatch}, Errores: ${data.errors}`)
      }
      
      setTimeout(() => setImportResult(null), 10000)
    } catch (error) {
      console.error("Error importing publications:", error)
      setImportResult("Error al importar")
    } finally {
      setImporting(null)
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
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleListWithoutSku(account.id)}
                    disabled={listingNoSku === account.id}
                    className="bg-transparent"
                  >
                    {listingNoSku === account.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    <span className="ml-1">Sin SKU</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleImportPublications(account.id)}
                    disabled={importing === account.id}
                    className="bg-transparent"
                  >
                    {importing === account.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Package className="h-3 w-3" />
                    )}
                    <span className="ml-1">Importar</span>
                  </Button>
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
                    <span className="ml-1">Sync</span>
                  </Button>
                </div>
              </div>
              {importResult && (
                <div className="text-sm font-medium text-primary">{importResult}</div>
              )}
              
              {/* Lista de items sin SKU */}
              {noSkuItems && noSkuItems.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-red-800">
                      {noSkuItems.length} publicaciones sin SKU:
                    </span>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setNoSkuItems(null)}
                      className="h-6 px-2 text-xs"
                    >
                      Cerrar
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {noSkuItems.map((item) => (
                      <a
                        key={item.id}
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 hover:underline truncate"
                      >
                        {item.id} - {item.title}
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-red-600 mt-2">
                    Podes eliminar estas desde el panel de MercadoLibre
                  </p>
                </div>
              )}
              {noSkuItems && noSkuItems.length === 0 && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-sm font-medium text-green-800">
                    Todas las publicaciones tienen SKU configurado
                  </span>
                </div>
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
