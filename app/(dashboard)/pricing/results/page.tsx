"use client"

import { useState, useEffect, useCallback } from "react"
import { Play, RefreshCw, Loader2, Download, AlertTriangle, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface Result {
  id: string
  sku: string | null; ean: string | null; title: string
  list_id: string; list_name?: string
  cost_ars: number | null; pvp_ars: number | null
  final_price: number | null; margin_pct: number | null
  warnings: string[]
  calculated_at: string
}

interface PriceList { id: string; name: string; channel: string }

const ars = (n: number | null) => n == null ? "—"
  : n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })

const PAGE = 100

export default function PricingResultsPage() {
  const { toast }    = useToast()
  const [lists,      setLists]      = useState<PriceList[]>([])
  const [listId,     setListId]     = useState("all")
  const [results,    setResults]    = useState<Result[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [recalcing,  setRecalcing]  = useState(false)
  const [search,     setSearch]     = useState("")
  const [onlyWarn,   setOnlyWarn]   = useState(false)

  useEffect(() => {
    fetch("/api/pricing/lists")
      .then(r => r.json())
      .then(d => { if (d.ok) setLists(d.lists ?? []) })
  }, [])

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE), offset: String(p * PAGE),
        ...(listId !== "all" ? { list_id: listId } : {}),
        ...(search.trim()    ? { q: search.trim() } : {}),
        ...(onlyWarn         ? { only_warnings: "1" } : {}),
      })
      const res  = await fetch(`/api/pricing/results?${params}`)
      const data = await res.json()
      if (data.ok) { setResults(data.results ?? []); setTotal(data.total ?? 0) }
    } finally { setLoading(false) }
  }, [listId, search, onlyWarn])

  useEffect(() => { setPage(0); load(0) }, [listId, onlyWarn])

  const recalcAll = async () => {
    setRecalcing(true)
    try {
      const body: any = {}
      if (listId !== "all") body.list_id = listId
      const res  = await fetch("/api/pricing/recalculate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: `${data.count} precios recalculados` })
      load(0)
    } catch (e: any) {
      toast({ title: "Error al recalcular", description: e.message, variant: "destructive" })
    } finally { setRecalcing(false) }
  }

  const totalPages = Math.ceil(total / PAGE)

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resultados de precios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString("es-AR")} precios calculados en total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={recalcAll} disabled={recalcing}>
            {recalcing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Play className="h-3.5 w-3.5 mr-1.5" />
            }
            Recalcular {listId !== "all" ? "lista" : "todo"}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
          value={listId}
          onChange={e => { setListId(e.target.value); setPage(0) }}
        >
          <option value="all">Todas las listas</option>
          {lists.map(l => (
            <option key={l.id} value={l.id}>{l.name} ({l.channel})</option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <input
            className="w-full bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm"
            placeholder="Buscar SKU, EAN o titulo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setPage(0); load(0) } }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox" className="accent-primary"
            checked={onlyWarn}
            onChange={e => { setOnlyWarn(e.target.checked); setPage(0) }}
          />
          Solo con advertencias
        </label>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <TrendingUp className="h-8 w-8 opacity-40" />
            <p className="text-sm">Sin resultados. Recalculá para generar precios.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU / EAN</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lista</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Costo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">PVP</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio final</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margen</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.sku ?? r.ean ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <span className="truncate block text-xs">{r.title}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {lists.find(l => l.id === r.list_id)?.name ?? r.list_name ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{ars(r.cost_ars)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{ars(r.pvp_ars)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{ars(r.final_price)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${
                      r.margin_pct == null ? "text-muted-foreground"
                        : r.margin_pct < 10 ? "text-red-400"
                        : r.margin_pct < 20 ? "text-amber-400"
                        : "text-emerald-400"
                    }`}>
                      {r.margin_pct != null ? `${r.margin_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.warnings?.length > 0 && (
                        <div title={r.warnings.join(" | ")}>
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginacion */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
            <span>
              {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} de {total.toLocaleString("es-AR")}
            </span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => { setPage(p => p - 1); load(page - 1) }}>Ant.</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => { setPage(p => p + 1); load(page + 1) }}>Sig.</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
