"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  Store,
  Send,
  MapPin,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Package,
  Tag,
  Barcode,
  BookOpen,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────

interface ShopifyStore {
  id: string
  name: string
  shop_domain: string
  is_active: boolean
  currency: string | null
}

interface Warehouse {
  id: string
  name: string
  country: string | null
  code: string | null
}

interface ShopifyLocation {
  id: string // GID "gid://shopify/Location/12345" or numeric string
  name: string
  address?: { address1?: string; city?: string; country?: string }
}

interface LocationMapping {
  id?: string
  warehouse_id: string
  shopify_location_id: string
  location_name: string
  warehouses?: { id: string; name: string; country: string | null; code: string | null }
}

interface PushResult {
  ok: boolean
  action?: "created" | "updated"
  shopify_product_id?: number
  shopify_variant_id?: number
  shopify_url?: string
  metafields_set?: number
  inventory_updated?: number
  inventory_by_location?: { location_id: string; qty: number; name: string }[]
  tags?: string
  error?: string
}

interface ProductPreview {
  id: string
  title: string
  brand: string | null
  author: string | null
  ean: string | null
  isbn: string | null
  sku: string | null
  price: number | null
  canonical_weight_g: number | null
  image_url: string | null
  category: string | null
  language: string | null
  binding: string | null
  pages: number | null
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ShopifyPushPage() {
  const { toast } = useToast()

  // Stores
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [loadingStores, setLoadingStores] = useState(true)

  // Push
  const [ean, setEan] = useState("")
  const [product, setProduct] = useState<ProductPreview | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<PushResult | null>(null)
  const [pushHistory, setPushHistory] = useState<PushResult[]>([])
  const eanInputRef = useRef<HTMLInputElement>(null)

  // Stores management
  const [newStoreName, setNewStoreName] = useState("")
  const [newStoreDomain, setNewStoreDomain] = useState("")
  const [newStoreToken, setNewStoreToken] = useState("")
  const [savingStore, setSavingStore] = useState(false)

  // Location mappings
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [shopifyLocations, setShopifyLocations] = useState<ShopifyLocation[]>([])
  const [mappings, setMappings] = useState<LocationMapping[]>([])
  const [loadingLocs, setLoadingLocs] = useState(false)
  const [savingMappings, setSavingMappings] = useState(false)

  // ── Fetch stores ──────────────────────────────────────────────────────────
  const fetchStores = useCallback(async () => {
    setLoadingStores(true)
    const res = await fetch("/api/shopify/stores")
    const data = await res.json()
    const list: ShopifyStore[] = data.stores ?? []
    setStores(list)
    if (list.length > 0 && !selectedStoreId) setSelectedStoreId(list[0].id)
    setLoadingStores(false)
  }, [selectedStoreId])

  useEffect(() => {
    fetchStores()
  }, []) // eslint-disable-line

  // ── Fetch warehouses ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => r.json())
      .then((d) => setWarehouses(d.warehouses ?? d ?? []))
      .catch(() => {})
  }, [])

  // ── Fetch location mappings + Shopify locations when store changes ─────────
  useEffect(() => {
    if (!selectedStoreId) return
    setLoadingLocs(true)

    Promise.all([
      fetch(`/api/shopify/location-mappings?store_id=${selectedStoreId}`).then((r) => r.json()),
      fetch(`/api/shopify/stores/${selectedStoreId}/locations`).then((r) => r.json()),
    ])
      .then(([mapData, locData]) => {
        setMappings(mapData.mappings ?? [])
        // Normalize GID to numeric string
        const locs: ShopifyLocation[] = (locData.locations ?? []).map((l: any) => ({
          ...l,
          id: String(l.id).replace("gid://shopify/Location/", ""),
        }))
        setShopifyLocations(locs)
      })
      .catch(() => {})
      .finally(() => setLoadingLocs(false))
  }, [selectedStoreId])

  // ── Lookup product by EAN ─────────────────────────────────────────────────
  const lookupProduct = useCallback(
    async (value: string) => {
      const cleaned = value.trim()
      if (!cleaned || cleaned.length < 8) return
      setLoadingProduct(true)
      setPushResult(null)
      setProduct(null)
      try {
        const res = await fetch(`/api/products/lookup?ean=${encodeURIComponent(cleaned)}`)
        const data = await res.json()
        if (data.product) {
          setProduct(data.product)
        } else {
          toast({ title: "Producto no encontrado", description: `EAN: ${cleaned}`, variant: "destructive" })
        }
      } catch {
        toast({ title: "Error de red", variant: "destructive" })
      } finally {
        setLoadingProduct(false)
      }
    },
    [toast],
  )

  const handleEanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") lookupProduct(ean)
  }

  // ── Push to Shopify ───────────────────────────────────────────────────────
  const handlePush = async () => {
    if (!product || !selectedStoreId) return
    setPushing(true)
    setPushResult(null)
    try {
      const res = await fetch("/api/shopify/push-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: selectedStoreId, ean: product.ean ?? product.isbn ?? ean }),
      })
      const data: PushResult = await res.json()
      setPushResult(data)
      if (data.ok) {
        setPushHistory((prev) => [data, ...prev.slice(0, 19)])
        toast({
          title: data.action === "created" ? "Producto creado en Shopify" : "Producto actualizado",
          description: `${product.title} — ${data.metafields_set} metafields, ${data.inventory_updated} ubicaciones`,
        })
        setEan("")
        setProduct(null)
        eanInputRef.current?.focus()
      } else {
        toast({ title: "Error al publicar", description: data.error, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setPushing(false)
    }
  }

  // ── Save store ────────────────────────────────────────────────────────────
  const handleSaveStore = async () => {
    if (!newStoreDomain || !newStoreToken) return
    setSavingStore(true)
    try {
      const res = await fetch("/api/shopify/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStoreName || newStoreDomain,
          shop_domain: newStoreDomain,
          access_token: newStoreToken,
        }),
      })
      const data = await res.json()
      if (data.success || data.store) {
        toast({ title: "Tienda agregada" })
        setNewStoreName("")
        setNewStoreDomain("")
        setNewStoreToken("")
        fetchStores()
      } else {
        toast({ title: "Error", description: data.error ?? "No se pudo agregar la tienda", variant: "destructive" })
      }
    } finally {
      setSavingStore(false)
    }
  }

  // ── Save location mappings ────────────────────────────────────────────────
  const handleSaveMappings = async () => {
    if (!selectedStoreId) return
    setSavingMappings(true)
    try {
      const res = await fetch("/api/shopify/location-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: selectedStoreId, mappings }),
      })
      const data = await res.json()
      if (data.ok) toast({ title: "Ubicaciones guardadas" })
      else toast({ title: "Error", description: data.error, variant: "destructive" })
    } finally {
      setSavingMappings(false)
    }
  }

  const addMappingRow = () => {
    setMappings((prev) => [...prev, { warehouse_id: "", shopify_location_id: "", location_name: "" }])
  }

  const removeMappingRow = (idx: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateMappingRow = (idx: number, field: keyof LocationMapping, value: string) => {
    setMappings((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m
        const updated = { ...m, [field]: value }
        // Auto-fill location_name when selecting a shopify location
        if (field === "shopify_location_id") {
          const loc = shopifyLocations.find((l) => l.id === value)
          if (loc) updated.location_name = loc.name
        }
        return updated
      }),
    )
  }

  const selectedStore = stores.find((s) => s.id === selectedStoreId)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Store className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Shopify — Publicar productos</h1>
        <div className="ml-auto flex items-center gap-3">
          {loadingStores ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="Seleccionar tienda" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="ml-2 text-muted-foreground text-xs">{s.shop_domain}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedStore && (
            <a
              href={`https://${selectedStore.shop_domain}/admin`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <Tabs defaultValue="push">
          <TabsList className="mb-6">
            <TabsTrigger value="push" className="gap-2">
              <Send className="h-4 w-4" />
              Publicar por EAN
            </TabsTrigger>
            <TabsTrigger value="stores" className="gap-2">
              <Store className="h-4 w-4" />
              Tiendas
            </TabsTrigger>
            <TabsTrigger value="locations" className="gap-2">
              <MapPin className="h-4 w-4" />
              Ubicaciones
            </TabsTrigger>
          </TabsList>

          {/* ── TAB: PUBLICAR ─────────────────────────────────────────── */}
          <TabsContent value="push">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* EAN input card */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h2 className="font-medium flex items-center gap-2">
                  <Barcode className="h-4 w-4 text-primary" />
                  Buscar por EAN / ISBN
                </h2>
                <div className="flex gap-2">
                  <Input
                    ref={eanInputRef}
                    placeholder="Escanear o ingresar EAN / ISBN"
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                    onKeyDown={handleEanKeyDown}
                    className="font-mono"
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => lookupProduct(ean)}
                    disabled={loadingProduct || !ean.trim()}
                  >
                    {loadingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Product preview */}
                {product && (
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex gap-3">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.title} className="h-16 w-12 object-cover rounded" />
                      ) : (
                        <div className="h-16 w-12 rounded bg-muted flex items-center justify-center">
                          <BookOpen className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-tight line-clamp-2">{product.title}</p>
                        {product.author && <p className="text-xs text-muted-foreground mt-0.5">{product.author}</p>}
                        {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {product.ean && <InfoChip label="EAN" value={product.ean} />}
                      {product.isbn && <InfoChip label="ISBN" value={product.isbn} />}
                      {product.sku && <InfoChip label="SKU" value={product.sku} />}
                      {product.price && <InfoChip label="Precio" value={`$${product.price}`} />}
                      {product.canonical_weight_g && <InfoChip label="Peso" value={`${product.canonical_weight_g}g`} />}
                      {product.pages && <InfoChip label="Pags." value={String(product.pages)} />}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {product.category && (
                        <Badge variant="secondary" className="text-xs">
                          {product.category}
                        </Badge>
                      )}
                      {product.language && (
                        <Badge variant="outline" className="text-xs">
                          {product.language}
                        </Badge>
                      )}
                      {product.binding && (
                        <Badge variant="outline" className="text-xs">
                          {product.binding}
                        </Badge>
                      )}
                    </div>

                    <Button className="w-full" onClick={handlePush} disabled={pushing || !selectedStoreId}>
                      {pushing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Publicando...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Publicar en Shopify
                        </>
                      )}
                    </Button>
                    {!selectedStoreId && (
                      <p className="text-xs text-destructive text-center">Selecciona una tienda primero</p>
                    )}
                  </div>
                )}

                {/* Push result */}
                {pushResult && (
                  <div
                    className={`rounded-lg border p-4 ${pushResult.ok ? "border-green-600/30 bg-green-900/10" : "border-destructive/30 bg-destructive/10"}`}
                  >
                    {pushResult.ok ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          {pushResult.action === "created" ? "Producto creado" : "Producto actualizado"}
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                          <span>{pushResult.metafields_set} metafields</span>
                          <span>{pushResult.inventory_updated} ubicaciones</span>
                        </div>
                        {pushResult.inventory_by_location?.map((loc) => (
                          <div key={loc.location_id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {loc.name}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {loc.qty} uds.
                            </Badge>
                          </div>
                        ))}
                        {pushResult.tags && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Tag className="h-3 w-3" />
                            <span className="truncate">{pushResult.tags}</span>
                          </div>
                        )}
                        {pushResult.shopify_url && (
                          <a
                            href={pushResult.shopify_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Ver en Shopify <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-destructive text-sm">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {pushResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* History */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h2 className="font-medium flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Historial de esta sesion
                  {pushHistory.length > 0 && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {pushHistory.length}
                    </Badge>
                  )}
                </h2>
                {pushHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Los productos publicados aparecen aqui
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {pushHistory.map((r, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
                        {r.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {r.ok ? `Shopify ID: ${r.shopify_product_id}` : r.error}
                          </p>
                          {r.ok && (
                            <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                              <Badge
                                variant={r.action === "created" ? "default" : "secondary"}
                                className="text-xs px-1 py-0"
                              >
                                {r.action}
                              </Badge>
                              <span>{r.metafields_set} metafields</span>
                              <span>{r.inventory_updated} ubicaciones</span>
                            </div>
                          )}
                        </div>
                        {r.shopify_url && (
                          <a
                            href={r.shopify_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── TAB: TIENDAS ──────────────────────────────────────────── */}
          <TabsContent value="stores">
            <div className="space-y-4 max-w-xl">
              {/* Existing stores */}
              {stores.map((s) => (
                <div key={s.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <Store className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.shop_domain}</p>
                  </div>
                  <Badge variant={s.is_active ? "default" : "secondary"} className="text-xs">
                    {s.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                  {s.currency && (
                    <Badge variant="outline" className="text-xs">
                      {s.currency}
                    </Badge>
                  )}
                </div>
              ))}

              {/* Add new store */}
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-5 space-y-3">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Agregar tienda
                </h3>
                <div className="space-y-2">
                  <Input
                    placeholder="Nombre (ej: Tienda Argentina)"
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Dominio (ej: mi-tienda.myshopify.com)"
                    value={newStoreDomain}
                    onChange={(e) => setNewStoreDomain(e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  <Input
                    type="password"
                    placeholder="Admin API Access Token (shpat_...)"
                    value={newStoreToken}
                    onChange={(e) => setNewStoreToken(e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <Button onClick={handleSaveStore} disabled={savingStore || !newStoreDomain || !newStoreToken} size="sm">
                  {savingStore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Agregar
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── TAB: UBICACIONES ──────────────────────────────────────── */}
          <TabsContent value="locations">
            {!selectedStoreId ? (
              <p className="text-sm text-muted-foreground">Selecciona una tienda para configurar ubicaciones.</p>
            ) : (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Mapea cada almacen de tu DB a una ubicacion de Shopify para actualizar el inventario correctamente.
                  </p>
                  {loadingLocs && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                {/* Mapping rows */}
                <div className="space-y-2">
                  {mappings.map((m, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-card p-3 grid grid-cols-[1fr_1fr_auto] gap-2 items-center"
                    >
                      {/* Warehouse selector */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Almacen (DB)</Label>
                        <Select value={m.warehouse_id} onValueChange={(v) => updateMappingRow(idx, "warehouse_id", v)}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Seleccionar almacen" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.name}
                                {w.country && <span className="text-muted-foreground ml-1 text-xs">({w.country})</span>}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Shopify location selector */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Ubicacion Shopify</Label>
                        {shopifyLocations.length > 0 ? (
                          <Select
                            value={m.shopify_location_id}
                            onValueChange={(v) => updateMappingRow(idx, "shopify_location_id", v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Seleccionar ubicacion" />
                            </SelectTrigger>
                            <SelectContent>
                              {shopifyLocations.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            placeholder="ID numerico de Shopify"
                            value={m.shopify_location_id}
                            onChange={(e) => updateMappingRow(idx, "shopify_location_id", e.target.value)}
                            className="h-8 text-sm font-mono"
                          />
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive mt-5"
                        onClick={() => removeMappingRow(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={addMappingRow}>
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar fila
                  </Button>
                  <Button size="sm" onClick={handleSaveMappings} disabled={savingMappings}>
                    {savingMappings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Guardar
                  </Button>
                </div>

                {shopifyLocations.length > 0 && (
                  <div className="rounded-lg border border-border p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Ubicaciones disponibles en Shopify</p>
                    {shopifyLocations.map((l) => (
                      <div key={l.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{l.name}</span>
                        <span className="font-mono text-xs opacity-50 ml-auto">{l.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

// ── Small helper component ─────────────────────────────────────────────────

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted px-2 py-1">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
