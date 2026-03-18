"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, ExternalLink, Search, Loader2 } from "lucide-react"

type PricingRow = {
  ean: string
  title: string
  ml_item_id: string | null
  my_price: number
  cost_price: number | null
  min_market: number | null
  median_market: number | null
  sellers_count: number | null
  full_pct: number | null
  sold_proxy: number | null
  zona33k: boolean
  suggestion: "subir" | "bajar" | "mantener" | "sin_datos"
  motivo: string
  has_snapshot: boolean
}

const SUGGESTION_CONFIG = {
  subir: { label: "Subir", icon: TrendingUp, className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  bajar: { label: "Bajar", icon: TrendingDown, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  mantener: { label: "Mantener", icon: Minus, className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  sin_datos: { label: "Sin datos", icon: Minus, className: "bg-zinc-700/30 text-zinc-500 border-zinc-700/30" },
}

function fmt(n: number | null) {
  if (n === null || n === undefined) return "—"
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
}

export default function PricingIntelPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [rows, setRows] = useState<PricingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [filterSuggestion, setFilterSuggestion] = useState<string>("all")
  const [today, setToday] = useState("")

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then((r) => r.json())
      .then((d) => {
        const accs = d.accounts || []
        setAccounts(accs)
        if (accs.length > 0) setSelectedAccountId(accs[0].id)
      })
  }, [])

  const loadData = useCallback(async () => {
    if (!selectedAccountId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ml/intel/pricing?account_id=${selectedAccountId}`)
      const data = await res.json()
      setRows(data.rows || [])
      setToday(data.today || "")
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    if (selectedAccountId) loadData()
  }, [selectedAccountId, loadData])

  const filtered = rows.filter((r) => {
    const matchSearch = !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.ean?.includes(search)
    const matchFilter = filterSuggestion === "all" || r.suggestion === filterSuggestion || (filterSuggestion === "zona33k" && r.zona33k)
    return matchSearch && matchFilter
  })

  const counts = {
    subir: rows.filter((r) => r.suggestion === "subir").length,
    bajar: rows.filter((r) => r.suggestion === "bajar").length,
    zona33k: rows.filter((r) => r.zona33k).length,
    sin_datos: rows.filter((r) => !r.has_snapshot).length,
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pricing Intel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comparativa de tus precios vs el mercado de hoy{today ? ` (${today})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {accounts.length > 1 && (
            <select
              value={selectedAccountId || ""}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.nickname}</option>
              ))}
            </select>
          )}
          <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: "subir", label: "Pueden subir", count: counts.subir, color: "text-emerald-400" },
          { key: "bajar", label: "Deben bajar", count: counts.bajar, color: "text-amber-400" },
          { key: "zona33k", label: "Zona 33k", count: counts.zona33k, color: "text-red-400" },
          { key: "sin_datos", label: "Sin snapshot", count: counts.sin_datos, color: "text-zinc-500" },
        ].map((c) => (
          <button
            key={c.key}
            onClick={() => setFilterSuggestion(filterSuggestion === c.key ? "all" : c.key)}
            className={`rounded-lg border p-4 text-left transition-colors ${filterSuggestion === c.key ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent/50"}`}
          >
            <div className={`text-2xl font-bold ${c.color}`}>{c.count}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo o EAN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterSuggestion}
          onChange={(e) => setFilterSuggestion(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="all">Todas las sugerencias</option>
          <option value="subir">Solo subir</option>
          <option value="bajar">Solo bajar</option>
          <option value="mantener">Solo mantener</option>
          <option value="zona33k">Zona 33k</option>
          <option value="sin_datos">Sin datos</option>
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} items</span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <Search className="h-8 w-8 opacity-30" />
            <p className="text-sm">{rows.length === 0 ? "No hay datos — ejecuta un scan primero desde Centro Diario" : "Sin resultados"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">EAN / Titulo</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tu precio</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Min mkt</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Mediana</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Sellers</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">%FULL</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Vendidos</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Sugerencia</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Motivo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => {
                  const cfg = SUGGESTION_CONFIG[row.suggestion]
                  const Icon = cfg.icon
                  return (
                    <tr
                      key={row.ean}
                      className={`transition-colors hover:bg-accent/30 ${row.zona33k ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex items-center gap-2">
                          {row.zona33k && <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                          <div>
                            <div className="font-medium text-foreground truncate" title={row.title || ""}>
                              {row.title ? (row.title.length > 35 ? row.title.slice(0, 35) + "…" : row.title) : row.ean}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">{row.ean}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                        {fmt(row.my_price)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {fmt(row.min_market)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {fmt(row.median_market)}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {row.sellers_count ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.full_pct !== null ? (
                          <span className={row.full_pct > 50 ? "text-amber-400 font-medium" : "text-muted-foreground"}>
                            {row.full_pct}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {row.sold_proxy ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`gap-1 text-xs ${cfg.className}`}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px]">
                        <span title={row.motivo}>{row.motivo ? (row.motivo.length > 50 ? row.motivo.slice(0, 50) + "…" : row.motivo) : "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {row.ml_item_id && (
                          <a
                            href={`https://www.mercadolibre.com.ar/p/${row.ml_item_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
