"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Upload,
  Plus,
  Trash2,
  Download,
  Save,
  Store,
  FileSpreadsheet,
  PackageSearch,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShopifyStore {
  id: string
  shop_domain: string
  name: string | null
  is_active: boolean
}

interface ExportTemplate {
  template_columns_json: string[]
  defaults_json: Record<string, string>
}

interface ProductRow {
  ean: string
  product_id: string
  title: string
  sku: string
  price: number | null
  weight_g: number | null
  image_url: string | null
  stock: number
}

interface Warehouse {
  id: string
  name: string
  country: string | null
  is_default: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Qty",
  "Variant Price",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "SEO Title",
  "SEO Description",
]

const DEFAULT_DEFAULTS: Record<string, string> = {
  Vendor: "",
  Tags: "",
  Published: "TRUE",
  Type: "",
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ShopifyConfigPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stores
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [storeId, setStoreId] = useState<string>("")
  const [storesLoading, setStoresLoading] = useState(true)

  // Template
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS)
  const [defaults, setDefaults] = useState<Record<string, string>>(DEFAULT_DEFAULTS)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)

  // Warehouses
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<string>("__all__")

  // EAN input + product rows
  const [eanInput, setEanInput] = useState("")
  const [productRows, setProductRows] = useState<ProductRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Export
  const [exporting, setExporting] = useState(false)

  // ── Load stores ────────────────────────────────────────────────────────────

  useEffect(() => {
    setStoresLoading(true)
    fetch("/api/shopify/stores")
      .then((r) => r.json())
      .then((d) => {
        const list: ShopifyStore[] = d.stores ?? []
        setStores(list)
        if (list.length > 0) setStoreId(list[0].id)
      })
      .catch(() => {})
      .finally(() => setStoresLoading(false))
  }, [])

  // ── Load warehouses ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => r.json())
      .then((d) => {
        const list: Warehouse[] = d.warehouses ?? []
        setWarehouses(list)
        const def = list.find((w) => w.is_default)
        if (def) setWarehouseId(def.id)
      })
      .catch(() => {})
  }, [])

  // ── Load template when store changes ──────────────────────────────────────

  useEffect(() => {
    if (!storeId) return
    setTemplateLoading(true)
    fetch(`/api/shopify/export-templates?store_id=${storeId}`)
      .then((r) => r.json())
      .then((d: { template: ExportTemplate | null }) => {
        if (d.template) {
          setColumns(d.template.template_columns_json?.length ? d.template.template_columns_json : DEFAULT_COLUMNS)
          setDefaults(d.template.defaults_json ?? DEFAULT_DEFAULTS)
        } else {
          setColumns(DEFAULT_COLUMNS)
          setDefaults(DEFAULT_DEFAULTS)
        }
      })
      .catch(() => {})
      .finally(() => setTemplateLoading(false))
  }, [storeId])

  // ── XLSX template upload ───────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { read, utils } = await import("xlsx")
      const buffer = await file.arrayBuffer()
      const wb = read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = utils.sheet_to_json<string[]>(ws, { header: 1 })
      const headers = (json[0] as unknown as string[]).filter(Boolean)
      if (!headers.length) throw new Error("No se encontraron columnas en la primera fila")
      setColumns(headers)
      toast({ title: "Plantilla cargada", description: `${headers.length} columnas detectadas` })
    } catch (err: any) {
      toast({ title: "Error al leer XLSX", description: err.message, variant: "destructive" })
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── Save template ──────────────────────────────────────────────────────────

  const saveTemplate = async () => {
    if (!storeId) return
    setTemplateSaving(true)
    try {
      const res = await fetch("/api/shopify/export-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          template_columns_json: columns,
          defaults_json: defaults,
        }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      toast({ title: "Plantilla guardada" })
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" })
    } finally {
      setTemplateSaving(false)
    }
  }

  // ── Search product by EAN ──────────────────────────────────────────────────

  const addByEan = async () => {
    const ean = eanInput.trim()
    if (!ean) return
    if (productRows.some((r) => r.ean === ean)) {
      toast({ title: "EAN ya agregado", description: ean })
      setEanInput("")
      return
    }
    setSearchLoading(true)
    try {
      const res = await fetch(
        `/api/products/search?q=${encodeURIComponent(ean)}&limit=1&field=ean`,
      )
      const d = await res.json()
      const product = d.products?.[0] ?? d.product ?? null
      if (!product) {
        // Try by ISBN
        const res2 = await fetch(
          `/api/products/search?q=${encodeURIComponent(ean)}&limit=1&field=isbn`,
        )
        const d2 = await res2.json()
        const product2 = d2.products?.[0] ?? d2.product ?? null
        if (!product2) throw new Error(`No se encontró producto con EAN/ISBN: ${ean}`)
        pushProduct(ean, product2)
      } else {
        pushProduct(ean, product)
      }
      setEanInput("")
    } catch (err: any) {
      toast({ title: "Producto no encontrado", description: err.message, variant: "destructive" })
    } finally {
      setSearchLoading(false)
    }
  }

  const pushProduct = (ean: string, p: any) => {
    setProductRows((prev) => [
      ...prev,
      {
        ean,
        product_id: p.id,
        title: p.title ?? "",
        sku: p.sku ?? "",
        price: p.price ?? null,
        weight_g: p.canonical_weight_g ?? null,
        image_url: p.image_url ?? null,
        stock: 0, // resolved at export time against warehouse
      },
    ])
  }

  const removeRow = (ean: string) =>
    setProductRows((prev) => prev.filter((r) => r.ean !== ean))

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!storeId || productRows.length === 0) return
    setExporting(true)
    try {
      const res = await fetch("/api/shopify/export-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: storeId,
          eans: productRows.map((r) => r.ean),
          warehouse_id: warehouseId !== "__all__" ? warehouseId : undefined,
        }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)

      const { utils, writeFile } = await import("xlsx")
      const ws = utils.json_to_sheet(d.rows, { header: d.columns })
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, "products")
      const storeName =
        stores.find((s) => s.id === storeId)?.name ??
        stores.find((s) => s.id === storeId)?.shop_domain ??
        "shopify"
      writeFile(wb, `export_${storeName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast({ title: "Exportado", description: `${d.rows.length} producto(s) exportados` })
    } catch (err: any) {
      toast({ title: "Error al exportar", description: err.message, variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedStore = stores.find((s) => s.id === storeId)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/shopify/orders" className="hover:text-foreground transition-colors">Shopify</Link>
            <span>/</span>
            <span className="text-foreground">Configuración de export</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Exportar a Shopify</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configurá la plantilla de columnas y generá un XLSX listo para importar en Shopify.
          </p>
        </div>

        {/* ── SECCIÓN 1: Tienda ── */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Store className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Tienda</h2>
          </div>

          {storesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando tiendas...
            </div>
          ) : stores.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No hay tiendas conectadas.{" "}
              <Link href="/integrations/shopify-stores" className="underline underline-offset-2 hover:text-foreground">
                Agregar tienda
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-48 max-w-xs">
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná una tienda" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name || s.shop_domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedStore && (
                <span className="text-xs text-muted-foreground font-mono">
                  {selectedStore.shop_domain}
                </span>
              )}
              <Link href="/integrations/shopify-stores" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-auto">
                Gestionar tiendas
              </Link>
            </div>
          )}
        </section>

        {/* ── SECCIÓN 2: Plantilla de columnas ── */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-medium">Plantilla de columnas</h2>
              {templateLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={!storeId}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Subir XLSX
              </Button>
              <Button
                size="sm"
                onClick={saveTemplate}
                disabled={!storeId || templateSaving}
              >
                {templateSaving
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5 mr-1.5" />
                }
                Guardar plantilla
              </Button>
            </div>
          </div>

          {/* Columns list */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Columnas ({columns.length})</Label>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-xs bg-muted/30 text-foreground"
                >
                  {col}
                  <button
                    onClick={() => setColumns((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Eliminar columna ${col}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Defaults */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Valores por defecto</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["Vendor", "Tags", "Published", "Type"].map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{key}</Label>
                  <Input
                    value={defaults[key] ?? ""}
                    onChange={(e) => setDefaults((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={key === "Published" ? "TRUE" : key.toLowerCase()}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SECCIÓN 3: Agregar productos por EAN ── */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-medium">Productos a exportar</h2>
          </div>

          {/* EAN input */}
          <div className="flex items-center gap-2">
            <Input
              value={eanInput}
              onChange={(e) => setEanInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addByEan()}
              placeholder="EAN / ISBN..."
              className="max-w-xs h-9"
              disabled={searchLoading}
            />
            <Button
              size="sm"
              onClick={addByEan}
              disabled={searchLoading || !eanInput.trim()}
            >
              {searchLoading
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5 mr-1.5" />
              }
              Agregar
            </Button>
          </div>

          {/* Warehouse picker */}
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">Almacén de stock:</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos / Mejor disponible</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}{w.country ? ` (${w.country})` : ""}
                    {w.is_default ? " — predeterminado" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product rows table */}
          {productRows.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="py-2 text-xs">EAN</TableHead>
                    <TableHead className="py-2 text-xs">Título</TableHead>
                    <TableHead className="py-2 text-xs">SKU</TableHead>
                    <TableHead className="py-2 text-xs text-right">Precio</TableHead>
                    <TableHead className="py-2 text-xs text-right">Peso (g)</TableHead>
                    <TableHead className="py-2 text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productRows.map((row) => (
                    <TableRow key={row.ean} className="text-sm">
                      <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                        {row.ean}
                      </TableCell>
                      <TableCell className="py-2 max-w-xs truncate">
                        <div className="flex items-center gap-2">
                          {row.image_url && (
                            <img
                              src={row.image_url}
                              alt=""
                              className="h-7 w-7 object-cover rounded border border-border flex-shrink-0"
                            />
                          )}
                          <span className="truncate">{row.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground font-mono">
                        {row.sku || <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-xs">
                        {row.price != null ? `$${row.price.toLocaleString("es-AR")}` : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-xs text-muted-foreground">
                        {row.weight_g ?? <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        <button
                          onClick={() => removeRow(row.ean)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
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

        {/* ── Exportar ── */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-4">
          <div className="text-sm text-muted-foreground">
            {productRows.length > 0
              ? <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-500" />{productRows.length} producto(s) listos para exportar</span>
              : "Agregá al menos un producto para exportar"
            }
          </div>
          <Button
            size="lg"
            onClick={handleExport}
            disabled={!storeId || productRows.length === 0 || exporting}
            className="gap-2"
          >
            {exporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />
            }
            Exportar plantilla Shopify
          </Button>
        </div>

      </div>
    </div>
  )
}
