"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, ShoppingBag, Truck } from "lucide-react"

type ShopifyStore = { id: string; shop_domain: string; is_active: boolean }

type ShopifyOrder = {
  id: number
  name: string
  created_at: string
  total_price: string
  currency: string
  financial_status: string
  fulfillment_status: string | null
  customer?: { first_name?: string; last_name?: string; email?: string; phone?: string }
  shipping_address?: {
    name?: string
    address1?: string
    city?: string
    province?: string
    zip?: string
    phone?: string
  }
}

type Pagination = { next_page_info: string | null; prev_page_info: string | null }

// ── Status maps ──────────────────────────────────────────────────────────────
const FINANCIAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" },
  authorized: { label: "Autorizado", cls: "text-blue-400   border-blue-400/30   bg-blue-400/10" },
  partially_paid: { label: "Pago parcial", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  paid: { label: "Pagado", cls: "text-green-500  border-green-500/30  bg-green-500/10" },
  partially_refunded: { label: "Reemb. parcial", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  refunded: { label: "Reembolsado", cls: "text-red-400    border-red-400/30    bg-red-400/10" },
  voided: { label: "Anulado", cls: "text-muted-foreground border-border bg-muted" },
}
const FULFILLMENT_STATUS: Record<string, { label: string; cls: string }> = {
  fulfilled: { label: "Enviado", cls: "text-green-500  border-green-500/30  bg-green-500/10" },
  partial: { label: "Envío parcial", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  restocked: { label: "Reintegrado", cls: "text-muted-foreground border-border bg-muted" },
}

function FinancialBadge({ status }: { status: string }) {
  const s = FINANCIAL_STATUS[status] ?? { label: status, cls: "text-muted-foreground border-border bg-muted" }
  return (
    <Badge variant="outline" className={`text-xs ${s.cls}`}>
      {s.label}
    </Badge>
  )
}
function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Sin enviar</span>
  const s = FULFILLMENT_STATUS[status] ?? { label: status, cls: "text-muted-foreground border-border bg-muted" }
  return (
    <Badge variant="outline" className={`text-xs ${s.cls}`}>
      {s.label}
    </Badge>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ShopifyOrdersPage() {
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [orderStatus, setOrderStatus] = useState("any")
  const [orderPag, setOrderPag] = useState<Pagination>({ next_page_info: null, prev_page_info: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/shopify/stores")
      .then((r) => r.json())
      .then((d) => {
        if (d.stores?.length) {
          setStores(d.stores)
          setSelectedStoreId(d.stores[0].id)
        }
      })
      .catch(console.error)
  }, [])

  const fetchOrders = useCallback(
    async (pageInfo?: string) => {
      if (!selectedStoreId) return
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        store_id: selectedStoreId,
        status: orderStatus,
        limit: "50",
        ...(pageInfo ? { page_info: pageInfo } : {}),
      })
      const res = await fetch(`/api/shopify/orders?${params}`)
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al cargar ventas")
        setOrders([])
      } else {
        setOrders(data.orders ?? [])
        setOrderPag(data.pagination ?? { next_page_info: null, prev_page_info: null })
      }
      setLoading(false)
    },
    [selectedStoreId, orderStatus],
  )

  useEffect(() => {
    if (selectedStoreId) fetchOrders()
  }, [selectedStoreId, orderStatus]) // eslint-disable-line

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-6">
        <h1 className="text-xl font-semibold">Ventas Shopify</h1>
        {stores.length === 1 && <span className="text-sm text-muted-foreground">{stores[0].shop_domain}</span>}
        {stores.length > 1 && (
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-56">
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
        )}
      </header>

      <main className="flex flex-1 flex-col gap-4 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</label>
            <Select
              value={orderStatus}
              onValueChange={(v) => {
                setOrderStatus(v)
                setOrderPag({ next_page_info: null, prev_page_info: null })
              }}
            >
              <SelectTrigger className="w-40">
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
          <Button variant="outline" size="sm" onClick={() => fetchOrders()} disabled={loading || !selectedStoreId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recargar"}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!loading && !error && selectedStoreId && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <ShoppingBag className="h-10 w-10 opacity-30" />
            <p className="text-sm">No hay ventas con los filtros seleccionados</p>
          </div>
        )}

        {/* Orders table */}
        {!loading && orders.length > 0 && (
          <>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {["Orden", "Fecha", "Cliente", "Total", "Pago", "Envío", ""].map((h, i) => (
                      <th
                        key={i}
                        className={`p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground ${h === "Total" ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3 font-mono text-xs font-medium">{order.name}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}{" "}
                        <span className="opacity-60">
                          {new Date(order.created_at).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
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
                      <td className="p-3 text-right font-medium text-xs whitespace-nowrap">
                        {order.currency} $
                        {Number(order.total_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
                        <FinancialBadge status={order.financial_status} />
                      </td>
                      <td className="p-3">
                        <FulfillmentBadge status={order.fulfillment_status} />
                      </td>
                      <td className="p-3">
                        {(() => {
                          const sa = order.shipping_address
                          const params = new URLSearchParams({
                            ref: order.name,
                            shopify_order_id: String(order.id),
                            store_id: selectedStoreId,
                            ...(sa?.name
                              ? { dest_nombre: sa.name }
                              : order.customer
                                ? {
                                    dest_nombre:
                                      `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim(),
                                  }
                                : {}),
                            ...(sa?.address1 ? { dest_direccion: sa.address1 } : {}),
                            ...(sa?.city ? { dest_localidad: sa.city } : {}),
                            ...(sa?.province ? { dest_provincia: sa.province } : {}),
                            ...(sa?.zip ? { dest_cp: sa.zip } : {}),
                            ...(sa?.phone
                              ? { dest_telefono: sa.phone }
                              : order.customer?.phone
                                ? { dest_telefono: order.customer.phone }
                                : {}),
                            ...(order.customer?.email ? { dest_email: order.customer.email } : {}),
                          })
                          return (
                            <a href={`/envios/nuevo?${params}`} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                                <Truck className="h-3.5 w-3.5" />
                                Enviar
                              </Button>
                            </a>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <Button
                onClick={() => fetchOrders(orderPag.prev_page_info!)}
                disabled={!orderPag.prev_page_info || loading}
                variant="outline"
                size="sm"
              >
                ← Anterior
              </Button>
              <span className="text-xs text-muted-foreground">{orders.length} ventas en esta página</span>
              <Button
                onClick={() => fetchOrders(orderPag.next_page_info!)}
                disabled={!orderPag.next_page_info || loading}
                variant="outline"
                size="sm"
              >
                Siguiente →
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
