"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw } from "lucide-react"

interface Warehouse {
  id: string
  name: string
  code: string
  source_keys: string[]
}

interface Product {
  id: string
  sku: string
  title: string
  stock: number
  stock_by_source: Record<string, number> | null
  price: number | null
}

interface ApiResponse {
  products: Product[]
  source_keys: string[]
  source_label: Record<string, string>
  warehouses: Warehouse[]
  no_warehouse_keys: string[]
  total: number
  page: number
  limit: number
}

const SOURCE_COLORS = [
  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
]

const WAREHOUSE_COLORS = [
  { header: "bg-blue-500/10 border-blue-500/20", badge: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { header: "bg-orange-500/10 border-orange-500/20", badge: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { header: "bg-purple-500/10 border-purple-500/20", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  {
    header: "bg-emerald-500/10 border-emerald-500/20",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
]

function fmt(n: number | null | undefined): string {
  if (n == null) return "–"
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
}

function sumKeys(obj: Record<string, number> | null, keys: string[]): number {
  if (!obj) return 0
  return keys.reduce((s, k) => s + (obj[k] ?? 0), 0)
}

type ViewMode = "warehouse" | "source"

export default function StockOverviewPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [zeroOnly, setZeroOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [view, setView] = useState<ViewMode>("warehouse")
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  const load = useCallback(async (s: string, z: boolean, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (s) params.set("search", s)
      if (z) params.set("zero", "1")
      const res = await fetch(`/api/inventory/stock-overview?${params}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load("", false, 1)
  }, []) // eslint-disable-line

  const handleSearch = (val: string) => {
    setSearch(val)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setPage(1)
      load(val, zeroOnly, 1)
    }, 350)
  }

  const handleZero = (val: boolean) => {
    setZeroOnly(val)
    setPage(1)
    load(search, val, 1)
  }

  const goPage = (p: number) => {
    setPage(p)
    load(search, zeroOnly, p)
  }

  const sourceKeys = data?.source_keys ?? []
  const warehouses = data?.warehouses ?? []
  const noWhKeys = data?.no_warehouse_keys ?? []
  const sourceLabel = data?.source_label ?? {}
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0
  const hasWarehouses = warehouses.length > 0

  // For "by warehouse" view: columns are warehouses (summing their sources),
  // plus a column for unassigned sources if any
  const warehouseCols = [
    ...warehouses,
    ...(noWhKeys.length > 0 ? [{ id: "__none__", name: "Sin almacén", code: "–", source_keys: noWhKeys }] : []),
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold">Stock General</h1>
            <p className="text-sm text-muted-foreground">
              Stock total y desglosado por almacén y fuente
              {data && <span className="ml-2 text-xs">({data.total.toLocaleString("es-AR")} productos)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              <button
                onClick={() => setView("warehouse")}
                className={`px-3 py-1.5 transition-colors ${view === "warehouse" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
              >
                Por almacén
              </button>
              <button
                onClick={() => setView("source")}
                className={`px-3 py-1.5 border-l border-border transition-colors ${view === "source" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
              >
                Por fuente
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => load(search, zeroOnly, page)}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Buscar por título, SKU o EAN..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => handleZero(!zeroOnly)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
              zeroOnly
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : "text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Solo sin stock
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        {loading && !data ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Cargando...</div>
        ) : view === "warehouse" ? (
          // ── Vista por almacén ──────────────────────────────────────────────
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs w-28">SKU / EAN</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Producto</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-20">Precio</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-20">Total</th>
                {warehouseCols.map((wh, i) => (
                  <th key={wh.id} className={`text-right px-3 py-2.5 text-xs w-28 border-l border-border/30`}>
                    <div className={`inline-flex flex-col items-end gap-0.5`}>
                      <span
                        className={`font-medium px-1.5 py-0.5 rounded text-xs ${WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length].badge}`}
                      >
                        {wh.name}
                      </span>
                      <span className="text-zinc-600 font-mono text-[10px]">{wh.code}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {!data?.products.length && (
                <tr>
                  <td colSpan={4 + warehouseCols.length} className="text-center py-12 text-muted-foreground text-xs">
                    No se encontraron productos
                  </td>
                </tr>
              )}
              {data?.products.map((p) => {
                const isZero = (p.stock ?? 0) === 0
                return (
                  <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${loading ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 align-middle">
                      <div className="font-mono text-xs text-muted-foreground leading-tight">
                        <div>{p.sku || "—"}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <span className="line-clamp-2 leading-tight">{p.title}</span>
                    </td>
                    <td className="px-4 py-2.5 align-middle text-right text-muted-foreground">{fmt(p.price)}</td>
                    <td className="px-4 py-2.5 align-middle text-right font-semibold">
                      <span className={isZero ? "text-red-400" : ""}>{p.stock ?? 0}</span>
                    </td>
                    {warehouseCols.map((wh, i) => {
                      const qty = sumKeys(p.stock_by_source, wh.source_keys)
                      return (
                        <td key={wh.id} className="px-3 py-2.5 align-middle text-right border-l border-border/20">
                          <Badge
                            variant="outline"
                            className={`font-mono text-xs ${qty === 0 ? "text-red-400 border-red-500/30" : WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length].badge}`}
                          >
                            {qty}
                          </Badge>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          // ── Vista por fuente ───────────────────────────────────────────────
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs w-28">SKU / EAN</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Producto</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-20">Precio</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-20">Total</th>
                {sourceKeys.map((k, i) => (
                  <th key={k} className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono text-xs ${SOURCE_COLORS[i % SOURCE_COLORS.length]}`}
                      >
                        {k}
                      </span>
                      {sourceLabel[k] && (
                        <span className="text-zinc-600 text-[10px] truncate max-w-20">{sourceLabel[k]}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {!data?.products.length && (
                <tr>
                  <td colSpan={4 + sourceKeys.length} className="text-center py-12 text-muted-foreground text-xs">
                    No se encontraron productos
                  </td>
                </tr>
              )}
              {data?.products.map((p) => {
                const isZero = (p.stock ?? 0) === 0
                return (
                  <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${loading ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 align-middle">
                      <div className="font-mono text-xs text-muted-foreground leading-tight">
                        <div>{p.sku || "—"}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <span className="line-clamp-2 leading-tight">{p.title}</span>
                    </td>
                    <td className="px-4 py-2.5 align-middle text-right text-muted-foreground">{fmt(p.price)}</td>
                    <td className="px-4 py-2.5 align-middle text-right font-semibold">
                      <span className={isZero ? "text-red-400" : ""}>{p.stock ?? 0}</span>
                    </td>
                    {sourceKeys.map((k, i) => {
                      const qty = p.stock_by_source?.[k] ?? null
                      return (
                        <td key={k} className="px-3 py-2.5 align-middle text-right">
                          {qty === null ? (
                            <span className="text-zinc-700">–</span>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`font-mono text-xs ${qty === 0 ? "text-red-400 border-red-500/30" : SOURCE_COLORS[i % SOURCE_COLORS.length]}`}
                            >
                              {qty}
                            </Badge>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="border-t border-border/50 px-6 py-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Página {page} de {totalPages} · {data?.total.toLocaleString("es-AR")} productos
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
