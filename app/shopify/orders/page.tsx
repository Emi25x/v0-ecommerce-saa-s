"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, ShoppingBag, Package } from "lucide-react"

type ShopifyStore = { id: string; shop_domain: string; is_active: boolean }

type ShopifyOrder = {
  id: number
  name: string
  created_at: string
  total_price: string
  currency: string
  financial_status: string
  fulfillment_status: string | null
  customer?: { first_name?: string; last_name?: string; email?: string }
}

type ShopifyProduct = {
  id: number
  title: string
  status: string
  vendor: string
  product_type: string
  variants: Array<{ price: string; inventory_quantity: number; sku: string }>
  image?: { src: string }
  created_at: string
  updated_at: string
}

type Pagination = { next_page_info: string | null; prev_page_info: string | null }

const FINANCIAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pendiente",   cls: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" },
  authorized: { label: "Autorizado",  cls: "text-blue-400   border-blue-400/30   bg-blue-400/10"   },
  partially_paid: { label: "Pago parcial", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  paid:       { label: "Pagado",      cls: "text-green-500  border-green-500/30  bg-green-500/10"  },
  partially_refunded: { label: "Reemb. parcial", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  refunded:   { label: "Reembolsado", cls: "text-red-400    border-red-400/30    bg-red-400/10"    },
  voided:     { label: "Anulado",     cls: "text-muted-foreground border-border bg-muted" },
}

const FULFILLMENT_STATUS: Record<string, { label: string; cls: string }> = {
  fulfilled:         { label: "Enviado",        cls: "text-green-500  border-green-500/30  bg-green-500/10"  },
  partial:           { label: "Envío parcial",  cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  restocked:         { label: "Reintegrado",    cls: "text-muted-foreground border-border bg-muted"          },
}

const PRODUCT_STATUS: Record<string, { label: string; cls: string }> = {
  active:   { label: "Activo",    cls: "text-green-500 border-green-500/30 bg-green-500/10" },
  draft:    { label: "Borrador",  cls: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" },
  archived: { label: "Archivado", cls: "text-muted-foreground border-border bg-muted" },
}

function FinancialBadge({ status }: { status: string }) {
  const s = FINANCIAL_STATUS[status] ?? { label: status, cls: "text-muted-foreground border-border bg-muted" }
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">Sin enviar</span>
  const s = FULFILLMENT_STATUS[status] ?? { label: status, cls: "text-muted-foreground border-border bg-muted" }
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>
}

function ProductStatusBadge({ status }: { status: string }) {
  const s = PRODUCT_STATUS[status] ?? { label: status, cls: "text-muted-foreground border-border bg-muted" }
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>
}

export default function ShopifyPage() {
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [tab, setTab] = useState<"orders" | "products">("orders")

  // Orders state
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [orderStatus, setOrderStatus] = useState("any")
  const [orderPag, setOrderPag] = useState<Pagination>({ next_page_info: null, prev_page_info: null })

  // Products state
  const [products, setProducts] = useState<ShopifyProduct[]>([])
  const [productStatus, setProductStatus] = useState("active")
  const [productPag, setProductPag] = useState<Pagination>({ next_page_info: null, prev_page_info: null })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/shopify/stores")
      .then(r => r.json())
      .then(d => {
        if (d.stores?.length) {
          setStores(d.stores)
          setSelectedStoreId(d.stores[0].id)
        }
      })
      .catch(console.error)
  }, [])

  const fetchOrders = useCallback(async (pageInfo?: string) => {
    if (!selectedStoreId) return
    setLoading(true); setError(null)
    const params = new URLSearchParams({ store_id: selectedStoreId, status: orderStatus, limit: "50", ...(pageInfo ? { page_info: pageInfo } : {}) })
    const res = await fetch(`/api/shopify/orders?${params}`)
    const data = await res.json()
    if (!res.ok || !data.ok) { setError(data.error ?? "Error al cargar ventas"); setOrders([]) }
    else { setOrders(data.orders ?? []); setOrderPag(data.pagination ?? { next_page_info: null, prev_page_info: null }) }
    setLoading(false)
  }, [selectedStoreId, orderStatus])

  const fetchProducts = useCallback(async (pageInfo?: string) => {
    if (!selectedStoreId) return
    setLoading(true); setError(null)
    const params = new URLSearchParams({ store_id: selectedStoreId, status: productStatus, limit: "50", ...(pageInfo ? { page_info: pageInfo } : {}) })
    const res = await fetch(`/api/shopify/products?${params}`)
    const data = await res.json()
    if (!res.ok || !data.ok) { setError(data.error ?? "Error al cargar productos"); setProducts([]) }
    else { setProducts(data.products ?? []); setProductPag(data.pagination ?? { next_page_info: null, prev_page_info: null }) }
    setLoading(false)
  }, [selectedStoreId, productStatus])

  useEffect(() => {
    if (!selectedStoreId) return
    if (tab === "orders") fetchOrders()
    else fetchProducts()
  }, [selectedStoreId, tab, orderStatus, productStatus]) // eslint-disable-line

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-6">
        <h1 className="text-xl font-semibold">Shopify</h1>
        {stores.length > 1 && (
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Seleccionar tienda" />
            </SelectTrigger>
            <SelectContent>
              {stores.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.shop_domain}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {stores.length === 1 && (
          <span className="text-sm text-muted-foreground">{stores[0].shop_domain}</span>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-4 p-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setTab("orders")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "orders" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <ShoppingBag className="h-4 w-4" /> Ventas
          </button>
          <button
            onClick={() => setTab("products")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "products" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Package className="h-4 w-4" /> Productos
          </button>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-3">
          {stores.length > 1 || stores.length === 0 ? null : null}

          {tab === "orders" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</label>
              <Select value={orderStatus} onValueChange={v => { setOrderStatus(v); setOrderPag({ next_page_info: null, prev_page_info: null }) }}>
                <SelectTrigger className="w-44">
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
          )}

          {tab === "products" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</label>
              <Select value={productStatus} onValueChange={v => { setProductStatus(v); setProductPag({ next_page_info: null, prev_page_info: null }) }}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="draft">Borradores</SelectItem>
                  <SelectItem value="archived">Archivados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {stores.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tienda</label>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Seleccionar tienda" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.shop_domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => tab === "orders" ? fetchOrders() : fetchProducts()}
            disabled={loading || !selectedStoreId}
          >
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
        {!loading && !error && selectedStoreId && tab === "orders" && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <ShoppingBag className="h-10 w-10 opacity-30" />
            <p className="text-sm">No hay ventas con los filtros seleccionados</p>
          </div>
        )}
        {!loading && !error && selectedStoreId && tab === "products" && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">No hay productos con los filtros seleccionados</p>
          </div>
        )}

        {/* Orders table */}
        {!loading && tab === "orders" && orders.length > 0 && (
          <>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Orden</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Fecha</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Cliente</th>
                    <th className="text-right p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Total</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Pago</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Envío</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs font-medium">{order.name}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" "}
                        <span className="opacity-60">{new Date(order.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                      <td className="p-3">
                        {order.customer ? (
                          <div className="text-xs">
                            <div className="font-medium">{order.customer.first_name} {order.customer.last_name}</div>
                            <div className="text-muted-foreground">{order.customer.email}</div>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-right font-medium text-xs">
                        {order.currency} ${Number(order.total_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3"><FinancialBadge status={order.financial_status} /></td>
                      <td className="p-3"><FulfillmentBadge status={order.fulfillment_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <Button onClick={() => fetchOrders(orderPag.prev_page_info!)} disabled={!orderPag.prev_page_info || loading} variant="outline" size="sm">
                ← Anterior
              </Button>
              <span className="text-xs text-muted-foreground">{orders.length} ventas</span>
              <Button onClick={() => fetchOrders(orderPag.next_page_info!)} disabled={!orderPag.next_page_info || loading} variant="outline" size="sm">
                Siguiente →
              </Button>
            </div>
          </>
        )}

        {/* Products table */}
        {!loading && tab === "products" && products.length > 0 && (
          <>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground w-12"></th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Producto</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Tipo / Marca</th>
                    <th className="text-right p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Precio</th>
                    <th className="text-right p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Stock</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => {
                    const firstVariant = product.variants?.[0]
                    const totalStock = product.variants?.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0) ?? 0
                    const minPrice = Math.min(...(product.variants?.map(v => Number(v.price)) ?? [0]))
                    const maxPrice = Math.max(...(product.variants?.map(v => Number(v.price)) ?? [0]))
                    return (
                      <tr key={product.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          {product.image?.src
                            ? <img src={product.image.src} alt={product.title} className="h-9 w-9 rounded object-cover border border-border" />
                            : <div className="h-9 w-9 rounded bg-muted flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>
                          }
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-sm leading-tight">{product.title}</div>
                          {product.variants?.length > 1 && (
                            <div className="text-xs text-muted-foreground mt-0.5">{product.variants.length} variantes</div>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          <div>{product.vendor || "—"}</div>
                          <div className="opacity-70">{product.product_type || "—"}</div>
                        </td>
                        <td className="p-3 text-right text-xs font-medium whitespace-nowrap">
                          {minPrice === maxPrice
                            ? `$${minPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                            : `$${minPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })} – $${maxPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                          }
                        </td>
                        <td className={`p-3 text-right text-xs font-medium ${totalStock === 0 ? "text-red-400" : totalStock < 5 ? "text-yellow-500" : ""}`}>
                          {totalStock}
                        </td>
                        <td className="p-3"><ProductStatusBadge status={product.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <Button onClick={() => fetchProducts(productPag.prev_page_info!)} disabled={!productPag.prev_page_info || loading} variant="outline" size="sm">
                ← Anterior
              </Button>
              <span className="text-xs text-muted-foreground">{products.length} productos</span>
              <Button onClick={() => fetchProducts(productPag.next_page_info!)} disabled={!productPag.next_page_info || loading} variant="outline" size="sm">
                Siguiente →
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
