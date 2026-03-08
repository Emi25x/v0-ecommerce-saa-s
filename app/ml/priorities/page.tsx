"use client"

import { useEffect, useState, useCallback } from "react"
import {
  RefreshCw, Play, Loader2, TrendingUp, AlertCircle,
  BookOpen, ChevronUp, ChevronDown, ExternalLink,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"

// ── Types ─────────────────────────────────────────────────────────────────
interface Priority {
  id: string
  product_id: string
  ml_account_id: string | null
  publish_priority_score: number
  priority_level: "critical" | "high" | "medium" | "low"
  recommended_action: string
  reason_summary: string | null
  score_demand: number
  score_competition: number
  score_stock: number
  score_profitability: number
  score_radar_boost: number
  has_inactive_listing: boolean
  active_listings_count: number
  stock_total: number
  updated_at: string
  products: {
    id: string; title: string; author: string | null; isbn: string | null
    ean: string | null; sku: string | null; stock: number; cost_price: number | null
    price: number | null; image_url: string | null; category: string | null
  } | null
}

// ── Constants ─────────────────────────────────────────────────────────────
const LEVEL_COLOR: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/25",
  high:     "bg-orange-500/15 text-orange-400 border-orange-500/25",
  medium:   "bg-amber-500/15 text-amber-400 border-amber-500/25",
  low:      "bg-muted text-muted-foreground border-border",
}
const LEVEL_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-amber-500",
  low:      "bg-muted-foreground",
}
const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  crear_publicacion:   { label: "Crear publicación",  color: "text-emerald-400" },
  reactivar_publicacion: { label: "Reactivar",         color: "text-blue-400" },
  mejorar_publicacion:  { label: "Mejorar",            color: "text-sky-400" },
  comprar_stock:        { label: "Comprar stock",      color: "text-amber-400" },
  no_priorizar:         { label: "No priorizar",       color: "text-muted-foreground" },
}

function ScoreBar({ label, value, max = 30, color }: {
  label: string; value: number; max?: number; color: string
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{value}/{max}</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  )
}

export default function PrioritiesPage() {
  const [rows, setRows]               = useState<Priority[]>([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [q, setQ]                     = useState("")
  const [levelFilter, setLevelFilter] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [sortField, setSortField]     = useState<"score" | "stock" | "title">("score")
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc")
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [calcResult, setCalcResult]   = useState<{ processed: number; total: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "300" })
      if (q)            params.set("q", q)
      if (levelFilter)  params.set("priority_level", levelFilter)
      if (actionFilter) params.set("recommended_action", actionFilter)
      const res  = await fetch(`/api/ml/priorities?${params}`)
      const data = await res.json()
      if (data.ok) { setRows(data.rows ?? []); setTotal(data.total ?? 0) }
    } finally { setLoading(false) }
  }, [q, levelFilter, actionFilter])

  useEffect(() => { load() }, [load])

  const handleCalculate = async () => {
    setCalculating(true)
    setCalcResult(null)
    try {
      const res  = await fetch("/api/ml/priorities/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const data = await res.json()
      if (data.ok) { setCalcResult({ processed: data.processed, total: data.total }); await load() }
    } finally { setCalculating(false) }
  }

  // Client-side sort
  const sorted = [...rows].sort((a, b) => {
    let va: number | string = 0, vb: number | string = 0
    if (sortField === "score") { va = a.publish_priority_score; vb = b.publish_priority_score }
    if (sortField === "stock") { va = a.stock_total; vb = b.stock_total }
    if (sortField === "title") { va = a.products?.title ?? ""; vb = b.products?.title ?? "" }
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number)
  })

  const SortBtn = ({ field, label }: { field: typeof sortField; label: string }) => (
    <button
      onClick={() => { if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("desc") } }}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {sortField === field
        ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        : <ChevronDown className="h-3 w-3 opacity-30" />
      }
    </button>
  )

  // Summary counts
  const counts = {
    critical: rows.filter(r => r.priority_level === "critical").length,
    high:     rows.filter(r => r.priority_level === "high").length,
    medium:   rows.filter(r => r.priority_level === "medium").length,
    low:      rows.filter(r => r.priority_level === "low").length,
    radar:    rows.filter(r => r.score_radar_boost > 0).length,
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-5 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ML Publish Priorities</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Score de prioridad para publicar en Mercado Libre, calculado por demanda, competencia, stock y rentabilidad.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={handleCalculate} disabled={calculating}>
                  {calculating
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Calculando...</>
                    : <><Play className="h-4 w-4 mr-2" />Recalcular scores</>
                  }
                </Button>
              </TooltipTrigger>
              <TooltipContent>Analiza todos los productos y recalcula su score de prioridad de publicación.</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Calc result banner */}
        {calcResult && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 flex items-center gap-3 text-sm">
            <TrendingUp className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>
              Recalculados <span className="font-semibold text-emerald-400">{calcResult.processed.toLocaleString("es-AR")}</span>
              {" "}de{" "}
              <span className="font-semibold">{calcResult.total.toLocaleString("es-AR")}</span> productos.
            </span>
          </div>
        )}

        {/* Summary chips */}
        <div className="flex gap-2 flex-wrap">
          {[
            { level: "critical", count: counts.critical, label: "Crítica" },
            { level: "high",     count: counts.high,     label: "Alta" },
            { level: "medium",   count: counts.medium,   label: "Media" },
            { level: "low",      count: counts.low,      label: "Baja" },
          ].map(c => (
            <button
              key={c.level}
              onClick={() => setLevelFilter(l => l === c.level ? "" : c.level)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                levelFilter === c.level
                  ? LEVEL_COLOR[c.level]
                  : "border-border text-muted-foreground hover:border-border/80"
              }`}
            >
              {c.count} {c.label}
            </button>
          ))}
          {counts.radar > 0 && (
            <span className="rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-400 px-3 py-1 text-xs font-medium">
              {counts.radar} con boost Radar
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground self-center">{total.toLocaleString("es-AR")} total</span>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Input
            className="h-8 text-sm w-64"
            placeholder="Buscar por título, ISBN, autor..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <Select value={actionFilter || "all"} onValueChange={v => setActionFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm w-48"><SelectValue placeholder="Acción sugerida" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las acciones</SelectItem>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/20 animate-pulse border border-border" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <Card className="p-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Sin datos de prioridad</p>
            <p className="text-sm text-muted-foreground mt-1">
              Hacé clic en "Recalcular scores" para analizar tu catálogo.
            </p>
            <Button size="sm" className="mt-4" onClick={handleCalculate} disabled={calculating}>
              {calculating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Calcular ahora
            </Button>
          </Card>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left">
                    <SortBtn field="title" label="Libro" />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortBtn field="score" label="Score" />
                  </th>
                  <th className="px-4 py-3 text-left">Prioridad</th>
                  <th className="px-4 py-3 text-right">
                    <SortBtn field="stock" label="Stock" />
                  </th>
                  <th className="px-4 py-3 text-right">Pub. activas</th>
                  <th className="px-4 py-3 text-left">Acción sugerida</th>
                  <th className="px-4 py-3 text-left">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((row, idx) => {
                  const product = row.products
                  const isExpanded = expandedId === row.id
                  const action = ACTION_LABEL[row.recommended_action]
                  return (
                    <>
                      <tr
                        key={row.id}
                        className={`hover:bg-muted/20 cursor-pointer ${isExpanded ? "bg-muted/10" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {row.score_radar_boost > 0 && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>Boost del Radar Editorial (+{row.score_radar_boost}pts)</TooltipContent>
                              </Tooltip>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium truncate max-w-[220px]">{product?.title ?? "—"}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                                {product?.author && `${product.author} · `}
                                {product?.isbn ?? product?.ean ?? product?.sku ?? ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  row.publish_priority_score >= 80 ? "bg-red-500" :
                                  row.publish_priority_score >= 60 ? "bg-orange-500" :
                                  row.publish_priority_score >= 35 ? "bg-amber-500" : "bg-muted-foreground/40"
                                }`}
                                style={{ width: `${row.publish_priority_score}%` }}
                              />
                            </div>
                            <span className="font-bold tabular-nums text-sm w-8 text-right">
                              {Number(row.publish_priority_score).toFixed(0)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${LEVEL_COLOR[row.priority_level]}`}>
                            {row.priority_level}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-xs tabular-nums ${row.stock_total === 0 ? "text-red-400" : row.stock_total < 5 ? "text-amber-400" : ""}`}>
                          {row.stock_total}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {row.active_listings_count}
                          {row.has_inactive_listing && (
                            <span className="ml-1 text-[10px] text-amber-400">(+inact.)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${action?.color ?? "text-muted-foreground"}`}>
                            {action?.label ?? row.recommended_action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                          {row.reason_summary ?? "—"}
                        </td>
                      </tr>

                      {/* Expanded score breakdown */}
                      {isExpanded && (
                        <tr key={`${row.id}-expanded`} className="bg-muted/10 border-b border-border">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {/* Score breakdown */}
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Desglose del score</p>
                                <ScoreBar label="Demanda"       value={row.score_demand}       max={30} color="bg-blue-500" />
                                <ScoreBar label="Competencia"   value={row.score_competition}  max={20} color="bg-purple-500" />
                                <ScoreBar label="Stock"         value={row.score_stock}        max={25} color="bg-emerald-500" />
                                <ScoreBar label="Rentabilidad"  value={row.score_profitability} max={15} color="bg-amber-500" />
                                {row.score_radar_boost > 0 && (
                                  <ScoreBar label="Radar boost"  value={row.score_radar_boost}  max={10} color="bg-rose-500" />
                                )}
                                <div className="pt-1 border-t border-border flex justify-between text-xs">
                                  <span className="text-muted-foreground">Total</span>
                                  <span className="font-bold">{Number(row.publish_priority_score).toFixed(0)} / 100</span>
                                </div>
                              </div>

                              {/* Product info */}
                              {product && (
                                <div className="space-y-1.5 text-xs">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Producto</p>
                                  {product.isbn  && <div><span className="text-muted-foreground">ISBN: </span>{product.isbn}</div>}
                                  {product.ean   && <div><span className="text-muted-foreground">EAN: </span>{product.ean}</div>}
                                  {product.category && <div><span className="text-muted-foreground">Categoría: </span>{product.category}</div>}
                                  {product.cost_price != null && product.price != null && (
                                    <div>
                                      <span className="text-muted-foreground">Margen: </span>
                                      <span className={`font-semibold ${
                                        (product.price - product.cost_price) / product.price >= 0.3
                                          ? "text-emerald-400" : "text-amber-400"
                                      }`}>
                                        {(((product.price - product.cost_price) / product.price) * 100).toFixed(1)}%
                                      </span>
                                      <span className="text-muted-foreground ml-1">
                                        (${product.cost_price.toLocaleString("es-AR")} → ${product.price.toLocaleString("es-AR")})
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Action guidance */}
                              <div className="space-y-2 text-xs">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Guía</p>
                                <div className={`rounded-md border p-3 ${LEVEL_COLOR[row.priority_level]}`}>
                                  <p className="font-semibold mb-1">{action?.label}</p>
                                  <p className="text-muted-foreground">{row.reason_summary ?? "Sin información adicional."}</p>
                                </div>
                                {row.has_inactive_listing && (
                                  <div className="flex items-center gap-2 text-amber-400">
                                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>Tiene publicaciones pausadas/cerradas que pueden reactivarse.</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-right">
          Mostrando {sorted.length.toLocaleString("es-AR")} de {total.toLocaleString("es-AR")} productos
        </p>
      </div>
    </TooltipProvider>
  )
}
