"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RefreshCw, Loader2, AlertTriangle, TrendingUp, TrendingDown, Star, ExternalLink, CheckCircle2 } from "lucide-react"

type Action = {
  type: "zona_33k" | "overpriced" | "underpriced" | "opportunity"
  priority: "critical" | "warning" | "good" | "info"
  ean: string
  title: string
  my_price?: number
  market_price?: number
  score?: number
  detail: string
  ml_item_id?: string | null
  opp_id?: string
}

type Summary = {
  zona_33k: number
  overpriced: number
  underpriced: number
  opportunities: number
  total: number
  has_snapshot_today: number
}

const TYPE_CONFIG = {
  zona_33k: {
    label: "Zona 33k",
    icon: AlertTriangle,
    rowClass: "border-l-2 border-red-500 bg-red-500/5",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  overpriced: {
    label: "Overpriced",
    icon: TrendingDown,
    rowClass: "border-l-2 border-amber-500 bg-amber-500/5",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  underpriced: {
    label: "Puede subir",
    icon: TrendingUp,
    rowClass: "border-l-2 border-emerald-500 bg-emerald-500/5",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  opportunity: {
    label: "Oportunidad",
    icon: Star,
    rowClass: "border-l-2 border-blue-500 bg-blue-500/5",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
}

function fmt(n: number | undefined | null) {
  if (n === null || n === undefined) return "—"
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
}

export default function DailyActionsPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshLog, setRefreshLog] = useState<string[]>([])
  const [today, setToday] = useState("")
  const [filterType, setFilterType] = useState("all")

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then((r) => r.json())
      .then((d) => {
        const accs = d.accounts || []
        setAccounts(accs)
        if (accs.length > 0) setSelectedAccountId(accs[0].id)
      })
  }, [])

  const loadActions = useCallback(async () => {
    if (!selectedAccountId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ml/intel/daily-actions?account_id=${selectedAccountId}`)
      const data = await res.json()
      const safeActions = data.actions ?? []
      const safeSummary = data.summary ?? null
      setActions(safeActions)
      setSummary(safeSummary)
      setToday(data.today ?? "")
      const oppCount = safeSummary?.opportunities ?? 0
      if (oppCount === 0) {
        console.log("[daily-actions] No se detectaron oportunidades")
      }
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    if (selectedAccountId) loadActions()
  }, [selectedAccountId, loadActions])

  async function handleRefreshData() {
    if (!selectedAccountId || refreshing) return
    setRefreshing(true)
    setRefreshLog([])

    const log = (msg: string) => setRefreshLog((prev) => [...prev, `${new Date().toLocaleTimeString("es-AR")} — ${msg}`])

    try {
      log("Iniciando scan de mercado...")
      const scanRes = await fetch(`/api/ml/intel/scan?account_id=${selectedAccountId}`)
      const scanData = await scanRes.json()
      if (scanData.ok) {
        log(`Scan completado: ${scanData.scanned} EANs escaneados, ${scanData.cached} en cache (${scanData.elapsed_seconds}s)`)
      } else {
        log(`Error en scan: ${scanData.error || "desconocido"}`)
      }

      // Log diagnóstico de EANs
      if (scanData.diag) {
        const { total_products, products_with_ean, invalid_ean_count } = scanData.diag
        log(`Diagnostico EANs — total_products: ${total_products ?? "?"} | products_with_ean: ${products_with_ean ?? "?"} | invalid_ean_count: ${invalid_ean_count ?? "?"}`)
        if ((invalid_ean_count ?? 0) > 0) {
          log(`ADVERTENCIA: ${invalid_ean_count} publicaciones tienen EAN con longitud != 13 — pueden no encontrarse en ML`)
        }
        if ((products_with_ean ?? 0) === 0) {
          log(`ADVERTENCIA: Ninguna publicacion tiene EAN — el scanner no puede buscar precios de mercado`)
        }
      }

      log("Buscando nuevas oportunidades...")
      const oppRes = await fetch(`/api/ml/intel/opportunities?account_id=${selectedAccountId}`)
      const oppData = await oppRes.json()
      if (oppData.ok) {
        log(`Oportunidades: ${oppData.opportunities_upserted} guardadas de ${oppData.items_found} items (${oppData.elapsed_seconds}s)`)
      } else {
        log(`Error en oportunidades: ${oppData.error || "desconocido"}`)
      }

      log("Recargando acciones del dia...")
      await loadActions()
      log("Listo.")
    } catch (err: any) {
      log(`Error: ${err.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = filterType === "all" ? actions : actions.filter((a) => a.type === filterType)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Centro Diario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Acciones priorizadas para hoy{today ? ` — ${today}` : ""}
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
          <Button size="sm" onClick={handleRefreshData} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refrescar datos
          </Button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { key: "zona_33k", label: "Zona 33k", count: summary.zona_33k, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { key: "overpriced", label: "Overpriced", count: summary.overpriced, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { key: "underpriced", label: "Pueden subir", count: summary.underpriced, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { key: "opportunity", label: "Oportunidades", count: summary.opportunities, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { key: "snapshot", label: "Con snapshot", count: summary.has_snapshot_today, color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20" },
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => c.key !== "snapshot" && setFilterType(filterType === c.key ? "all" : c.key)}
              disabled={c.key === "snapshot"}
              className={`rounded-lg border p-4 text-left transition-colors ${filterType === c.key ? `${c.bg} border-current` : "border-border bg-card hover:bg-accent/50"} ${c.key === "snapshot" ? "cursor-default opacity-70" : ""}`}
            >
              <div className={`text-2xl font-bold ${c.color}`}>{c.count}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Refresh log */}
      {refreshLog.length > 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800 p-4">
          <div className="text-xs font-mono space-y-1">
            {refreshLog.map((line, i) => (
              <div key={i} className={`${line.includes("Error") ? "text-red-400" : line.includes("Listo") ? "text-emerald-400" : "text-zinc-400"}`}>
                {line}
              </div>
            ))}
            {refreshing && <div className="text-zinc-500 animate-pulse">...</div>}
          </div>
        </Card>
      )}

      {/* Actions list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 opacity-20" />
          <p className="text-sm">
            {(actions?.length ?? 0) === 0
              ? "No hay acciones — hace clic en \"Refrescar datos\" para escanear el mercado"
              : "No hay acciones de este tipo"}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
            <span>{filtered.length} acciones</span>
            {filterType !== "all" && (
              <button onClick={() => setFilterType("all")} className="text-primary hover:underline text-xs">
                Mostrar todas
              </button>
            )}
          </div>
          {filtered.map((action, i) => {
            const cfg = TYPE_CONFIG[action.type]
            const Icon = cfg.icon
            return (
              <div key={`${action.ean}-${i}`} className={`flex items-center gap-4 rounded-lg px-4 py-3 ${cfg.rowClass}`}>
                <Icon className={`h-4 w-4 shrink-0 ${
                  action.type === "zona_33k" ? "text-red-400" :
                  action.type === "overpriced" ? "text-amber-400" :
                  action.type === "underpriced" ? "text-emerald-400" :
                  "text-blue-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-xs shrink-0 ${cfg.badgeClass}`}>{cfg.label}</Badge>
                    <span className="text-sm font-medium text-foreground truncate">
                      {action.title || action.ean}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{action.ean}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.detail}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  {action.my_price && (
                    <div>
                      <div className="text-xs text-muted-foreground">Tu precio</div>
                      <div className="text-sm font-mono font-medium text-foreground">{fmt(action.my_price)}</div>
                    </div>
                  )}
                  {action.market_price && (
                    <div>
                      <div className="text-xs text-muted-foreground">Mediana</div>
                      <div className="text-sm font-mono text-muted-foreground">{fmt(action.market_price)}</div>
                    </div>
                  )}
                  {action.score !== undefined && (
                    <div>
                      <div className="text-xs text-muted-foreground">Score</div>
                      <div className="text-sm font-mono font-bold text-blue-400">{Math.round(action.score)}</div>
                    </div>
                  )}
                  {action.ml_item_id && (
                    <a
                      href={`https://www.mercadolibre.com.ar/p/${action.ml_item_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground p-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
