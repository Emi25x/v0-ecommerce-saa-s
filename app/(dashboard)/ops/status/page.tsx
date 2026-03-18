"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, TrendingUp, TrendingDown } from "lucide-react"

interface ProviderStatus {
  name: string
  is_active: boolean
  last_run: string | null
  last_status: string | null
  products_count: number
  stock_total: number
}

interface MLStats {
  total_published: number
  active_listings: number
  paused_listings: number
  sold_count: number
  visits_30d: number
}

interface SystemStats {
  total_products: number
  with_stock: number
  without_ean: number
  pending_publish: number
}

export default function OpsStatusPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [mlStats, setMlStats] = useState<MLStats | null>(null)
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/ops/status")
      const data = await response.json()
      
      setProviders(data.providers || [])
      setMlStats(data.ml_stats || null)
      setSystemStats(data.system_stats || null)
      setLastRefresh(new Date())
    } catch (error) {
      console.error("Error fetching ops status:", error)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 60000) // Refresh cada minuto
    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = (status: string | null, lastRun: string | null) => {
    if (!lastRun) return <AlertCircle className="h-5 w-5 text-gray-400" />
    if (status === "success") return <CheckCircle2 className="h-5 w-5 text-green-500" />
    if (status === "error") return <XCircle className="h-5 w-5 text-red-500" />
    return <AlertCircle className="h-5 w-5 text-yellow-500" />
  }

  const formatTimeSince = (dateString: string | null) => {
    if (!dateString) return "Nunca"
    const date = new Date(dateString)
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    
    if (seconds < 60) return `Hace ${seconds}s`
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)}h`
    return `Hace ${Math.floor(seconds / 86400)}d`
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Operations Dashboard</h1>
          <p className="text-muted-foreground">Monitor system health and provider status</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Última actualización: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button onClick={fetchStatus} disabled={loading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refrescar
          </Button>
        </div>
      </div>

      {/* System Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStats?.total_products.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Con Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {systemStats?.with_stock.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {systemStats && systemStats.total_products > 0
                ? `${((systemStats.with_stock / systemStats.total_products) * 100).toFixed(1)}%`
                : "0%"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Publicados ML</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {mlStats?.total_published.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {mlStats?.active_listings || 0} activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {systemStats?.pending_publish.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sin publicar</p>
          </CardContent>
        </Card>
      </div>

      {/* MercadoLibre Stats */}
      {mlStats && (
        <Card>
          <CardHeader>
            <CardTitle>Estadísticas MercadoLibre</CardTitle>
            <CardDescription>Performance de publicaciones en ML</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Publicaciones</p>
                <p className="text-2xl font-bold">{mlStats.total_published.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Listados Activos</p>
                <p className="text-2xl font-bold text-green-600">{mlStats.active_listings.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vendidos</p>
                <p className="text-2xl font-bold text-blue-600">{mlStats.sold_count.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Visitas (30d)</p>
                <p className="text-2xl font-bold text-purple-600">{mlStats.visits_30d.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Providers Status */}
      <Card>
        <CardHeader>
          <CardTitle>Proveedores de Inventario</CardTitle>
          <CardDescription>Estado y última sincronización de proveedores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {providers.map((provider) => (
              <div key={provider.name} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  {getStatusIcon(provider.last_status, provider.last_run)}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{provider.name}</h3>
                      <Badge variant={provider.is_active ? "default" : "secondary"}>
                        {provider.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Última sincronización: {formatTimeSince(provider.last_run)}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-sm text-muted-foreground">Productos</p>
                    <p className="text-lg font-semibold">{provider.products_count.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Stock Total</p>
                    <p className="text-lg font-semibold">{provider.stock_total.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}

            {providers.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8">
                No hay proveedores configurados
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
