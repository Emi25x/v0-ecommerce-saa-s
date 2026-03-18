"use client"

import { useEffect, useState, useCallback } from "react"
import { RefreshCw, ExternalLink, Loader2, Newspaper, Zap } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"

interface NewsItem {
  id: string
  title: string
  source: string
  url: string | null
  published_at: string | null
  detected_book: string | null
  detected_author: string | null
  project_type: "series" | "film" | "unknown"
  project_status: string | null
  confidence_score: number
  opportunity_id: string | null
  created_at: string
}

const SOURCE_COLOR: Record<string, string> = {
  "Variety":            "bg-rose-500/15 text-rose-400 border-rose-500/20",
  "Deadline":           "bg-orange-500/15 text-orange-400 border-orange-500/20",
  "Hollywood Reporter": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  "ScreenRant":         "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "Collider":           "bg-purple-500/15 text-purple-400 border-purple-500/20",
}

const PROJECT_TYPE_LABEL: Record<string, string> = {
  series:  "Serie",
  film:    "Película",
  unknown: "Desconocido",
}

const PROJECT_TYPE_COLOR: Record<string, string> = {
  series:  "bg-sky-500/15 text-sky-400",
  film:    "bg-violet-500/15 text-violet-400",
  unknown: "bg-muted text-muted-foreground",
}

const STATUS_COLOR: Record<string, string> = {
  announced:      "bg-blue-500/15 text-blue-400",
  in_development: "bg-amber-500/15 text-amber-400",
  in_production:  "bg-emerald-500/15 text-emerald-400",
}

const STATUS_LABEL: Record<string, string> = {
  announced:      "Anunciado",
  in_development: "En desarrollo",
  in_production:  "En producción",
}

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-400"
  if (score >= 50) return "text-amber-400"
  return "text-muted-foreground"
}

function relDate(iso: string | null) {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)   return "hace menos de 1h"
  if (h < 24)  return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30)  return `hace ${d}d`
  return new Date(iso).toLocaleDateString("es-AR")
}

export default function AdaptacionesTempranas() {
  const [rows, setRows]           = useState<NewsItem[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [fetching, setFetching]   = useState(false)
  const [fetchResult, setFetchResult] = useState<{ total_new: number; total_adaptations: number } | null>(null)
  const [sourceFilter, setSourceFilter] = useState("")
  const [typeFilter, setTypeFilter]     = useState("")
  const [selected, setSelected]   = useState<NewsItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ only_adaptations: "true", limit: "100" })
      if (sourceFilter) params.set("source", sourceFilter)
      if (typeFilter)   params.set("project_type", typeFilter)
      const res  = await fetch(`/api/radar/news?${params}`)
      const data = await res.json()
      if (data.ok) { setRows(data.rows); setTotal(data.total) }
    } finally { setLoading(false) }
  }, [sourceFilter, typeFilter])

  useEffect(() => { load() }, [load])

  const handleFetch = async () => {
    setFetching(true)
    setFetchResult(null)
    try {
      const res  = await fetch("/api/radar/news/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: true }),
      })
      const data = await res.json()
      if (data.ok) {
        setFetchResult({ total_new: data.total_new, total_adaptations: data.total_adaptations })
        load()
      }
    } finally { setFetching(false) }
  }

  // All unique sources in current results
  const sources = Array.from(new Set(rows.map(r => r.source))).sort()

  const bySource = sources.reduce<Record<string, number>>((acc, s) => {
    acc[s] = rows.filter(r => r.source === s).length
    return acc
  }, {})

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Adaptaciones tempranas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Anuncios de adaptaciones detectados en noticias de la industria audiovisual
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={handleFetch} disabled={fetching}>
            {fetching
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Obteniendo feeds…</>
              : <><Newspaper className="h-4 w-4 mr-2" />Actualizar feeds RSS</>
            }
          </Button>
        </div>
      </div>

      {/* Fetch result banner */}
      {fetchResult && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-3 text-sm">
          <Zap className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            <span className="font-semibold text-emerald-400">{fetchResult.total_new}</span> artículos nuevos guardados ·{" "}
            <span className="font-semibold text-emerald-400">{fetchResult.total_adaptations}</span> adaptaciones detectadas
          </span>
          <button onClick={() => setFetchResult(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">
            Cerrar
          </button>
        </div>
      )}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <div className="rounded-full border border-border bg-muted/10 px-3 py-1 text-xs font-medium text-muted-foreground">
          {total} adaptaciones detectadas
        </div>
        {Object.entries(bySource).map(([src, count]) => (
          <button
            key={src}
            onClick={() => setSourceFilter(s => s === src ? "" : src)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              sourceFilter === src
                ? (SOURCE_COLOR[src] ?? "bg-muted text-foreground border-border") + " ring-1 ring-current"
                : (SOURCE_COLOR[src] ?? "bg-muted/10 text-muted-foreground border-border")
            }`}
          >
            {src} ({count})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={typeFilter || "all"} onValueChange={v => setTypeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Tipo proyecto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="series">Serie</SelectItem>
            <SelectItem value="film">Película</SelectItem>
            <SelectItem value="unknown">Desconocido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center space-y-3">
          <Newspaper className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">
            Sin adaptaciones detectadas aún.
          </p>
          <p className="text-xs text-muted-foreground">
            Presioná "Actualizar feeds RSS" para obtener los últimos anuncios de Variety, Deadline y más.
          </p>
          <Button size="sm" onClick={handleFetch} disabled={fetching}>
            {fetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Newspaper className="h-4 w-4 mr-2" />}
            Obtener ahora
          </Button>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Proyecto / Libro</th>
                <th className="px-4 py-3 text-left">Autor</th>
                <th className="px-4 py-3 text-left">Fuente</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Anuncio</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-left">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => (
                <tr
                  key={row.id}
                  className="hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-4 py-3 max-w-[240px]">
                    {row.detected_book ? (
                      <>
                        <p className="font-medium truncate">{row.detected_book}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.title}</p>
                      </>
                    ) : (
                      <p className="text-muted-foreground truncate text-xs">{row.title}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.detected_author ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SOURCE_COLOR[row.source] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {row.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PROJECT_TYPE_COLOR[row.project_type]}`}>
                      {PROJECT_TYPE_LABEL[row.project_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.project_status ? (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[row.project_status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABEL[row.project_status] ?? row.project_status}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {relDate(row.published_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold font-mono text-sm tabular-nums ${scoreColor(row.confidence_score)}`}>
                      {Number(row.confidence_score).toFixed(0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" onClick={e => e.stopPropagation()}>
                    {row.opportunity_id ? (
                      <a
                        href={`/radar/oportunidades`}
                        className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                      >
                        Ver oport. →
                      </a>
                    ) : (
                      <span className="text-muted-foreground">12-24 meses</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="leading-snug">
                {selected.detected_book ?? selected.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SOURCE_COLOR[selected.source] ?? "bg-muted border-border"}`}>
                  {selected.source}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PROJECT_TYPE_COLOR[selected.project_type]}`}>
                  {PROJECT_TYPE_LABEL[selected.project_type]}
                </span>
                {selected.project_status && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.project_status] ?? "bg-muted"}`}>
                    {STATUS_LABEL[selected.project_status] ?? selected.project_status}
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted ${scoreColor(selected.confidence_score)}`}>
                  Score {Number(selected.confidence_score).toFixed(0)}
                </span>
              </div>

              {selected.detected_book && (
                <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
                  <div><span className="text-muted-foreground">Libro detectado: </span><span className="font-medium">{selected.detected_book}</span></div>
                  {selected.detected_author && <div><span className="text-muted-foreground">Autor: </span><span className="font-medium">{selected.detected_author}</span></div>}
                </div>
              )}

              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Titular original</p>
                <p className="text-sm">{selected.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Publicado: </span>{relDate(selected.published_at)}</div>
                <div><span className="text-muted-foreground">Detectado: </span>{relDate(selected.created_at)}</div>
                <div><span className="text-muted-foreground">Tiempo est. estreno: </span>12-24 meses</div>
                {selected.opportunity_id && (
                  <div><span className="text-muted-foreground">Oportunidad: </span>
                    <a href="/radar/oportunidades" className="text-blue-400 hover:text-blue-300">generada →</a>
                  </div>
                )}
              </div>

              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 font-mono truncate"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  {selected.url}
                </a>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
