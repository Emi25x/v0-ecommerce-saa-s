"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  ExternalLink,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
  MoreHorizontal,
  Plus,
  Eye,
  Send,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface LocalProduct {
  id: string
  title: string
  ean: string | null
  sku: string | null
  isbn: string | null
  author: string | null
  brand: string | null
  language: string | null
  price: number | null
  stock: number | null
  image_url: string | null
  description: string | null
  pages: number | null
  binding: string | null
  category: string | null
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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
  const [pageStack, setPageStack] = useState<string[]>([])
  const [isSearch, setIsSearch] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detail sheet
  const [detailProduct, setDetailProduct] = useState<ShopifyProduct | null>(null)

  // Add product dialog
  const [showAddDialog, setShowAddDialog] = useState(false)

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
    stack.pop()
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowAddDialog(true)}
            disabled={!storeId}
          >
            <Plus className="h-4 w-4" />
            Agregar producto
          </Button>
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
                <th className="px-4 py-3 w-10"></th>
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
                      {/* Row actions */}
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailProduct(product)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver detalles
                            </DropdownMenuItem>
                            {currentStore && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`https://${currentStore.shop_domain}/admin/products/${product.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Editar en Shopify
                                  </a>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      {/* Product Detail Sheet */}
      <ProductDetailSheet
        product={detailProduct}
        store={currentStore ?? null}
        onClose={() => setDetailProduct(null)}
      />

      {/* Add Product Dialog */}
      {showAddDialog && (
        <AddProductDialog
          storeId={storeId}
          stores={stores}
          onClose={() => setShowAddDialog(false)}
          onPublished={() => {
            setShowAddDialog(false)
            fetchProducts(storeId, undefined, search || undefined)
          }}
        />
      )}
    </div>
  )
}

// ── Product Detail Sheet ───────────────────────────────────────────────────────

function ProductDetailSheet({
  product,
  store,
  onClose,
}: {
  product: ShopifyProduct | null
  store: ShopifyStore | null
  onClose: () => void
}) {
  if (!product) return null

  const totalStock = product.variants?.reduce((s, v) => s + (v.inventory_quantity ?? 0), 0) ?? 0
  const isActive = product.status === "active"
  const tags = product.tags ? product.tags.split(",").map((t) => t.trim()).filter(Boolean) : []

  return (
    <Sheet open={!!product} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base font-semibold line-clamp-2 pr-4">
            {product.title}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Image */}
          {product.image?.src && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.image.src}
                alt={product.title}
                className="h-48 rounded-lg object-contain border bg-muted/20"
              />
            </div>
          )}

          {/* Status & basic info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Estado">
              <Badge
                variant="outline"
                className={isActive
                  ? "text-green-700 border-green-300 dark:text-green-400"
                  : "text-muted-foreground"}
              >
                {isActive ? "Activo" : product.status}
              </Badge>
            </InfoRow>
            <InfoRow label="Stock total">
              <span className={
                totalStock === 0
                  ? "text-muted-foreground"
                  : totalStock <= 3
                  ? "text-amber-600 font-semibold"
                  : "font-semibold"
              }>
                {totalStock.toLocaleString("es-AR")} unid.
              </span>
            </InfoRow>
            {product.vendor && (
              <InfoRow label="Proveedor">{product.vendor}</InfoRow>
            )}
            {product.product_type && (
              <InfoRow label="Tipo">{product.product_type}</InfoRow>
            )}
            <InfoRow label="Creado">
              {new Date(product.created_at).toLocaleDateString("es-AR")}
            </InfoRow>
            <InfoRow label="Actualizado">
              {new Date(product.updated_at).toLocaleDateString("es-AR")}
            </InfoRow>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Etiquetas</p>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Variants table */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Variantes ({product.variants?.length ?? 0})
            </p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">SKU</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Barcode</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Precio</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {(product.variants ?? []).map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono">{v.sku || "—"}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{v.barcode || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {v.price ? `$${Number(v.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={
                          (v.inventory_quantity ?? 0) === 0
                            ? "text-muted-foreground"
                            : (v.inventory_quantity ?? 0) <= 3
                            ? "text-amber-600 font-semibold"
                            : "font-semibold"
                        }>
                          {(v.inventory_quantity ?? 0).toLocaleString("es-AR")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shopify link */}
          {store && (
            <a
              href={`https://${store.shop_domain}/admin/products/${product.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Editar en Shopify Admin
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

// ── Add Product Dialog ─────────────────────────────────────────────────────────

function AddProductDialog({
  storeId,
  stores,
  onClose,
  onPublished,
}: {
  storeId: string
  stores: ShopifyStore[]
  onClose: () => void
  onPublished: () => void
}) {
  const [selectedStore, setSelectedStore] = useState(storeId)
  const [lookupInput, setLookupInput] = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [localProduct, setLocalProduct] = useState<LocalProduct | null>(null)
  const [lookupDone, setLookupDone] = useState(false)

  const [form, setForm] = useState({
    ean: "",
    title: "",
    author: "",
    brand: "",
    price: "",
    language: "",
  })

  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleLookup() {
    const q = lookupInput.trim()
    if (!q) return
    setLookupLoading(true)
    setLookupDone(false)
    setLocalProduct(null)
    setPublishResult(null)
    try {
      const res = await fetch(`/api/inventory/products?ean=${encodeURIComponent(q)}&sku=${encodeURIComponent(q)}&limit=1`)
      const data = await res.json()
      const found: LocalProduct | null = data.products?.[0] ?? data.data?.[0] ?? null
      setLocalProduct(found)
      if (found) {
        setForm({
          ean: found.ean ?? found.sku ?? q,
          title: found.title ?? "",
          author: found.author ?? "",
          brand: found.brand ?? "",
          price: found.price != null ? String(found.price) : "",
          language: found.language ?? "",
        })
      } else {
        setForm((f) => ({ ...f, ean: q }))
      }
    } catch {}
    finally {
      setLookupLoading(false)
      setLookupDone(true)
    }
  }

  async function handlePublish() {
    if (!form.ean.trim()) return
    setPublishing(true)
    setPublishResult(null)
    try {
      const res = await fetch("/api/shopify/push-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: selectedStore, ean: form.ean.trim() }),
      })
      const data = await res.json()
      if (res.ok && (data.success || data.ok)) {
        setPublishResult({ ok: true, message: data.message ?? "Producto publicado correctamente." })
        setTimeout(() => onPublished(), 1200)
      } else {
        setPublishResult({ ok: false, message: data.error ?? data.message ?? "Error al publicar." })
      }
    } catch (e: any) {
      setPublishResult({ ok: false, message: e.message ?? "Error de red." })
    } finally {
      setPublishing(false)
    }
  }

  const canPublish = localProduct !== null && form.ean.trim() !== ""

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar producto a Shopify</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Store selector (if multiple) */}
          {stores.length > 1 && (
            <div className="space-y-1.5">
              <Label>Tienda</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tienda" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name || s.shop_domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* SKU / EAN lookup */}
          <div className="space-y-1.5">
            <Label>Buscar por EAN / SKU en catálogo local</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ingresá EAN, ISBN o SKU..."
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleLookup}
                disabled={lookupLoading || !lookupInput.trim()}
              >
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Lookup result */}
          {lookupDone && !localProduct && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No se encontró el producto en el catálogo local. Solo se puede publicar en Shopify si el producto existe en la base de datos.
            </p>
          )}

          {/* Product data form (pre-filled if found) */}
          {lookupDone && (
            <div className="rounded-md border p-3 space-y-3 bg-muted/20">
              {localProduct && (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                  ✓ Producto encontrado en catálogo local
                </p>
              )}

              {localProduct?.image_url && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={localProduct.image_url}
                    alt={localProduct.title}
                    className="h-24 rounded object-contain border bg-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Título</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Título del producto"
                    readOnly={!localProduct}
                    className={!localProduct ? "opacity-60" : ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">EAN / ISBN</Label>
                  <Input
                    value={form.ean}
                    onChange={(e) => setForm((f) => ({ ...f, ean: e.target.value }))}
                    placeholder="EAN o ISBN"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Precio</Label>
                  <Input
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    readOnly={!localProduct}
                    className={!localProduct ? "opacity-60" : ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Autor</Label>
                  <Input
                    value={form.author}
                    onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                    placeholder="Autor"
                    readOnly={!localProduct}
                    className={!localProduct ? "opacity-60" : ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Editorial / Marca</Label>
                  <Input
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    placeholder="Editorial o marca"
                    readOnly={!localProduct}
                    className={!localProduct ? "opacity-60" : ""}
                  />
                </div>
              </div>

              {localProduct && (
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground pt-1 border-t">
                  {localProduct.isbn && <span>ISBN: <span className="font-mono">{localProduct.isbn}</span></span>}
                  {localProduct.language && <span>Idioma: {localProduct.language}</span>}
                  {localProduct.stock != null && <span>Stock local: {localProduct.stock.toLocaleString("es-AR")}</span>}
                  {localProduct.pages && <span>Páginas: {localProduct.pages}</span>}
                  {localProduct.binding && <span>Formato: {localProduct.binding}</span>}
                </div>
              )}
            </div>
          )}

          {/* Publish result */}
          {publishResult && (
            <p className={`text-sm ${publishResult.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {publishResult.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={publishing}>
            Cancelar
          </Button>
          <Button
            onClick={handlePublish}
            disabled={!canPublish || publishing}
            className="gap-2"
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Publicar en Shopify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
