"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  ExternalLink,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
} from "lucide-react"

interface ShopifyStore {
  id: string
  name: string
  shop_domain: string
  is_active: boolean
}

interface ShopifyVariant {
  id: number
  sku: string
  price: string
  inventory_quantity: number
  barcode: string
}

interface ShopifyProduct {
  id: number
  title: string
  status: string
  vendor: string
  product_type: string
  tags: string
  created_at: string
  updated_at: string
  image: { src: string } | null
  variants: ShopifyVariant[]
}

export default function ShopifyProductsPage() {
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [storeId, setStoreId] = useState<string>("")
  const [products, setProducts] = useState<ShopifyProduct[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [prevPageInfo, setPrevPageInfo] = useState<string | null>(null)
  const [pageStack, setPageStack] = useState<string[]>([]) // track prev pages
  const [isSearch, setIsSearch] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load stores
  useEffect(() => {
    fetch("/api/shopify/stores")
      .then((r) => r.json())
      .then((d) => {
        const list: ShopifyStore[] = Array.isArray(d) ? d : d.stores ?? d.data ?? []
        setStores(list)
        if (list.length > 0) setStoreId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const fetchProducts = useCallback(
    async (sid: string, pageInfo?: string, q?: string) => {
      if (!sid) return
      setLoading(true)
      try {
        const qs = new URLSearchParams({ store_id: sid, limit: "50", status: "active" })
        if (pageInfo) qs.set("page_info", pageInfo)
        if (q) qs.set("query", q)
        const res = await fetch(`/api/shopify/products?${qs}`)
        const data = await res.json()
        if (!res.ok) return
        setProducts(data.products ?? [])
        setTotalCount(data.total_count ?? null)
        setNextPageInfo(data.pagination?.next_page_info ?? null)
        setPrevPageInfo(data.pagination?.prev_page_info ?? null)
        setIsSearch(data.is_search ?? false)
      } catch {}
      finally { setLoading(false) }
    },
    []
  )

  // Fetch when store changes
  useEffect(() => {
    if (storeId) {
      setPageStack([])
      setNextPageInfo(null)
      setPrevPageInfo(null)
      fetchProducts(storeId, undefined, search || undefined)
    }
  }, [storeId, fetchProducts]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(val)
      setPageStack([])
      fetchProducts(storeId, undefined, val || undefined)
    }, 400)
  }

  function handleNext() {
    if (!nextPageInfo) return
    setPageStack((s) => [...s, nextPageInfo!])
    fetchProducts(storeId, nextPageInfo, undefined)
  }

  function handlePrev() {
    const stack = [...pageStack]
    stack.pop() // remove current
    const prevInfo = stack[stack.length - 1] ?? undefined
    setPageStack(stack)
    fetchProducts(storeId, prevInfo, undefined)
  }

  const currentStore = stores.find((s) => s.id === storeId)

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Productos publicados en Shopify</h1>
          {totalCount != null && !isSearch && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalCount.toLocaleString("es-AR")} productos activos
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => fetchProducts(storeId, undefined, search || undefined)}
          disabled={loading || !storeId}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {stores.length > 1 && (
          <Select value={storeId} onValueChange={(v) => { setStoreId(v); setPageStack([]) }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Seleccionar tienda" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name || s.shop_domain}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, SKU, EAN..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        {currentStore && (
          <a
            href={`https://${currentStore.shop_domain}/admin/products`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Ver en Shopify
            </Button>
          </a>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-12"></th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU / Barcode</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : !storeId ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-muted-foreground">
                    Seleccioná una tienda para ver los productos.
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {search ? "Sin resultados para esa búsqueda." : "No hay productos publicados."}
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const variant = product.variants?.[0]
                  const totalStock = product.variants?.reduce((s, v) => s + (v.inventory_quantity ?? 0), 0) ?? 0
                  const isActive = product.status === "active"

                  return (
                    <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        {product.image?.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image.src}
                            alt={product.title}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium line-clamp-1">{product.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {product.vendor && <span>{product.vendor}</span>}
                          {product.vendor && product.product_type && <span> · </span>}
                          {product.product_type && <span>{product.product_type}</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {variant?.sku && (
                          <p className="font-mono text-xs">{variant.sku}</p>
                        )}
                        {variant?.barcode && (
                          <p className="font-mono text-xs text-muted-foreground/60">{variant.barcode}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {variant?.price ? `$${Number(variant.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={
                          totalStock === 0
                            ? "text-muted-foreground"
                            : totalStock <= 3
                            ? "text-amber-600 dark:text-amber-400 font-semibold"
                            : "font-semibold"
                        }>
                          {totalStock.toLocaleString("es-AR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={isActive
                            ? "text-green-700 border-green-300 dark:text-green-400"
                            : "text-muted-foreground"}
                        >
                          {isActive ? "Activo" : product.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {currentStore && (
                          <a
                            href={`https://${currentStore.shop_domain}/admin/products/${product.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isSearch && (nextPageInfo || pageStack.length > 0) && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm text-muted-foreground">
            <span>
              {isSearch ? `${products.length} resultados` : `Página ${pageStack.length + 1}`}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={pageStack.length === 0}
                onClick={handlePrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!nextPageInfo}
                onClick={handleNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
