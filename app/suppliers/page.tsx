"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  Upload, Package, FileText, CheckCircle2, XCircle, Clock, RefreshCw,
  AlertTriangle, ChevronDown, ChevronUp, Eye, Play, Database, BarChart3,
  FileSpreadsheet,
} from "lucide-react"
import { put } from "@vercel/blob"

// ─── Types ────────────────────────────────────────────────────────────────────
type CatalogMode   = "create_only" | "update_only" | "create_and_update"
type OverwriteMode = "none" | "only_empty_fields" | "all"
type FeedKind      = "catalog" | "stock"

interface Supplier  { id: string; name: string; code: string; is_active: boolean }
interface Catalog   { id: string; name: string; file_url: string; file_format: string; import_status: string | null; imported_at: string | null; total_items: number; matched_items: number; catalog_mode: string; overwrite_mode: string; warehouse_id: string | null; created_at: string }
interface Warehouse { id: string; name: string; code: string; is_default: boolean }
interface ImportRun { id: string; feed_kind: string; catalog_mode: string | null; overwrite_mode: string | null; total_rows: number; valid_ean: number; created_count: number; updated_count: number; skipped_count: number; set_zero_stock_count: number; new_detected_count: number; error_count: number; status: string; started_at: string; finished_at: string | null }

interface Preview {
  total_rows: number
  valid_ean: number
  skipped_invalid: number
  to_create: number
  to_update: number
  to_skip: number
  new_detected: number
  new_detected_eans?: string[]
  set_zero_count?: number
  unique_eans?: number
  sample_rows?: any[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pendiente",  cls: "bg-muted/50 text-muted-foreground" },
  processing: { label: "Procesando", cls: "bg-amber-500/15 text-amber-400" },
  completed:  { label: "Completado", cls: "bg-emerald-500/15 text-emerald-400" },
  failed:     { label: "Error",      cls: "bg-red-500/15 text-red-400" },
  running:    { label: "Corriendo",  cls: "bg-blue-500/15 text-blue-400" },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: "bg-muted/50 text-muted-foreground" }
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
}

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("es-AR")
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const { toast } = useToast()

  const [suppliers,        setSuppliers]        = useState<Supplier[]>([])
  const [catalogs,         setCatalogs]         = useState<Catalog[]>([])
  const [warehouses,       setWarehouses]       = useState<Warehouse[]>([])
  const [importRuns,       setImportRuns]       = useState<ImportRun[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string>("")
  const [activeTab,        setActiveTab]        = useState("import")
  const [loading,          setLoading]          = useState(false)

  // Upload form state
  const [uploading,     setUploading]     = useState(false)
  const [uploadFile,    setUploadFile]    = useState<File | null>(null)
  const [feedKind,      setFeedKind]      = useState<FeedKind>("catalog")
  const [catalogMode,   setCatalogMode]   = useState<CatalogMode>("update_only")
  const [overwriteMode, setOverwriteMode] = useState<OverwriteMode>("only_empty_fields")
  const [warehouseId,   setWarehouseId]   = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)

  // Preview state
  const [preview,         setPreview]         = useState<Preview | null>(null)
  const [previewLoading,  setPreviewLoading]  = useState(false)
  const [pendingCatalogId, setPendingCatalogId] = useState<string | null>(null)
  const [applying,         setApplying]         = useState(false)
  const [applyResult,      setApplyResult]      = useState<any | null>(null)
  const [showNewEans,      setShowNewEans]      = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/suppliers").then(r => r.json()).then(d => {
      const list = d.suppliers ?? []
      setSuppliers(list)
      if (list.length && !selectedSupplier) setSelectedSupplier(list[0].id)
    })
    fetch("/api/warehouses").then(r => r.json()).then(d => {
      const ws = d.warehouses ?? []
      setWarehouses(ws)
      const def = ws.find((w: Warehouse) => w.is_default)
      if (def) setWarehouseId(def.id)
    })
  }, [])

  useEffect(() => {
    if (!selectedSupplier) return
    fetch(`/api/suppliers/catalogs?supplier_id=${selectedSupplier}`).then(r => r.json()).then(d => setCatalogs(d.catalogs ?? []))
    fetch(`/api/suppliers/import-runs?supplier_id=${selectedSupplier}&limit=20`).then(r => r.json()).then(d => setImportRuns(d.runs ?? []))
  }, [selectedSupplier])

  // ── Upload file to Blob + create catalog record ───────────────────────────
  const handleUpload = async () => {
    if (!uploadFile || !selectedSupplier) return
    setUploading(true)
    setPreview(null)
    setApplyResult(null)
    setPendingCatalogId(null)

    try {
      // 1. Upload to Vercel Blob
      const blobRes = await fetch(`/api/blob-upload?filename=catalogs/${selectedSupplier}/${Date.now()}-${uploadFile.name}`, {
        method:  "POST",
        headers: { "content-type": uploadFile.type || "application/octet-stream" },
        body:    uploadFile,
      })
      const blobData = blobRes.ok ? await blobRes.json() : null
      const fileUrl  = blobData?.url

      if (!fileUrl) throw new Error("Error al subir archivo")

      // 2. Create catalog record
      const formData = new FormData()
      formData.append("supplier_id", selectedSupplier)
      formData.append("name", `${feedKind === "stock" ? "[STOCK]" : "[CAT]"} ${uploadFile.name}`)
      formData.append("description", `${feedKind} — ${new Date().toLocaleDateString("es-AR")}`)

      // Use a direct insert via a lightweight endpoint
      const catRes = await fetch("/api/suppliers/catalogs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id:    selectedSupplier,
          name:           `${feedKind === "stock" ? "[STOCK]" : "[CAT]"} ${uploadFile.name}`,
          file_url:       fileUrl,
          file_size_bytes: uploadFile.size,
          file_format:    uploadFile.name.split(".").pop()?.toLowerCase() ?? "xlsx",
          catalog_mode:   catalogMode,
          overwrite_mode: overwriteMode,
          warehouse_id:   warehouseId || null,
          feed_kind:      feedKind,
        }),
      })
      const catData = await catRes.json()
      const catalogId = catData.catalog?.id
      if (!catalogId) throw new Error("Error al crear registro de catálogo")

      setPendingCatalogId(catalogId)

      // 3. Auto-preview
      await runPreview(catalogId)

      // Refresh catalogs list
      const r2 = await fetch(`/api/suppliers/catalogs?supplier_id=${selectedSupplier}`)
      setCatalogs((await r2.json()).catalogs ?? [])

      toast({ title: "Archivo subido", description: "Revisá el preview antes de aplicar." })
    } catch (e: any) {
      toast({ title: "Error al subir", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  const runPreview = async (catalogId: string) => {
    setPreviewLoading(true)
    setPreview(null)
    try {
      const endpoint = feedKind === "stock"
        ? `/api/suppliers/catalogs/${catalogId}/import-stock`
        : `/api/suppliers/catalogs/${catalogId}/import`

      const res  = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          preview:        true,
          catalog_mode:   catalogMode,
          overwrite_mode: overwriteMode,
          warehouse_id:   warehouseId || null,
        }),
      })
      const data = await res.json()
      if (data.ok) setPreview(data)
      else toast({ title: "Error en preview", description: data.error, variant: "destructive" })
    } finally {
      setPreviewLoading(false)
    }
  }

  const applyImport = async () => {
    if (!pendingCatalogId) return
    setApplying(true)
    try {
      const endpoint = feedKind === "stock"
        ? `/api/suppliers/catalogs/${pendingCatalogId}/import-stock`
        : `/api/suppliers/catalogs/${pendingCatalogId}/import`

      const res  = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          preview:        false,
          catalog_mode:   catalogMode,
          overwrite_mode: overwriteMode,
          warehouse_id:   warehouseId || null,
        }),
      })
      const data = await res.json()
      setApplyResult(data)

      // Refresh runs log
      const r = await fetch(`/api/suppliers/import-runs?supplier_id=${selectedSupplier}&limit=20`)
      setImportRuns((await r.json()).runs ?? [])

      if (data.ok) {
        toast({ title: "Importación completada", description: `${fmt(data.created ?? 0)} creados · ${fmt(data.updated ?? 0)} actualizados` })
        setPreview(null)
        setPendingCatalogId(null)
        setUploadFile(null)
        if (fileRef.current) fileRef.current.value = ""
      } else {
        toast({ title: "Error al importar", description: data.error, variant: "destructive" })
      }
    } finally {
      setApplying(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const supplier = suppliers.find(s => s.id === selectedSupplier)

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Importación controlada de catálogo y stock por EAN</p>
        </div>
      </div>

      {/* Supplier selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {suppliers.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedSupplier(s.id)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
              s.id === selectedSupplier
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            {s.name}
            <span className="text-[10px] font-mono text-muted-foreground">{s.code}</span>
          </button>
        ))}
      </div>

      {!selectedSupplier && (
        <p className="text-muted-foreground text-sm">Seleccioná un proveedor para comenzar.</p>
      )}

      {selectedSupplier && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/30">
            <TabsTrigger value="import">
              <Upload className="h-3.5 w-3.5 mr-1.5" />Importar
            </TabsTrigger>
            <TabsTrigger value="catalogs">
              <FileText className="h-3.5 w-3.5 mr-1.5" />Archivos
            </TabsTrigger>
            <TabsTrigger value="logs">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Historial
            </TabsTrigger>
          </TabsList>

          {/* ── Import tab ── */}
          <TabsContent value="import" className="space-y-5 mt-4">

            {/* ARNOIA info banner */}
            {supplier?.code === "ARNOIA" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">Catálogo inicial ya importado</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    El catálogo completo de ARNOIA ya fue cargado. Para no sobreescribir datos existentes,
                    solo se permite <strong>actualización</strong> (update_only) o <strong>verificación</strong> de stock.
                    No usar create_and_update en este proveedor.
                  </p>
                </div>
              </div>
            )}

            {/* Config panel */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold">Configuración de importación</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Feed kind */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo de archivo</Label>
                  <Select value={feedKind} onValueChange={v => { setFeedKind(v as FeedKind); setPreview(null) }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="catalog">
                        <span className="flex items-center gap-2"><FileSpreadsheet className="h-3.5 w-3.5" />Catálogo</span>
                      </SelectItem>
                      <SelectItem value="stock">
                        <span className="flex items-center gap-2"><Database className="h-3.5 w-3.5" />Stock (col A=EAN, col B=qty)</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Catalog mode — only for catalog */}
                {feedKind === "catalog" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Modo catálogo</Label>
                    <Select value={catalogMode} onValueChange={v => { setCatalogMode(v as CatalogMode); setPreview(null) }}
                      disabled={supplier?.code === "ARNOIA"}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="create_only">Solo crear nuevos</SelectItem>
                        <SelectItem value="update_only">Solo actualizar existentes</SelectItem>
                        <SelectItem value="create_and_update">Crear y actualizar</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {catalogMode === "update_only" && "Solo toca products donde el EAN ya existe. Los nuevos se registran pero no se crean."}
                      {catalogMode === "create_only" && "Solo crea products si el EAN no existe. No modifica los existentes."}
                      {catalogMode === "create_and_update" && "Crea nuevos y actualiza los existentes."}
                    </p>
                  </div>
                )}

                {/* Overwrite mode — only for catalog */}
                {feedKind === "catalog" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Sobreescritura</Label>
                    <Select value={overwriteMode} onValueChange={v => { setOverwriteMode(v as OverwriteMode); setPreview(null) }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ninguna (no tocar campos)</SelectItem>
                        <SelectItem value="only_empty_fields">Solo completar vacíos</SelectItem>
                        <SelectItem value="all">Sobreescribir todo</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {overwriteMode === "none"              && "No modifica ningún campo en products existentes."}
                      {overwriteMode === "only_empty_fields" && "Solo completa campos que estén vacíos o en 0."}
                      {overwriteMode === "all"               && "Sobreescribe todos los campos del proveedor."}
                    </p>
                  </div>
                )}

                {/* Warehouse */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Almacén</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* File upload */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold">Subir archivo</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  id="catalog-file-input"
                  onChange={e => { setUploadFile(e.target.files?.[0] ?? null); setPreview(null); setApplyResult(null) }}
                />
                <label
                  htmlFor="catalog-file-input"
                  className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  {uploadFile ? uploadFile.name : "Seleccionar archivo (.xlsx / .csv)"}
                </label>
                {uploadFile && (
                  <Button
                    onClick={handleUpload}
                    disabled={uploading || !warehouseId}
                    size="sm"
                  >
                    {uploading
                      ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Subiendo...</>
                      : <><Eye className="h-3.5 w-3.5 mr-1.5" />Subir y previsualizar</>
                    }
                  </Button>
                )}
              </div>
              {!warehouseId && uploadFile && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />Seleccioná un almacén antes de continuar.
                </p>
              )}
            </div>

            {/* Preview panel */}
            {(previewLoading || preview) && (
              <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  Preview — antes de aplicar
                </h2>

                {previewLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Analizando archivo...
                  </div>
                )}

                {preview && (
                  <div className="space-y-4">
                    {/* Stats grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Filas leídas",       value: preview.total_rows,      color: "text-foreground" },
                        { label: "EAN válidos",         value: preview.valid_ean,       color: "text-blue-400" },
                        { label: "Descartados",         value: preview.skipped_invalid, color: "text-zinc-500" },
                        feedKind === "catalog"
                          ? { label: "A crear",         value: preview.to_create,       color: "text-emerald-400" }
                          : { label: "EAN únicos",      value: preview.unique_eans ?? 0, color: "text-emerald-400" },
                        feedKind === "catalog"
                          ? { label: "A actualizar",    value: preview.to_update,       color: "text-amber-400" }
                          : { label: "Se pondrán en 0", value: preview.set_zero_count ?? 0, color: "text-red-400" },
                        feedKind === "catalog"
                          ? { label: "Sin acción",      value: preview.to_skip,         color: "text-zinc-500" }
                          : null,
                        feedKind === "catalog"
                          ? { label: "Nuevos detectados (no creados)", value: preview.new_detected, color: "text-blue-400" }
                          : null,
                      ].filter(Boolean).map((stat, i) => (
                        <div key={i} className="rounded-md border border-border bg-background p-3">
                          <p className="text-xs text-muted-foreground">{stat!.label}</p>
                          <p className={`text-lg font-bold font-mono mt-0.5 ${stat!.color}`}>{fmt(stat!.value)}</p>
                        </div>
                      ))}
                    </div>

                    {/* New detected EANs */}
                    {feedKind === "catalog" && preview.new_detected > 0 && (
                      <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
                        <button
                          className="flex items-center gap-2 text-xs text-blue-400 font-medium w-full text-left"
                          onClick={() => setShowNewEans(v => !v)}
                        >
                          {showNewEans ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {preview.new_detected} EAN nuevos detectados (mode={catalogMode}, no se crearán en update_only)
                        </button>
                        {showNewEans && preview.new_detected_eans && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {preview.new_detected_eans.map(ean => (
                              <span key={ean} className="text-[10px] font-mono bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">{ean}</span>
                            ))}
                            {preview.new_detected > 20 && (
                              <span className="text-[10px] text-muted-foreground">...y {preview.new_detected - 20} más</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sample rows */}
                    {preview.sample_rows && preview.sample_rows.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Muestra (primeras 5 filas)</p>
                        <div className="overflow-x-auto rounded-md border border-border">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/30">
                              <tr>
                                {["EAN","Título","Autor","Editorial","Precio"].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.sample_rows.map((r, i) => (
                                <tr key={i} className="border-t border-border">
                                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">{r.ean}</td>
                                  <td className="px-3 py-1.5 max-w-[200px] truncate">{r.title}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground truncate">{r.author}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground truncate">{r.publisher}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{r.price != null ? `$${r.price}` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Apply button */}
                    <div className="flex items-center gap-3 pt-1">
                      <Button onClick={applyImport} disabled={applying} className="gap-2">
                        {applying
                          ? <><RefreshCw className="h-4 w-4 animate-spin" />Aplicando...</>
                          : <><Play className="h-4 w-4" />Aplicar importación</>
                        }
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Esta acción modifica la base de datos. Revisá el preview antes de confirmar.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Apply result */}
            {applyResult && (
              <div className={`rounded-lg border p-4 flex items-start gap-3 ${
                applyResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}>
                {applyResult.ok
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  : <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                }
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {applyResult.ok ? "Importación completada" : `Error: ${applyResult.error}`}
                  </p>
                  {applyResult.ok && (
                    <p className="text-xs text-muted-foreground">
                      {feedKind === "catalog"
                        ? `${fmt(applyResult.created)} creados · ${fmt(applyResult.updated)} actualizados · ${fmt(applyResult.skipped)} sin acción · ${fmt(applyResult.new_detected)} nuevos detectados`
                        : `${fmt(applyResult.unique_eans)} EAN procesados · ${fmt(applyResult.set_zero_count)} puestos en 0`
                      }
                    </p>
                  )}
                </div>
              </div>
            )}

          </TabsContent>

          {/* ── Catalogs tab ── */}
          <TabsContent value="catalogs" className="mt-4">
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Archivo</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Modo</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-left">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {catalogs.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">Sin archivos importados aún.</td></tr>
                  )}
                  {catalogs.map(cat => (
                    <tr key={cat.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{cat.name}</td>
                      <td className="px-4 py-3"><StatusBadge status={cat.import_status ?? "pending"} /></td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {cat.catalog_mode ?? "—"} / {cat.overwrite_mode ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {fmt(cat.matched_items)}/{fmt(cat.total_items)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {cat.imported_at ? new Date(cat.imported_at).toLocaleString("es-AR") : new Date(cat.created_at).toLocaleDateString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ── Logs tab ── */}
          <TabsContent value="logs" className="mt-4">
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-right">Filas</th>
                    <th className="px-4 py-3 text-right">Creados</th>
                    <th className="px-4 py-3 text-right">Actualizados</th>
                    <th className="px-4 py-3 text-right">Omitidos</th>
                    <th className="px-4 py-3 text-right">A cero</th>
                    <th className="px-4 py-3 text-left">Inicio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {importRuns.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Sin corridas registradas.</td></tr>
                  )}
                  {importRuns.map(run => (
                    <tr key={run.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          run.feed_kind === "stock"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-purple-500/15 text-purple-400"
                        }`}>
                          {run.feed_kind === "stock" ? "STOCK" : "CAT"}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{fmt(run.total_rows)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-emerald-400">{fmt(run.created_count)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-amber-400">{fmt(run.updated_count)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{fmt(run.skipped_count)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-red-400">{fmt(run.set_zero_stock_count)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(run.started_at).toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

        </Tabs>
      )}
    </div>
  )
}
