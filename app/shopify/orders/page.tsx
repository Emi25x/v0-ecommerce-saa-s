"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

type ShopifyStore = {
  id: string
  shop_domain: string
  is_active: boolean
  created_at: string
}

type ShopifyOrder = {
  id: number
  name: string
  email: string
  created_at: string
  total_price: string
  currency: string
  financial_status: string
  fulfillment_status: string | null
  customer?: {
    first_name?: string
    last_name?: string
    email?: string
  }
  line_items?: Array<{
    title: string
    quantity: number
    price: string
  }>
}

export default function ShopifyOrdersPage() {
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("any")
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [prevPageInfo, setPrevPageInfo] = useState<string | null>(null)

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch("/api/shopify/stores")
        const data = await res.json()
        if (data.stores) {
          setStores(data.stores)
          if (data.stores.length > 0) {
            setSelectedStoreId(data.stores[0].id)
          }
        }
      } catch (e) {
        console.error("[v0] Error fetching stores:", e)
      }
    }
    fetchStores()
  }, [])

  const fetchOrders = useCallback(
    async (pageInfo?: string) => {
      if (!selectedStoreId) return
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          store_id: selectedStoreId,
          status,
          limit: "50",
          ...(pageInfo ? { page_info: pageInfo } : {}),
        })
        const res = await fetch(`/api/shopify/orders?${params}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? "Error al cargar ventas")
          setOrders([])
        } else {
          setOrders(data.orders ?? [])
          setNextPageInfo(data.pagination?.next_page_info ?? null)
          setPrevPageInfo(data.pagination?.prev_page_info ?? null)
        }
      } catch (e: any) {
        setError(e.message)
        setOrders([])
      } finally {
        setLoading(false)
      }
    },
    [selectedStoreId, status]
  )

  useEffect(() => {
    if (selectedStoreId) {
      fetchOrders()
    }
  }, [selectedStoreId, status, fetchOrders])

  const getStatusColor = (financial: string, fulfillment: string | null) => {
    if (financial === "paid" && (fulfillment === "fulfilled" || fulfillment === "shipped"))
      return "bg-green-500/10 text-green-500 border-green-500/20"
    if (financial === "pending" || financial === "authorized")
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
    if (financial === "refunded" || financial === "voided")
      return "bg-red-500/10 text-red-500 border-red-500/20"
    return "bg-muted text-muted-foreground"
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
        <h1 className="text-2xl font-semibold">Ventas Shopify</h1>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Seleccioná la tienda y el estado de las ventas</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2 min-w-[200px]">
              <label className="text-sm font-medium">Tienda</label>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tienda" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.shop_domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 min-w-[200px]">
              <label className="text-sm font-medium">Estado</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Todos</SelectItem>
                  <SelectItem value="open">Abiertos</SelectItem>
                  <SelectItem value="closed">Cerrados</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={() => fetchOrders()} disabled={loading || !selectedStoreId}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recargar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 text-destructive text-sm">{error}</CardContent>
          </Card>
        )}

        {loading && !orders.length && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && orders.length === 0 && selectedStoreId && !error && (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              No hay ventas con los filtros seleccionados
            </CardContent>
          </Card>
        )}

        {orders.length > 0 && (
          <>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-3 font-medium">Nro. Orden</th>
                    <th className="text-left p-3 font-medium">Fecha</th>
                    <th className="text-left p-3 font-medium">Cliente</th>
                    <th className="text-left p-3 font-medium">Total</th>
                    <th className="text-left p-3 font-medium">Estado Pago</th>
                    <th className="text-left p-3 font-medium">Envío</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{order.name}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="p-3">
                        {order.customer ? (
                          <div className="text-xs">
                            <div className="font-medium">
                              {order.customer.first_name} {order.customer.last_name}
                            </div>
                            <div className="text-muted-foreground">{order.customer.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 font-medium">
                        {order.currency} ${Number(order.total_price).toFixed(2)}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={getStatusColor(order.financial_status, order.fulfillment_status)}>
                          {order.financial_status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {order.fulfillment_status ? (
                          <Badge variant="outline">{order.fulfillment_status}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <Button onClick={() => fetchOrders(prevPageInfo!)} disabled={!prevPageInfo || loading} variant="outline">
                ← Anterior
              </Button>
              <span className="text-sm text-muted-foreground">{orders.length} ventas cargadas</span>
              <Button onClick={() => fetchOrders(nextPageInfo!)} disabled={!nextPageInfo || loading} variant="outline">
                Siguiente →
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
