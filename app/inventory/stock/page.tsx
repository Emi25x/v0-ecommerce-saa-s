"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw } from "lucide-react"

interface Product {
  id: string
  sku: string
  ean: string | null
  title: string
  stock: number
  stock_by_source: Record<string, number> | null
  price: number | null
}

interface ApiResponse {
  products: Product[]
  source_keys: string[]
  total: number
  page: number
  limit: number
}

const SOURCE_COLORS: Record<string, string> = {
  azeta:       "bg-blue-500/15 text-blue-400 border-blue-500/30",
  arnoia:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  arg_stock:   "bg-orange-500/15 text-orange-400 border-orange-500/30",
  legacy:      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
}

function sourceColor(key: string): string {
  return SOURCE_COLORS[key] ?? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "–"
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
}

export default function StockOverviewPage() {
  const [data, setData]       = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState("")
  const [zeroOnly, setZeroOnly] = useState(false)
  const [page, setPage]       = useState(1)
  const searchTimeout         = useRef<ReturnType<typeof setTimeout>>()

  const load = useCallback(async (s: string, z: boolean, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (s)  params.set("search", s)
      if (z)  params.set("zero", "1")
      const res = await fetch(`/api/inventory/stock-overview?${params}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(search, zeroOnly, page) }, [])  // eslint-disable-line

  const handleSearch = (val: string) => {
    setSearch(val)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => { setPage(1); load(val, zeroOnly, 1) }, 350)
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
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold">Stock General</h1>
            <p className="text-sm text-muted-foreground">
              Stock total y por almacén/fuente de cada producto
              {data && <span className="ml-2 text-xs">({data.total.toLocaleString("es-AR")} productos)</span>}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => load(search, zeroOnly, page)}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Fuentes legend */}
        {sourceKeys.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-muted-foreground">Fuentes:</span>
            {sourceKeys.map(k => (
              <span key={k} className={`text-xs px-2 py-0.5 rounded border font-mono ${sourceColor(k)}`}>
                {k}
              </span>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Buscar por título, SKU o EAN..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
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
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs w-28">SKU / EAN</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Producto</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-20">Precio</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-20">Total</th>
                {sourceKeys.map(k => (
                  <th key={k} className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs w-24">
                    <span className={`px-1.5 py-0.5 rounded font-mono ${sourceColor(k)}`}>{k}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {data?.products.length === 0 && (
                <tr>
                  <td colSpan={4 + sourceKeys.length} className="text-center py-12 text-muted-foreground text-xs">
                    No se encontraron productos
                  </td>
                </tr>
              )}
              {data?.products.map(p => {
                const isZero = (p.stock ?? 0) === 0
                return (
                  <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${loading ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 align-middle">
                      <div className="font-mono text-xs text-muted-foreground leading-tight">
                        <div>{p.sku || "—"}</div>
                        {p.ean && <div className="text-zinc-600">{p.ean}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <span className="line-clamp-2 leading-tight">{p.title}</span>
                    </td>
                    <td className="px-4 py-2.5 align-middle text-right text-muted-foreground">
                      {fmt(p.price)}
                    </td>
                    <td className="px-4 py-2.5 align-middle text-right font-semibold">
                      <span className={isZero ? "text-red-400" : "text-foreground"}>
                        {p.stock ?? 0}
                      </span>
                    </td>
                    {sourceKeys.map(k => {
                      const qty = p.stock_by_source?.[k] ?? null
                      return (
                        <td key={k} className="px-3 py-2.5 align-middle text-right">
                          {qty === null ? (
                            <span className="text-zinc-700">–</span>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`font-mono text-xs ${qty === 0 ? "text-red-400 border-red-500/30" : sourceColor(k)}`}
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
