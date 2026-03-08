"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { RefreshCw, TrendingUp, BookOpen, AlertCircle, Zap, ChevronRight, BarChart3, Newspaper, ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Stats {
  totals: {
    opportunities: number
    signals_7d: number
    open_gaps: number
    adaptations: number
    pending_review: number
    approved: number
  }
  by_type: Record<string, number>
  by_status: Record<string, number>
  top_opportunities: { opportunity_type: string; score: number; confidence: string }[]
  top_gaps: { category: string; gap_score: number }[]
}

const TYPE_LABEL: Record<string, string> = {
  trending:     "Tendencia",
  classic:      "Clásico",
  gap:          "Hueco",
  new_release:  "Novedad",
  adaptation:   "Adaptación",
}

const TYPE_COLOR: Record<string, string> = {
  trending:     "bg-blue-500/15 text-blue-400 border-blue-500/20",
  classic:      "bg-purple-500/15 text-purple-400 border-purple-500/20",
  gap:          "bg-amber-500/15 text-amber-400 border-amber-500/20",
  new_release:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  adaptation:   "bg-rose-500/15 text-rose-400 border-rose-500/20",
}

const STATUS_COLOR: Record<string, string> = {
  new:       "bg-sky-500/15 text-sky-400",
  reviewing: "bg-amber-500/15 text-amber-400",
  approved:  "bg-emerald-500/15 text-emerald-400",
  rejected:  "bg-red-500/15 text-red-400",
  archived:  "bg-muted text-muted-foreground",
}

export default function RadarDashboardPage() {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [newsItems, setNewsItems] = useState<{
    id: string; title: string; source: string; url: string | null;
    detected_book: string | null; detected_author: string | null;
    project_type: string; confidence_score: number; published_at: string | null
  }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, newsRes] = await Promise.all([
        fetch("/api/radar/stats"),
        fetch("/api/radar/news?only_adaptations=true&limit=5"),
      ])
      const statsData = await statsRes.json()
      const newsData  = await newsRes.json()
      if (statsData.ok) setStats(statsData)
      if (newsData.ok)  setNewsItems(newsData.rows ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const statCards = [
    {
      label: "Oportunidades",
      value: stats?.totals.opportunities ?? 0,
      icon: <Zap className="h-5 w-5 text-blue-400" />,
      href: "/radar/oportunidades",
      color: "border-blue-500/20",
    },
    {
      label: "Señales (7d)",
      value: stats?.totals.signals_7d ?? 0,
      icon: <TrendingUp className="h-5 w-5 text-emerald-400" />,
      href: "/radar/tendencias",
      color: "border-emerald-500/20",
    },
    {
      label: "Huecos abiertos",
      value: stats?.totals.open_gaps ?? 0,
      icon: <AlertCircle className="h-5 w-5 text-amber-400" />,
      href: "/radar/huecos",
      color: "border-amber-500/20",
    },
    {
      label: "Adaptaciones",
      value: stats?.totals.adaptations ?? 0,
      icon: <BookOpen className="h-5 w-5 text-purple-400" />,
      href: "/radar/adaptaciones",
      color: "border-purple-500/20",
    },
    {
      label: "En revisión",
      value: stats?.totals.pending_review ?? 0,
      icon: <BarChart3 className="h-5 w-5 text-sky-400" />,
      href: "/radar/oportunidades?status=reviewing",
      color: "border-sky-500/20",
    },
    {
      label: "Aprobadas",
      value: stats?.totals.approved ?? 0,
      icon: <BarChart3 className="h-5 w-5 text-green-400" />,
      href: "/radar/oportunidades?status=approved",
      color: "border-green-500/20",
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Radar Editorial</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Oportunidades detectadas a partir de tendencias, huecos y señales externas
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(c => (
          <Link key={c.label} href={c.href}>
            <Card className={`p-4 hover:bg-muted/20 transition-colors cursor-pointer border ${c.color}`}>
              <div className="flex items-start justify-between">
                {c.icon}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold mt-2 tabular-nums">
                {loading ? <span className="animate-pulse text-muted-foreground">—</span> : c.value.toLocaleString("es-AR")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por tipo */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-4">Por tipo de oportunidad</h2>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />
            ))}</div>
          ) : stats?.by_type && Object.keys(stats.by_type).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(stats.by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const total = stats.totals.opportunities || 1
                  const pct   = Math.round((count / total) * 100)
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLOR[type] ?? "bg-muted text-muted-foreground"}`}>
                        {TYPE_LABEL[type] ?? type}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{count}</span>
                    </div>
                  )
                })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos aún. Importá señales desde Configuración.</p>
          )}
        </Card>

        {/* Por estado */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-4">Por estado</h2>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />
            ))}</div>
          ) : stats?.by_status && Object.keys(stats.by_status).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(stats.by_status)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[status] ?? "bg-muted text-muted-foreground"}`}>
                      {status}
                    </span>
                    <span className="text-sm font-mono font-semibold">{count}</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos aún.</p>
          )}
        </Card>

        {/* Top oportunidades */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Top oportunidades por score</h2>
            <Link href="/radar/oportunidades" className="text-xs text-muted-foreground hover:text-foreground">Ver todas →</Link>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />)}</div>
          ) : stats?.top_opportunities?.length ? (
            <div className="space-y-2">
              {stats.top_opportunities.map((o, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}.</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${TYPE_COLOR[o.opportunity_type] ?? "bg-muted"}`}>
                    {TYPE_LABEL[o.opportunity_type] ?? o.opportunity_type}
                  </span>
                  <span className="text-xs text-muted-foreground flex-1 truncate">{o.confidence ?? "—"}</span>
                  <span className="text-sm font-bold tabular-nums">{Number(o.score).toFixed(1)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin oportunidades todavía.</p>
          )}
        </Card>

        {/* Top huecos */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Huecos más grandes</h2>
            <Link href="/radar/huecos" className="text-xs text-muted-foreground hover:text-foreground">Ver todos →</Link>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />)}</div>
          ) : stats?.top_gaps?.length ? (
            <div className="space-y-2">
              {stats.top_gaps.map((g, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}.</span>
                  <span className="text-sm flex-1 truncate">{g.category}</span>
                  <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, Number(g.gap_score))}%` }} />
                  </div>
                  <span className="text-xs font-mono font-semibold text-amber-400 w-10 text-right">{Number(g.gap_score).toFixed(1)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin huecos detectados.</p>
          )}
        </Card>
      </div>

      {/* Adaptaciones detectadas en noticias */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-rose-400" />
            <h2 className="text-sm font-semibold">Adaptaciones detectadas en noticias</h2>
          </div>
          <Link href="/radar/adaptaciones-tempranas" className="text-xs text-muted-foreground hover:text-foreground">
            Ver todas →
          </Link>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : newsItems.length === 0 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Sin detecciones todavía.</p>
            <Link href="/radar/adaptaciones-tempranas">
              <Button size="sm" variant="outline" className="text-xs">
                <Newspaper className="h-3.5 w-3.5 mr-1.5" />
                Actualizar feeds
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {newsItems.map(item => (
              <div key={item.id} className="flex items-start gap-3 rounded-md border border-border bg-muted/10 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.detected_book ?? item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{item.source}</span>
                    {item.detected_author && (
                      <span className="text-[10px] text-muted-foreground">· {item.detected_author}</span>
                    )}
                    <span className={`text-[10px] font-medium ${
                      item.project_type === "series" ? "text-sky-400" :
                      item.project_type === "film"   ? "text-violet-400" : "text-muted-foreground"
                    }`}>
                      · {item.project_type === "series" ? "Serie" : item.project_type === "film" ? "Película" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold tabular-nums ${
                    item.confidence_score >= 75 ? "text-emerald-400" :
                    item.confidence_score >= 50 ? "text-amber-400" : "text-muted-foreground"
                  }`}>
                    {Number(item.confidence_score).toFixed(0)}
                  </span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      title="Abrir artículo"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        {[
          { label: "Oportunidades",        href: "/radar/oportunidades",          desc: "Revisar y gestionar" },
          { label: "Tendencias",           href: "/radar/tendencias",             desc: "Señales de 7 días" },
          { label: "Huecos de mercado",    href: "/radar/huecos",                 desc: "Demanda sin oferta" },
          { label: "Adapt. tempranas",     href: "/radar/adaptaciones-tempranas", desc: "Noticias de la industria" },
        ].map(l => (
          <Link key={l.href} href={l.href}>
            <Card className="p-4 hover:bg-muted/20 transition-colors cursor-pointer h-full">
              <p className="text-sm font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{l.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
