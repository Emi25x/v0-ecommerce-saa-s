"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, Loader2, CheckCircle2, XCircle, Eye, Star } from "lucide-react"

type Opportunity = {
  id: string
  ean: string
  title: string
  category_id: string
  min_price: number | null
  median_price: number | null
  sellers_count: number | null
  full_sellers_count: number | null
  sold_qty_proxy: number | null
  opportunity_score: number
  status: "new" | "reviewed" | "ignored" | "published"
  created_at: string
}

const STATUS_CONFIG = {
  new: { label: "Nueva", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  reviewed: { label: "Revisada", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ignored: { label: "Ignorada", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  published: { label: "Publicada", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
}

function fmt(n: number | null) {
  if (n === null || n === undefined) return "—"
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-zinc-500"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground">{Math.round(score)}</span>
    </div>
  )
}

export default function OpportunitiesPage() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [rows, setRows] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("new")
  const [minScore, setMinScore] = useState(0)
  const [updating, setUpdating] = useState<string | null>(null)

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
      const res = await fetch(
        `/api/ml/intel/data?account_id=${selectedAccountId}&type=opportunities&status=${filterStatus}`,
      )
      const data = await res.json()
      setRows(data.rows || [])
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId, filterStatus])

  useEffect(() => {
    if (selectedAccountId) loadData()
  }, [selectedAccountId, loadData])

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      await fetch("/api/ml/intel/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      setRows((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setUpdating(null)
    }
  }

  const filtered = rows.filter((r) => {
    const matchSearch = !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.ean?.includes(search)
    const matchScore = r.opportunity_score >= minScore
    return matchSearch && matchScore
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Oportunidades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">EANs con potencial de venta que no publicaste aun</p>
        </div>
        <div className="flex items-center gap-3">
          {accounts.length > 1 && (
            <select
              value={selectedAccountId || ""}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo o EAN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border border-border overflow-hidden">
          {(["new", "reviewed", "ignored", "published"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Star className="h-3.5 w-3.5" />
          <span>Score min:</span>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            min={0}
            max={100}
            step={10}
            className="w-16 h-8 rounded border border-input bg-background px-2 text-sm text-center text-foreground"
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} oportunidades</span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <CheckCircle2 className="h-8 w-8 opacity-30" />
            <p className="text-sm">No hay oportunidades en este estado — ejecuta el scan desde Centro Diario</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">EAN / Titulo</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Min mkt</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Mediana</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Sellers</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Vendidos</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Score</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-accent/30">
                    <td className="px-4 py-3 max-w-[240px]">
                      <div className="font-medium text-foreground truncate" title={row.title}>
                        {row.title ? (row.title.length > 40 ? row.title.slice(0, 40) + "…" : row.title) : row.ean}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{row.ean}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{fmt(row.min_price)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                      {fmt(row.median_price)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{row.sellers_count ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{row.sold_qty_proxy ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <ScoreBar score={row.opportunity_score} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={`text-xs ${STATUS_CONFIG[row.status]?.className}`}>
                        {STATUS_CONFIG[row.status]?.label || row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {row.status !== "reviewed" && (
                          <button
                            onClick={() => updateStatus(row.id, "reviewed")}
                            disabled={updating === row.id}
                            className="p-1.5 rounded hover:bg-amber-500/15 text-muted-foreground hover:text-amber-400 transition-colors"
                            title="Marcar revisada"
                          >
                            {updating === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        {row.status !== "published" && (
                          <button
                            onClick={() => updateStatus(row.id, "published")}
                            disabled={updating === row.id}
                            className="p-1.5 rounded hover:bg-emerald-500/15 text-muted-foreground hover:text-emerald-400 transition-colors"
                            title="Marcar publicada"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        {row.status !== "ignored" && (
                          <button
                            onClick={() => updateStatus(row.id, "ignored")}
                            disabled={updating === row.id}
                            className="p-1.5 rounded hover:bg-zinc-500/15 text-muted-foreground hover:text-zinc-400 transition-colors"
                            title="Ignorar"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
