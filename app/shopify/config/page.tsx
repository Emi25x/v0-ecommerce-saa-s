"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button }    from "@/components/ui/button"
import { Input }     from "@/components/ui/input"
import { Label }     from "@/components/ui/label"
import { Badge }     from "@/components/ui/badge"
import { useToast }  from "@/hooks/use-toast"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Upload, Plus, Trash2, Download, Save, Store, PackageSearch,
  Loader2, X, CheckCircle2, CloudUpload, AlertCircle, RefreshCw,
  Settings2, Warehouse, DollarSign, MapPin,
} from "lucide-react"
import Link from "next/link"

// ── Types ──────────────────────────────────────────────────────────────────

interface ShopifyStore {
  id: string
  shop_domain: string
  name: string | null
  is_active: boolean
  vendor: string | null
  product_category: string | null
  price_source: "products.price" | "product_prices"
  price_list_id: string | null
  default_warehouse_id: string | null
  sucursal_stock_code: string | null
}

interface PriceList {
  id: string
  name: string
  currency: string
}

interface Warehouse {
  id: string
  name: string
  country: string | null
  is_default: boolean
}

interface ProductRow {
  ean: string
  product_id: string
  title: string
  sku: string
  price: number | null
  weight_g: number | null
  image_url: string | null
  // Push result
  status: "pending" | "pushing" | "ok" | "error"
  shopify_url?: string
  action?: "created" | "updated"
  error?: string
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ShopifyConfigPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stores
  const [stores, setStores]           = useState<ShopifyStore[]>([])
  const [storeId, setStoreId]         = useState<string>("")
  const [storesLoading, setStoresLoading] = useState(true)

  // Store settings (editable)
  const [vendor, setVendor]                     = useState("")
  const [productCategory, setProductCategory]   = useState("Media > Books > Print Books")
  const [priceSource, setPriceSource]           = useState<"products.price" | "product_prices">("products.price")
  const [priceListId, setPriceListId]           = useState<string>("")
  const [warehouseId, setWarehouseId]           = useState<string>("")
  const [sucursalCode, setSucursalCode]         = useState<string>("")
  const [settingsSaving, setSettingsSaving]     = useState(false)
  const [settingsDirty, setSettingsDirty]       = useState(false)

  // Price lists + warehouses
  const [priceLists, setPriceLists]   = useState<PriceList[]>([])
  const [warehouses, setWarehouses]   = useState<Warehouse[]>([])

  // EAN input + product rows
  const [eanInput, setEanInput]       = useState("")
  const [productRows, setProductRows] = useState<ProductRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Push state
  const [pushing, setPushing]         = useState(false)

  // ── Load stores ────────────────────────────────────────────────────────

  const loadStores = useCallback(async () => {
    setStoresLoading(true)
    try {
      const d = await fetch("/api/shopify/stores").then(r => r.json())
      const list: ShopifyStore[] = d.stores ?? []
      setStores(list)
      if (list.length > 0) setStoreId(list[0].id)
    } finally {
      setStoresLoading(false)
    }
  }, [])

  useEffect(() => { loadStores() }, [loadStores])

  // ── Load catalogs (price lists + warehouses) once ─────────────────────

  useEffect(() => {
    fetch("/api/shopify/price-lists").then(r => r.json()).then(d => setPriceLists(d.lists ?? [])).catch(() => {})
    fetch("/api/warehouses").then(r => r.json()).then(d => {
      const list: Warehouse[] = d.warehouses ?? []
      setWarehouses(list)
    }).catch(() => {})
  }, [])

  // ── Sync store settings to form when store changes ────────────────────

  useEffect(() => {
    const s = stores.find(s => s.id === storeId)
    if (!s) return
    setVendor(s.vendor ?? "")
    setProductCategory(s.product_category ?? "Media > Books > Print Books")
    setPriceSource(s.price_source ?? "products.price")
    setPriceListId(s.price_list_id ?? "")
    setWarehouseId(s.default_warehouse_id ?? "")
    setSucursalCode(s.sucursal_stock_code ?? "")
    setSettingsDirty(false)
  }, [storeId, stores])

  // ── Save store settings ────────────────────────────────────────────────

  const saveSettings = async () => {
    if (!storeId) return
    setSettingsSaving(true)
    try {
      const res = await fetch("/api/shopify/stores/settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id:             storeId,
          vendor:               vendor  || null,
          product_category:     productCategory || null,
          price_source:         priceSource,
          price_list_id:        priceListId  || null,
          default_warehouse_id: warehouseId  || null,
          sucursal_stock_code:  sucursalCode || null,
        }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      // Update local store list
      setStores(prev => prev.map(s => s.id === storeId ? {
        ...s, vendor, product_category: productCategory,
        price_source: priceSource, price_list_id: priceListId || null,
        default_warehouse_id: warehouseId || null,
        sucursal_stock_code: sucursalCode || null,
      } : s))
      setSettingsDirty(false)
      toast({ title: "Configuración guardada" })
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" })
    } finally {
      setSettingsSaving(false)
    }
  }

  // ── Search product by EAN ──────────────────────────────────────────────

  const addByEan = async () => {
    const ean = eanInput.trim()
    if (!ean) return
    if (productRows.some(r => r.ean === ean)) {
      toast({ title: "EAN ya agregado", description: ean })
      setEanInput("")
      return
    }
    setSearchLoading(true)
    try {
      let product: any = null
      for (const field of ["ean", "isbn"]) {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(ean)}&limit=1&field=${field}`)
        const d   = await res.json()
        product   = d.products?.[0] ?? d.product ?? null
        if (product) break
      }
      if (!product) throw new Error(`No se encontró producto con EAN/ISBN: ${ean}`)
      setProductRows(prev => [...prev, {
        ean,
        product_id: product.id,
        title:      product.title ?? "",
        sku:        product.sku ?? "",
        price:      product.price ?? null,
        weight_g:   product.canonical_weight_g ?? null,
        image_url:  product.image_url ?? null,
        status:     "pending",
      }])
      setEanInput("")
    } catch (err: any) {
      toast({ title: "Producto no encontrado", description: err.message, variant: "destructive" })
    } finally {
      setSearchLoading(false)
    }
  }

  const removeRow = (ean: string) =>
    setProductRows(prev => prev.filter(r => r.ean !== ean))

  // ── Push all products directly to Shopify ─────────────────────────────

  const pushAllToShopify = async () => {
    if (!storeId || productRows.length === 0) return
    setPushing(true)

    // Reset all to pending
    setProductRows(prev => prev.map(r => ({ ...r, status: "pending", error: undefined, shopify_url: undefined })))

    for (const row of productRows) {
      // Mark as pushing
      setProductRows(prev => prev.map(r => r.ean === row.ean ? { ...r, status: "pushing" } : r))

      try {
        const res = await fetch("/api/shopify/push-product", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: storeId, ean: row.ean }),
        })
        const d = await res.json()
        if (!d.ok) throw new Error(d.error)

        setProductRows(prev => prev.map(r => r.ean === row.ean
          ? { ...r, status: "ok", shopify_url: d.shopify_url, action: d.action }
          : r,
        ))
      } catch (err: any) {
        setProductRows(prev => prev.map(r => r.ean === row.ean
          ? { ...r, status: "error", error: err.message }
          : r,
        ))
      }
    }

    setPushing(false)
    const ok    = productRows.filter(r => r.status === "ok").length  // note: updated after loop ends
    toast({ title: "Subida completada" })
  }

  // ── Export XLSX (secundario) ───────────────────────────────────────────

  const handleExportXlsx = async () => {
    if (!storeId || productRows.length === 0) return
    try {
      const res = await fetch("/api/shopify/export-generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id:     storeId,
          eans:         productRows.map(r => r.ean),
          warehouse_id: warehouseId || undefined,
        }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      const { utils, writeFile } = await import("xlsx")
      const ws = utils.json_to_sheet(d.rows, { header: d.columns })
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, "products")
      const name = stores.find(s => s.id === storeId)?.name ?? "shopify"
      writeFile(wb, `export_${name}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err: any) {
      toast({ title: "Error al exportar", description: err.message, variant: "destructive" })
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────

  const selectedStore  = stores.find(s => s.id === storeId)
  const okCount        = productRows.filter(r => r.status === "ok").length
  const errCount       = productRows.filter(r => r.status === "error").length
  const pushingCount   = productRows.filter(r => r.status === "pushing").length

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/shopify/orders" className="hover:text-foreground">Shopify</Link>
            <span>/</span>
            <span className="text-foreground">Publicar productos</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Publicar en Shopify</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Subí productos directamente desde la base de datos a tu tienda Shopify, con todos los metafields y stock.
          </p>
        </div>

        {/* ── Tienda ── */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Tienda</h2>
          </div>

          {storesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando tiendas...
            </div>
          ) : stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay tiendas conectadas.{" "}
              <Link href="/integrations/shopify-stores" className="underline hover:text-foreground">Agregar tienda</Link>
            </p>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="Seleccioná una tienda" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name || s.shop_domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStore && (
                <span className="text-xs text-muted-foreground font-mono">
                  {selectedStore.shop_domain}
                </span>
              )}
              <Link href="/integrations/shopify-stores" className="text-xs text-muted-foreground hover:text-foreground underline ml-auto">
                Gestionar tiendas
              </Link>
            </div>
          )}
        </section>

        {/* ── Configuración por tienda ── */}
        {storeId && (
          <section className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-medium">Configuración de la tienda</h2>
                {settingsDirty && <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">Sin guardar</Badge>}
              </div>
              <Button
                size="sm"
                onClick={saveSettings}
                disabled={settingsSaving || !settingsDirty}
                variant={settingsDirty ? "default" : "outline"}
              >
                {settingsSaving
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Guardar
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Vendor */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Store className="h-3 w-3" /> Vendor
                </Label>
                <Input
                  value={vendor}
                  onChange={e => { setVendor(e.target.value); setSettingsDirty(true) }}
                  placeholder="ej: libroide argentina"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Aparece en el campo Vendor de todos los productos</p>
              </div>

              {/* Product Category */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Product Category</Label>
                <Input
                  value={productCategory}
                  onChange={e => { setProductCategory(e.target.value); setSettingsDirty(true) }}
                  placeholder="Media > Books > Print Books"
                  className="h-8 text-sm"
                />
              </div>

              {/* Precio */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Fuente de precio
                </Label>
                <Select
                  value={priceSource}
                  onValueChange={v => { setPriceSource(v as any); setSettingsDirty(true) }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="products.price">Precio del producto</SelectItem>
                    <SelectItem value="product_prices">Motor de pricing (lista de precios)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Lista de precios (solo si price_source = product_prices) */}
              {priceSource === "product_prices" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Lista de precios</Label>
                  <Select
                    value={priceListId}
                    onValueChange={v => { setPriceListId(v); setSettingsDirty(true) }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Seleccioná una lista" />
                    </SelectTrigger>
                    <SelectContent>
                      {priceLists.map(pl => (
                        <SelectItem key={pl.id} value={pl.id}>
                          {pl.name} ({pl.currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Almacén */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Warehouse className="h-3 w-3" /> Almacén de stock
                </Label>
                <Select
                  value={warehouseId || "__none__"}
                  onValueChange={v => { setWarehouseId(v === "__none__" ? "" : v); setSettingsDirty(true) }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Sin almacén configurado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin almacén fijo (mejor disponible)</SelectItem>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}{w.country ? ` (${w.country})` : ""}
                        {w.is_default ? " — predeterminado" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sucursal Stock (código Shopify) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Sucursal Stock (metafield)
                </Label>
                <Input
                  value={sucursalCode}
                  onChange={e => { setSucursalCode(e.target.value); setSettingsDirty(true) }}
                  placeholder="ej: 5AJ;YFB;YXZG"
                  className="h-8 text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Códigos de location Shopify separados por ";"</p>
              </div>
            </div>
          </section>
        )}

        {/* ── Productos a subir ── */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Productos a publicar</h2>
          </div>

          {/* EAN input */}
          <div className="flex items-center gap-2">
            <Input
              value={eanInput}
              onChange={e => setEanInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addByEan()}
              placeholder="EAN / ISBN…"
              className="max-w-xs h-9"
              disabled={searchLoading || pushing}
            />
            <Button
              size="sm"
              onClick={addByEan}
              disabled={searchLoading || !eanInput.trim() || pushing}
            >
              {searchLoading
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Agregar
            </Button>
            {productRows.length > 0 && !pushing && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground text-xs"
                onClick={() => setProductRows([])}
              >
                Limpiar todo
              </Button>
            )}
          </div>

          {/* Product table */}
          {productRows.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="py-2 text-xs w-8"></TableHead>
                    <TableHead className="py-2 text-xs">Título</TableHead>
                    <TableHead className="py-2 text-xs">EAN / SKU</TableHead>
                    <TableHead className="py-2 text-xs text-right">Precio</TableHead>
                    <TableHead className="py-2 text-xs text-center w-24">Estado</TableHead>
                    <TableHead className="py-2 text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productRows.map(row => (
                    <TableRow key={row.ean} className="text-sm">
                      <TableCell className="py-2">
                        {row.image_url && (
                          <img src={row.image_url} alt="" className="h-8 w-8 object-cover rounded border border-border" />
                        )}
                      </TableCell>
                      <TableCell className="py-2 max-w-xs">
                        <p className="truncate font-medium">{row.title}</p>
                        {row.shopify_url && (
                          <a href={row.shopify_url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-blue-400 hover:underline">
                            Ver en Shopify →
                          </a>
                        )}
                        {row.error && (
                          <p className="text-[10px] text-red-400 truncate">{row.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <p className="text-xs font-mono text-muted-foreground">{row.ean}</p>
                        {row.sku && <p className="text-[10px] text-muted-foreground/60">{row.sku}</p>}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-xs">
                        {row.price != null
                          ? `$${row.price.toLocaleString("es-AR")}`
                          : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        {row.status === "pending"  && <span className="text-[10px] text-muted-foreground">Pendiente</span>}
                        {row.status === "pushing"  && <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-blue-400" />}
                        {row.status === "ok"       && (
                          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                            {row.action === "created" ? "Creado" : "Actualizado"}
                          </Badge>
                        )}
                        {row.status === "error"    && (
                          <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <button
                          onClick={() => removeRow(row.ean)}
                          disabled={pushing}
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Ingresá un EAN o ISBN para agregar productos
              </p>
            </div>
          )}
        </section>

        {/* ── Acciones ── */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-4">
          <div className="text-sm text-muted-foreground">
            {productRows.length === 0 && "Agregá al menos un producto para subir"}
            {productRows.length > 0 && !pushing && okCount === 0 && errCount === 0 && (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {productRows.length} producto(s) listos
              </span>
            )}
            {pushing && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo… {okCount + errCount}/{productRows.length}
              </span>
            )}
            {!pushing && (okCount > 0 || errCount > 0) && (
              <span className="flex items-center gap-2">
                {okCount > 0 && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />{okCount} ok</span>}
                {errCount > 0 && <span className="text-red-400 flex items-center gap-1"><AlertCircle className="h-4 w-4" />{errCount} con error</span>}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Exportar XLSX (secundario) */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportXlsx}
              disabled={!storeId || productRows.length === 0 || pushing}
              title="Descargar Excel para importación manual"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Exportar XLSX
            </Button>

            {/* Subir directamente */}
            <Button
              size="lg"
              onClick={pushAllToShopify}
              disabled={!storeId || productRows.length === 0 || pushing}
              className="gap-2"
            >
              {pushing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CloudUpload className="h-4 w-4" />}
              {pushing
                ? `Subiendo ${okCount + errCount + pushingCount}/${productRows.length}…`
                : `Subir a Shopify (${productRows.length})`}
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
