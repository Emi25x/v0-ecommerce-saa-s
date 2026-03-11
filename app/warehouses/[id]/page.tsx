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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      } catch (e) {
        console.error("[WarehouseDetail]", e)
      } finally {
        setLoading(false)
      }
    },
    [warehouseId, router]
  )

  useEffect(() => {
    fetchData(page, search)
  }, [page, search, fetchData])

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

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/warehouses">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {warehouse?.name ?? "Almacén"}
            </h1>
            {warehouse?.is_default && (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Por defecto
              </Badge>
            )}
            {warehouse?.code && (
              <Badge variant="secondary">{warehouse.code}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Contenido del almacén
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Total SKUs</p>
            <p className="text-2xl font-semibold">{stats.total_skus.toLocaleString("es-AR")}</p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Unidades totales</p>
            <p className="text-2xl font-semibold">{stats.total_units.toLocaleString("es-AR")}</p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Vinculados al catálogo</p>
            <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
              {stats.matched_skus.toLocaleString("es-AR")}
            </p>
          </Card>
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Sin vincular</p>
            <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
              {stats.unmatched_skus.toLocaleString("es-AR")}
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
                        {product && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Vinculado al catálogo
                          </p>
                        )}
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
                        {item.product_id ? (
                          <Badge variant="outline" className="gap-1 text-green-700 border-green-300 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Vinculado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 dark:text-amber-400">
                            <AlertCircle className="h-3 w-3" />
                            Sin vincular
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
        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm text-muted-foreground">
            <span>
              {((page - 1) * pagination.page_size + 1).toLocaleString("es-AR")}–
              {Math.min(page * pagination.page_size, pagination.total).toLocaleString("es-AR")} de{" "}
              {pagination.total.toLocaleString("es-AR")}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
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
        )}
      </Card>
    </div>
  )
}
