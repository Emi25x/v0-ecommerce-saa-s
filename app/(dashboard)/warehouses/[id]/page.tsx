"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Search,
  Package,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  RefreshCw,
} from "lucide-react"

export default function WarehouseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const warehouseId = params.id as string

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [page, setPage] = useState(1)

  // Sources / suppliers assignment
  const [allSources, setAllSources] = useState<any[]>([])
  const [allSuppliers, setAllSuppliers] = useState<any[]>([])
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
  const [showSourcePanel, setShowSourcePanel] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Bidirectional fuzzy match: supplier code/name ↔ import_source name/source_key
   *  Normalizes underscores, hyphens, spaces and compares word tokens */
  function sourceMatchesSupplier(source: any, supplierCode: string, supplierName?: string): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[_\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    const tokenize = (s: string) => normalize(s).split(" ").filter(Boolean)

    const sName = normalize(source.name ?? "")
    const sKey = normalize(source.source_key ?? "")
    const code = normalize(supplierCode)
    const supName = normalize(supplierName ?? "")

    // Direct substring matches (both directions)
    if (sName && code && (sName.includes(code) || code.includes(sName))) return true
    if (sKey && code && (sKey.includes(code) || code.includes(sKey))) return true
    if (sName && supName && (sName.includes(supName) || supName.includes(sName))) return true
    if (sKey && supName && (sKey.includes(supName) || supName.includes(sKey))) return true

    // Token-based: if the first word of the source name/key matches any word of supplier
    const codeTokens = tokenize(supplierCode)
    const nameTokens = tokenize(supplierName ?? "")
    const allSupTokens = [...new Set([...codeTokens, ...nameTokens])]

    const sNameFirst = tokenize(source.name ?? "")[0] ?? ""
    const sKeyFirst = tokenize(source.source_key ?? "")[0] ?? ""

    if (sNameFirst && allSupTokens.includes(sNameFirst)) return true
    if (sKeyFirst && allSupTokens.includes(sKeyFirst)) return true

    // Reverse: first word of supplier matches source
    const sTokens = [...new Set([...tokenize(source.name ?? ""), ...tokenize(source.source_key ?? "")])]
    if (allSupTokens.length > 0 && allSupTokens.some((t) => t.length > 2 && sTokens.includes(t))) return true

    return false
  }

  const fetchData = useCallback(
    async (currentPage: number, currentSearch: string) => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({
          page: String(currentPage),
          ...(currentSearch ? { search: currentSearch } : {}),
        })
        const res = await fetch(`/api/warehouses/${warehouseId}/stock?${qs}`)
        if (!res.ok) {
          if (res.status === 404) router.push("/warehouses")
          return
        }
        const json = await res.json()
        setData(json)
        // Si el backend corrigió la página (ej: pedimos pág 20 pero solo hay 17),
        // sincronizar el estado local para que los controles de paginación funcionen.
        if (json.pagination?.page && json.pagination.page !== currentPage) {
          setPage(json.pagination.page)
        }
      } catch (e) {
        console.error("[WarehouseDetail]", e)
      } finally {
        setLoading(false)
      }
    },
    [warehouseId, router],
  )

  useEffect(() => {
    fetchData(page, search)
  }, [page, search, fetchData])

  // Load suppliers + import sources when panel opens
  useEffect(() => {
    if (!showSourcePanel) return
    Promise.all([fetch("/api/inventory/sources").then((r) => r.json()), fetch("/api/suppliers").then((r) => r.json())])
      .then(([srcData, supData]) => {
        const srcs = Array.isArray(srcData) ? srcData : (srcData.sources ?? srcData.data ?? [])
        const sups = supData.suppliers ?? []
        setAllSources(srcs)
        setAllSuppliers(sups)
        // Pre-select suppliers whose sources are already linked to this warehouse
        const linkedSourceIds = new Set(srcs.filter((s: any) => s.warehouse_id === warehouseId).map((s: any) => s.id))
        const preSelected = sups
          .filter((sup: any) => {
            const code = (sup.code ?? sup.name ?? "").toLowerCase()
            return srcs.some((s: any) => linkedSourceIds.has(s.id) && sourceMatchesSupplier(s, code, sup.name))
          })
          .map((sup: any) => sup.id)
        setSelectedSupplierIds(preSelected)
      })
      .catch(() => {})
  }, [showSourcePanel, warehouseId])

  async function handleAssignSources() {
    setAssigning(true)
    setAssignResult(null)
    try {
      // Resolve selected supplier IDs → matching import source IDs
      const sourceIds = allSources
        .filter((s: any) =>
          selectedSupplierIds.some((supId) => {
            const sup = allSuppliers.find((p: any) => p.id === supId)
            if (!sup) return false
            const code = (sup.code ?? sup.name ?? "").toLowerCase()
            return sourceMatchesSupplier(s, code, sup.name)
          }),
        )
        .map((s: any) => s.id)

      // Guard: si hay proveedores seleccionados pero 0 fuentes coinciden, avisar
      if (selectedSupplierIds.length > 0 && sourceIds.length === 0) {
        setAssignResult("No se encontraron fuentes de importación para los proveedores seleccionados. Verificá que existan import sources configurados.")
        setAssigning(false)
        return
      }

      const res = await fetch(`/api/warehouses/${warehouseId}/assign-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_ids: sourceIds }),
      })
      const d = await res.json()
      setAssignResult(d.message ?? (d.error ? `Error: ${d.error}` : "Listo"))
      if (res.ok) {
        setShowSourcePanel(false)
        setPage(1)
        fetchData(1, search)
      }
    } catch (e: any) {
      setAssignResult(`Error: ${e.message}`)
    } finally {
      setAssigning(false)
    }
  }

  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setSearch(val)
    }, 350)
  }

  const warehouse = data?.warehouse
  const items: any[] = data?.items ?? []
  const pagination = data?.pagination
  const stats = data?.stats
  const linkedSources: string[] = data?.linked_sources ?? []
  const dataSource: string = data?.data_source ?? ""

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/warehouses">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{warehouse?.name ?? "Almacén"}</h1>
            {warehouse?.is_default && (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Por defecto
              </Badge>
            )}
            {warehouse?.code && <Badge variant="secondary">{warehouse.code}</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-muted-foreground">Contenido del almacén</p>
            {linkedSources.length > 0 && (
              <div className="flex gap-1">
                {linkedSources.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setShowSourcePanel((v) => !v)}>
          <Link2 className="h-4 w-4" />
          Vincular fuentes
        </Button>
      </div>

      {/* Hint when no import sources are linked */}
      {dataSource === "products_all" && !showSourcePanel && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Mostrando todos los productos con stock. Para ver solo los productos de este almacén, hacé clic en{" "}
            <strong>Vincular fuentes</strong> y asigná las fuentes de importación correspondientes.
          </span>
        </div>
      )}

      {/* Source assignment panel */}
      {showSourcePanel && (
        <Card className="p-5 space-y-4 border-dashed">
          <div>
            <p className="text-sm font-medium">Proveedores para este almacén</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Las fuentes del proveedor seleccionado alimentarán el stock de este almacén.
            </p>
          </div>
          {allSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay proveedores configurados.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {allSuppliers.map((sup: any) => {
                const code = (sup.code ?? sup.name ?? "").toLowerCase()
                const matchingSources = allSources.filter((s: any) => sourceMatchesSupplier(s, code, sup.name))
                const linkedCount = matchingSources.filter((s: any) => s.warehouse_id === warehouseId).length
                return (
                  <label key={sup.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={selectedSupplierIds.includes(sup.id)}
                      onChange={(e) =>
                        setSelectedSupplierIds((prev) =>
                          e.target.checked ? [...prev, sup.id] : prev.filter((id) => id !== sup.id),
                        )
                      }
                    />
                    <span className="text-sm font-medium">{sup.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {matchingSources.length} fuente{matchingSources.length !== 1 ? "s" : ""}
                    </span>
                    {linkedCount > 0 && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                        vinculado
                      </Badge>
                    )}
                  </label>
                )
              })}
            </div>
          )}
          {assignResult && <p className="text-sm text-muted-foreground">{assignResult}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAssignSources} disabled={assigning}>
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Guardar y hacer backfill
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSourcePanel(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Total SKUs</p>
            <p className="text-2xl font-semibold">{stats.total_skus.toLocaleString("es-AR")}</p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Unidades totales</p>
            <p className="text-2xl font-semibold">{stats.total_units != null ? stats.total_units.toLocaleString("es-AR") : "—"}</p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Publicados en ML</p>
            <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
              {stats.published_ml != null ? stats.published_ml.toLocaleString("es-AR") : "—"}
            </p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Sin publicar</p>
            <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
              {stats.unpublished_ml != null ? stats.unpublished_ml.toLocaleString("es-AR") : "—"}
            </p>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por título, EAN o SKU…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm bg-background"
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">EAN / SKU</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio prov.</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">ML</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {search ? "Sin resultados para esa búsqueda." : "Este almacén no tiene productos aún."}
                  </td>
                </tr>
              ) : (
                items.map((item: any) => {
                  const product = item.products
                  const title = product?.title || item.title || "—"
                  const ean = product?.ean || item.supplier_ean || "—"
                  const sku = product?.sku || item.supplier_sku || "—"
                  const hasML = item.ml_publications?.length > 0

                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium line-clamp-1">{title}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <p className="font-mono text-xs">{ean}</p>
                        {sku !== ean && <p className="font-mono text-xs">{sku}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-semibold tabular-nums ${
                            (item.stock_quantity ?? 0) === 0
                              ? "text-muted-foreground"
                              : (item.stock_quantity ?? 0) <= 3
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-foreground"
                          }`}
                        >
                          {(item.stock_quantity ?? 0).toLocaleString("es-AR")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                        {item.price_original != null
                          ? `$${Number(item.price_original).toLocaleString("es-AR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {hasML ? (
                          <div className="flex flex-col gap-1">
                            {item.ml_publications.map((pub: any) => (
                              <a
                                key={pub.ml_item_id}
                                href={`https://articulo.mercadolibre.com.ar/${pub.ml_item_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {pub.ml_item_id}
                                {pub.account_nickname && (
                                  <span className="text-muted-foreground">({pub.account_nickname})</span>
                                )}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasML ? (
                          <Badge
                            variant="outline"
                            className="gap-1 text-green-700 border-green-300 dark:text-green-400"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            En ML
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 text-muted-foreground border-border"
                          >
                            Sin publicar
                          </Badge>
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
        {pagination && (pagination.total_pages > 1 || page > 1) && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm text-muted-foreground">
            <span>
              {pagination.total > 0
                ? `${((page - 1) * pagination.page_size + 1).toLocaleString("es-AR")}–${Math.min(page * pagination.page_size, pagination.total).toLocaleString("es-AR")} de ${pagination.total.toLocaleString("es-AR")}`
                : "0 resultados"}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs">
                Pág. {page} de {pagination.total_pages}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
