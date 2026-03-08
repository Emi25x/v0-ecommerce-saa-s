"use client"

import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Search, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

interface Signal {
  id: string
  source_id: string | null
  isbn: string | null
  title: string | null
  author: string | null
  publisher: string | null
  category: string | null
  signal_type: string
  score: number
  rank_position: number | null
  metadata_json: Record<string, any> | null
  captured_at: string
}

const SIGNAL_COLOR: Record<string, string> = {
  bestseller:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
  trending:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  search_volume: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  review_spike:  "bg-amber-500/15 text-amber-400 border-amber-500/20",
  price_drop:    "bg-rose-500/15 text-rose-400 border-rose-500/20",
}

function relDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)  return "hace menos de 1h"
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

export default function TendenciasPage() {
  const [rows, setRows]     = useState<Signal[]>([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ]           = useState("")
  const [sigType, setSigType] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (q)       params.set("q", q)
      if (sigType) params.set("signal_type", sigType)
      const res  = await fetch(`/api/radar/signals?${params}`)
      const data = await res.json()
      if (data.ok) { setRows(data.rows); setTotal(data.total ?? data.rows.length) }
    } finally { setLoading(false) }
  }, [q, sigType])

  useEffect(() => { load() }, [load])

  // Group by signal_type
  const byType = rows.reduce((acc: Record<string, Signal[]>, s) => {
    const k = s.signal_type || "other"
    ;(acc[k] = acc[k] ?? []).push(s)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tendencias</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Señales capturadas de fuentes externas</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder="Título, autor, ISBN…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setQ("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
        <Select value={sigType || "all"} onValueChange={v => setSigType(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Tipo señal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="bestseller">Bestseller</SelectItem>
            <SelectItem value="trending">Trending</SelectItem>
            <SelectItem value="search_volume">Volumen búsqueda</SelectItem>
            <SelectItem value="review_spike">Spike de reseñas</SelectItem>
            <SelectItem value="price_drop">Bajada de precio</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted-foreground text-sm">Sin señales capturadas. Configurá fuentes en Ajustes.</p>
        </Card>
      ) : sigType ? (
        // Flat list when filtered
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Rank</th>
                <th className="px-4 py-3 text-left">Capturada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(s => (
                <tr key={s.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[200px]">{s.title ?? "Sin título"}</p>
                    {s.author && <p className="text-xs text-muted-foreground">{s.author}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SIGNAL_COLOR[s.signal_type] ?? "bg-muted"}`}>
                      {s.signal_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{Number(s.score).toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                    {s.rank_position != null ? `#${s.rank_position}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{relDate(s.captured_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Grouped by type
        <div className="space-y-6">
          {Object.entries(byType).map(([type, signals]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SIGNAL_COLOR[type] ?? "bg-muted"}`}>
                  {type}
                </span>
                <span className="text-xs text-muted-foreground">{signals.length} señales</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {signals.slice(0, 6).map(s => (
                  <Card key={s.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight line-clamp-2 flex-1">{s.title ?? "Sin título"}</p>
                      <span className="text-lg font-bold tabular-nums shrink-0">{Number(s.score).toFixed(0)}</span>
                    </div>
                    {s.author && <p className="text-xs text-muted-foreground">{s.author}</p>}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{s.isbn ?? s.category ?? "—"}</span>
                      {s.rank_position != null && <span className="font-mono">#{s.rank_position}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{relDate(s.captured_at)}</p>
                  </Card>
                ))}
              </div>
              {signals.length > 6 && (
                <p className="text-xs text-muted-foreground mt-2">+{signals.length - 6} señales más</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
