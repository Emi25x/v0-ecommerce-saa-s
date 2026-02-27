"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, ShoppingBag, Package, Search, X } from "lucide-react"

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

type ShopifyVariant = {
  id: number
  title: string
  sku: string
  price: string
  inventory_quantity: number
  inventory_item_id: number
}

type ShopifyProduct = {
  id: number
  title: string
  status: string
  vendor: string
  product_type: string
  body_html?: string
  variants: ShopifyVariant[]
  image?: { src: string }
  images?: Array<{ src: string }>
  tags?: string
  created_at: string
  updated_at: string
}

type Location = { id: number; name: string; active: boolean }
type InventoryLevel = { inventory_item_id: number; location_id: number; available: number }
type Pagination = { next_page_info: string | null; prev_page_info: string | null }

// ── Status maps ──────────────────────────────────────────────────────────────
const FINANCIAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending:            { label: "Pendiente",       cls: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" },
  authorized:         { label: "Autorizado",      cls: "text-blue-400   border-blue-400/30   bg-blue-400/10"   },
  partially_paid:     { label: "Pago parcial",    cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  paid:               { label: "Pagado",          cls: "text-green-500  border-green-500/30  bg-green-500/10"  },
  partially_refunded: { label: "Reemb. parcial",  cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  refunded:           { label: "Reembolsado",     cls: "text-red-400    border-red-400/30    bg-red-400/10"    },
  voided:             { label: "Anulado",         cls: "text-muted-foreground border-border bg-muted" },
}
const FULFILLMENT_STATUS: Record<string, { label: string; cls: string }> = {
  fulfilled: { label: "Enviado",       cls: "text-green-500  border-green-500/30  bg-green-500/10"  },
  partial:   { label: "Envío parcial", cls: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  restocked: { label: "Reintegrado",   cls: "text-muted-foreground border-border bg-muted"          },
}
const PRODUCT_STATUS: Record<string, { label: string; cls: string }> = {
  active:   { label: "Activo",    cls: "text-green-500  border-green-500/30  bg-green-500/10"  },
  draft:    { label: "Borrador",  cls: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" },
  archived: { label: "Archivado", cls: "text-muted-foreground border-border bg-muted"           },
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

// ── Product Detail Modal ─────────────────────────────────────────────────────
function ProductDetailModal({
  product,
  storeId,
  onClose,
}: {
  product: ShopifyProduct | null
  storeId: string
  onClose: () => void
}) {
  const [locations, setLocations] = useState<Location[]>([])
  const [variants, setVariants] = useState<ShopifyVariant[]>([])
  const [invLevels, setInvLevels] = useState<InventoryLevel[]>([])
  const [loadingInv, setLoadingInv] = useState(false)

  useEffect(() => {
    if (!product || !storeId) return
    setLoadingInv(true)
    fetch(`/api/shopify/inventory?store_id=${storeId}&product_id=${product.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setLocations(d.locations ?? [])
          setVariants(d.variants ?? [])
          setInvLevels(d.inventory_levels ?? [])
        }
      })
      .finally(() => setLoadingInv(false))
  }, [product, storeId])

  const getStock = (inventoryItemId: number, locationId: number) =>
    invLevels.find(l => l.inventory_item_id === inventoryItemId && l.location_id === locationId)?.available ?? 0

  const activeLocations = locations.filter(l => l.active)

  if (!product) return null

  return (
    <Dialog open={!!product} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold leading-tight">{product.title}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* Imagen */}
          <div className="flex flex-col gap-2">
            {product.image?.src
              ? <img src={product.image.src} alt={product.title} className="w-full rounded-lg border border-border object-cover aspect-square" />
              : <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center"><Package className="h-10 w-10 text-muted-foreground" /></div>
            }
            {(product.images?.length ?? 0) > 1 && (
              <div className="flex gap-1 flex-wrap">
                {product.images!.slice(1, 5).map((img, i) => (
                  <img key={i} src={img.src} alt="" className="h-12 w-12 rounded object-cover border border-border" />
                ))}
              </div>
            )}
          </div>

          {/* Info básica */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <ProductStatusBadge status={product.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Marca / Vendor</p>
                <p className="font-medium">{product.vendor || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <p className="font-medium">{product.product_type || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Actualizado</p>
                <p className="font-medium">{new Date(product.updated_at).toLocaleDateString("es-AR")}</p>
              </div>
              {product.tags && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {product.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Variantes + Stock por ubicación */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Variantes y stock</h3>
          {loadingInv ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando stock por ubicación...
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left p-2 font-medium text-muted-foreground">Variante</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">SKU</th>
                    <th className="text-right p-2 font-medium text-muted-foreground">Precio</th>
                    {activeLocations.map(loc => (
                      <th key={loc.id} className="text-right p-2 font-medium text-muted-foreground whitespace-nowrap">{loc.name}</th>
                    ))}
                    <th className="text-right p-2 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(variants.length ? variants : product.variants).map(v => {
                    const total = activeLocations.length
                      ? activeLocations.reduce((sum, loc) => sum + getStock(v.inventory_item_id, loc.id), 0)
                      : (v.inventory_quantity ?? 0)
                    return (
                      <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="p-2 font-medium">{v.title === "Default Title" ? product.title : v.title}</td>
                        <td className="p-2 font-mono text-muted-foreground">{v.sku || "—"}</td>
                        <td className="p-2 text-right">${Number(v.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                        {activeLocations.map(loc => {
                          const stock = getStock(v.inventory_item_id, loc.id)
                          return (
                            <td key={loc.id} className={`p-2 text-right font-medium ${stock === 0 ? "text-red-400" : stock < 5 ? "text-yellow-500" : ""}`}>
                              {stock}
                            </td>
                          )
                        })}
                        <td className={`p-2 text-right font-semibold ${total === 0 ? "text-red-400" : total < 5 ? "text-yellow-500" : ""}`}>
                          {total}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {activeLocations.length > 1 && (
                  <tfoot className="bg-muted/30 border-t border-border">
                    <tr>
                      <td colSpan={3} className="p-2 text-xs font-medium text-muted-foreground">Total por ubicación</td>
                      {activeLocations.map(loc => {
                        const locTotal = (variants.length ? variants : product.variants)
                          .reduce((sum, v) => sum + getStock(v.inventory_item_id, loc.id), 0)
                        return (
                          <td key={loc.id} className={`p-2 text-right text-xs font-semibold ${locTotal === 0 ? "text-red-400" : ""}`}>
                            {locTotal}
                          </td>
                        )
                      })}
                      <td className="p-2 text-right text-xs font-semibold">
                        {(variants.length ? variants : product.variants)
                          .reduce((sum, v) => sum + activeLocations.reduce((s, loc) => s + getStock(v.inventory_item_id, loc.id), 0), 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Descripción */}
        {product.body_html && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-1">Descripción</h3>
            <div
              className="text-xs text-muted-foreground leading-relaxed [&>p]:mb-1 [&>ul]:list-disc [&>ul]:pl-4"
              dangerouslySetInnerHTML={{ __html: product.body_html }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ShopifyPage() {
  const [stores, setStores]               = useState<ShopifyStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [tab, setTab]                     = useState<"orders" | "products">("orders")

  // Orders
  const [orders, setOrders]               = useState<ShopifyOrder[]>([])
  const [orderStatus, setOrderStatus]     = useState("any")
  const [orderPag, setOrderPag]           = useState<Pagination>({ next_page_info: null, prev_page_info: null })

  // Products
  const [products, setProducts]           = useState<ShopifyProduct[]>([])
  const [productStatus, setProductStatus] = useState("active")
  const [productPag, setProductPag]       = useState<Pagination>({ next_page_info: null, prev_page_info: null })
  const [searchQuery, setSearchQuery]     = useState("")
  const [searchInput, setSearchInput]     = useState("")
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null)
  const [totalProducts, setTotalProducts] = useState<number | null>(null)
  const searchTimer                       = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)

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

  const fetchProducts = useCallback(async (pageInfo?: string, query?: string) => {
    if (!selectedStoreId) return
    setLoading(true); setError(null)
    const params = new URLSearchParams({
      store_id: selectedStoreId,
      status: productStatus,
      limit: "50",
      ...(pageInfo ? { page_info: pageInfo } : {}),
      ...((query ?? searchQuery) ? { query: query ?? searchQuery } : {}),
    })
    const res = await fetch(`/api/shopify/products?${params}`)
    const data = await res.json()
    if (!res.ok || !data.ok) { setError(data.error ?? "Error al cargar productos"); setProducts([]) }
    else {
      setProducts(data.products ?? [])
      setProductPag(data.pagination ?? { next_page_info: null, prev_page_info: null })
      // Actualizar total solo en la primera página (sin page_info)
      if (!pageInfo) setTotalProducts(data.products?.length ?? 0)
    }
    setLoading(false)
  }, [selectedStoreId, productStatus, searchQuery])

  useEffect(() => {
    if (!selectedStoreId) return
    if (tab === "orders") fetchOrders()
    else fetchProducts()
  }, [selectedStoreId, tab, orderStatus, productStatus]) // eslint-disable-line

  // Búsqueda con debounce
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchQuery(value)
      setProductPag({ next_page_info: null, prev_page_info: null })
      fetchProducts(undefined, value)
    }, 500)
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-6">
        <h1 className="text-xl font-semibold">Shopify</h1>
        {stores.length === 1 && (
          <span className="text-sm text-muted-foreground">{stores[0].shop_domain}</span>
        )}
        {stores.length > 1 && (
          <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Seleccionar tienda" /></SelectTrigger>
            <SelectContent>
              {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.shop_domain}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-4 p-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["orders", "products"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t === "orders" ? <><ShoppingBag className="h-4 w-4" /> Ventas</> : <><Package className="h-4 w-4" /> Productos</>}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          {tab === "orders" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</label>
              <Select value={orderStatus} onValueChange={v => { setOrderStatus(v); setOrderPag({ next_page_info: null, prev_page_info: null }) }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</label>
                <Select value={productStatus} onValueChange={v => { setProductStatus(v); setProductPag({ next_page_info: null, prev_page_info: null }) }}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="draft">Borradores</SelectItem>
                    <SelectItem value="archived">Archivados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-[220px] max-w-sm">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Buscar por título / SKU / ISBN</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchInput}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Titulo, SKU, ISBN..."
                    className="pl-8 pr-8 h-9 text-sm"
                  />
                  {searchInput && (
                    <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          <Button
            variant="outline" size="sm"
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
                    {["Orden", "Fecha", "Cliente", "Total", "Pago", "Envío"].map(h => (
                      <th key={h} className={`p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground ${h === "Total" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs font-medium">{order.name}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" "}<span className="opacity-60">{new Date(order.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </td>
                      <td className="p-3">
                        {order.customer
                          ? <div className="text-xs"><div className="font-medium">{order.customer.first_name} {order.customer.last_name}</div><div className="text-muted-foreground">{order.customer.email}</div></div>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-right font-medium text-xs whitespace-nowrap">
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
              <Button onClick={() => fetchOrders(orderPag.prev_page_info!)} disabled={!orderPag.prev_page_info || loading} variant="outline" size="sm">← Anterior</Button>
              <span className="text-xs text-muted-foreground">{orders.length} ventas en esta página</span>
              <Button onClick={() => fetchOrders(orderPag.next_page_info!)} disabled={!orderPag.next_page_info || loading} variant="outline" size="sm">Siguiente →</Button>
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
                    <th className="p-3 w-12"></th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Producto</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">SKU</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Tipo / Marca</th>
                    <th className="text-right p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Precio</th>
                    <th className="text-right p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Stock</th>
                    <th className="text-left p-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => {
                    const totalStock = product.variants?.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0) ?? 0
                    const prices = product.variants?.map(v => Number(v.price)) ?? [0]
                    const minP = Math.min(...prices), maxP = Math.max(...prices)
                    // SKU: si tiene una variante mostrar el sku, si tiene muchas mostrar el primero con "..."
                    const firstSku = product.variants?.[0]?.sku || "—"
                    const skuDisplay = product.variants?.length > 1
                      ? (product.variants.some(v => v.sku) ? `${firstSku}${product.variants.length > 1 ? " +" : ""}` : "—")
                      : firstSku
                    return (
                      <tr
                        key={product.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <td className="p-3">
                          {product.image?.src
                            ? <img src={product.image.src} alt={product.title} className="h-9 w-9 rounded object-cover border border-border" />
                            : <div className="h-9 w-9 rounded bg-muted flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-sm leading-tight">{product.title}</div>
                          {product.variants?.length > 1 && <div className="text-xs text-muted-foreground mt-0.5">{product.variants.length} variantes</div>}
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{skuDisplay}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          <div>{product.vendor || "—"}</div>
                          <div className="opacity-70">{product.product_type || "—"}</div>
                        </td>
                        <td className="p-3 text-right text-xs font-medium whitespace-nowrap">
                          {minP === maxP
                            ? `$${minP.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                            : `$${minP.toLocaleString("es-AR", { minimumFractionDigits: 2 })} – $${maxP.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
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

            {/* Footer con total y paginación */}
            <div className="flex items-center justify-between">
              <Button onClick={() => fetchProducts(productPag.prev_page_info!)} disabled={!productPag.prev_page_info || loading} variant="outline" size="sm">← Anterior</Button>
              <div className="text-xs text-muted-foreground text-center">
                <span className="font-medium text-foreground">{products.length}</span> productos en esta página
                {totalProducts !== null && !productPag.prev_page_info && !productPag.next_page_info && (
                  <span className="ml-1">(total: {totalProducts})</span>
                )}
              </div>
              <Button onClick={() => fetchProducts(productPag.next_page_info!)} disabled={!productPag.next_page_info || loading} variant="outline" size="sm">Siguiente →</Button>
            </div>
          </>
        )}
      </main>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        storeId={selectedStoreId}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  )
}
