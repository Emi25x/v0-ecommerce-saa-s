"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  RefreshCw, Search, X, TrendingUp, TrendingDown, Minus,
  Plus, Trash2, ExternalLink, ShoppingBag, BarChart2, Users,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ── Types ─────────────────────────────────────────────────────────────────────

interface VentasItem {
  title:       string
  sku?:        string | null
  ml_item_id?: string
  thumbnail?:  string | null
  price?:      number | null
  permalink?:  string | null
  seller_id?:  string
  seller_name?: string
  current_qty: number
  prev_qty:    number | null
  delta:       number | null
  pct_change:  number | null
  is_new?:     boolean
  has_trend?:  boolean
}

interface Signal {
  id: string
  isbn: string | null
  title: string | null
  author: string | null
  publisher: string | null
  category: string | null
  signal_type: string
  score: number
  rank_position: number | null
  captured_at: string
}

interface MLAccount {
  id:           string
  account_name: string | null
  nickname?:    string | null
}

interface WatchedSeller {
  id:         string
  seller_id:  string
  nickname:   string
  store_name: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_OPTS = [
  { label: "Semanal",    days: 7  },
  { label: "Quincenal",  days: 15 },
  { label: "Mensual",    days: 30 },
]

const SOURCE_OPTS = [
  { key: "propias",    label: "Propias",    icon: ShoppingBag },
  { key: "categoria",  label: "Categoría",  icon: BarChart2   },
  { key: "vendedores", label: "Vendedores", icon: Users       },
]

const SIGNAL_COLOR: Record<string, string> = {
  bestseller:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
  trending:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  search_volume: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  review_spike:  "bg-amber-500/15 text-amber-400 border-amber-500/20",
  price_drop:    "bg-rose-500/15 text-rose-400 border-rose-500/20",
}

function fmtPct(n: number | null) {
  if (n === null) return null
  const sign = n >= 0 ? "+" : ""
  return `${sign}${n}%`
}

function relDate(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1)  return "hace <1h"
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

function DeltaBadge({ delta, pct, isNew }: { delta: number | null; pct: number | null; isNew?: boolean }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">sin historial</span>
  if (isNew) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      NUEVO
    </span>
  )
  if (delta > 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-400">
      <TrendingUp className="h-3.5 w-3.5" />
      +{delta} {pct !== null && <span className="text-[10px] text-emerald-500/80">({fmtPct(pct)})</span>}
    </span>
  )
  if (delta < 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-400">
      <TrendingDown className="h-3.5 w-3.5" />
      {delta} {pct !== null && <span className="text-[10px] text-rose-500/80">({fmtPct(pct)})</span>}
    </span>
  )
  return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />sin cambio</span>
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TendenciasPage() {
  // ── ventas en alza ──────────────────────────────────────────────────────
  const [source,      setSource]      = useState<"propias" | "categoria" | "vendedores">("propias")
  const [days,        setDays]        = useState(7)
  const [accountId,   setAccountId]   = useState<string>("")        // "" = todas
  const [categoryId,  setCategoryId]  = useState("MLA1144")
  const [accounts,    setAccounts]    = useState<MLAccount[]>([])
  const [ventasItems, setVentasItems] = useState<VentasItem[]>([])
  const [ventasTotal, setVentasTotal] = useState(0)
  const [hasHistory,  setHasHistory]  = useState<boolean | null>(null)
  const [noSellers,   setNoSellers]   = useState(false)
  const [loadingV,    setLoadingV]    = useState(false)
  const [errorV,      setErrorV]      = useState<string | null>(null)

  // ── gestión vendedores ───────────────────────────────────────────────────
  const [sellers,       setSellers]       = useState<WatchedSeller[]>([])
  const [showAddSeller, setShowAddSeller] = useState(false)
  const [newSellerId,   setNewSellerId]   = useState("")
  const [newNickname,   setNewNickname]   = useState("")
  const [addingS,       setAddingS]       = useState(false)

  // ── señales externas (sección existente) ────────────────────────────────
  const [signals,   setSignals]   = useState<Signal[]>([])
  const [sigTotal,  setSigTotal]  = useState(0)
  const [loadingSig, setLoadingSig] = useState(true)
  const [q,         setQ]         = useState("")
  const [sigType,   setSigType]   = useState("")

  // ── carga cuentas ML ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/ml/accounts")
      .then(r => r.json())
      .then(d => setAccounts(d.accounts ?? []))
      .catch(() => {})
  }, [])

  // ── carga señales ─────────────────────────────────────────────────────────
  const loadSignals = useCallback(async () => {
    setLoadingSig(true)
    try {
      const p = new URLSearchParams({ limit: "100" })
      if (q)       p.set("q", q)
      if (sigType) p.set("signal_type", sigType)
      const d = await fetch(`/api/radar/signals?${p}`).then(r => r.json())
      if (d.ok) { setSignals(d.rows); setSigTotal(d.total ?? d.rows.length) }
    } finally { setLoadingSig(false) }
  }, [q, sigType])

  useEffect(() => { loadSignals() }, [loadSignals])

  // ── carga ventas ──────────────────────────────────────────────────────────
  const loadVentas = useCallback(async () => {
    setLoadingV(true); setErrorV(null); setNoSellers(false)
    try {
      const p = new URLSearchParams({ source, days: String(days), limit: "30" })
      if (source === "propias"   && accountId)  p.set("account_id",  accountId)
      if (source === "categoria" && categoryId) p.set("category_id", categoryId)
      const d = await fetch(`/api/radar/tendencias/ventas?${p}`).then(r => r.json())
      if (!d.ok) { setErrorV(d.error ?? "Error"); return }
      setVentasItems(d.items ?? [])
      setVentasTotal(d.total ?? 0)
      setHasHistory(d.has_history ?? null)
      setNoSellers(d.no_sellers === true)
    } catch (e: any) {
      setErrorV(e.message)
    } finally {
      setLoadingV(false)
    }
  }, [source, days, accountId, categoryId])

  useEffect(() => { loadVentas() }, [loadVentas])

  // ── carga lista de vendedores monitoreados ────────────────────────────────
  const loadSellers = useCallback(async () => {
    const d = await fetch("/api/radar/tendencias/sellers").then(r => r.json()).catch(() => ({}))
    if (d.ok) setSellers(d.sellers ?? [])
  }, [])

  useEffect(() => { loadSellers() }, [loadSellers])

  const addSeller = async () => {
    if (!newSellerId.trim()) return
    setAddingS(true)
    try {
      const d = await fetch("/api/radar/tendencias/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller_id: newSellerId.trim(), nickname: newNickname.trim() }),
      }).then(r => r.json())
      if (d.ok) {
        setNewSellerId(""); setNewNickname(""); setShowAddSeller(false)
        await loadSellers()
        if (source === "vendedores") loadVentas()
      }
    } finally { setAddingS(false) }
  }

  const removeSeller = async (seller_id: string) => {
    await fetch(`/api/radar/tendencias/sellers?seller_id=${seller_id}`, { method: "DELETE" })
    await loadSellers()
    if (source === "vendedores") loadVentas()
  }

  // ── render ventas table ───────────────────────────────────────────────────
  const renderVentasTable = () => {
    if (loadingV) return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-muted/20 animate-pulse" />
        ))}
      </div>
    )

    if (errorV) return (
      <div className="p-6 text-center text-sm text-rose-400">{errorV}</div>
    )

    if (noSellers) return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">No hay vendedores configurados.</p>
        <Button size="sm" variant="outline" onClick={() => setShowAddSeller(true)}>
          <Plus className="h-4 w-4 mr-1" />Agregar vendedor
        </Button>
      </div>
    )

    if (!ventasItems.length) return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Sin datos para el período seleccionado.
      </div>
    )

    const isPropias   = source === "propias"
    const isVendedores = source === "vendedores"

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] text-muted-foreground uppercase tracking-wide border-b border-border">
            <tr>
              {!isPropias && <th className="px-3 py-2 w-8" />}
              <th className="px-3 py-2 text-left">Libro</th>
              {isVendedores && <th className="px-3 py-2 text-left">Vendedor</th>}
              <th className="px-3 py-2 text-right">Ventas actuales</th>
              <th className="px-3 py-2 text-right">Período anterior</th>
              <th className="px-3 py-2 text-right">Variación</th>
              {!isPropias && <th className="px-3 py-2 text-right">Precio</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {ventasItems.map((item, i) => (
              <tr key={i} className="hover:bg-muted/20 transition-colors">
                {!isPropias && (
                  <td className="px-3 py-2">
                    {item.thumbnail
                      ? <img src={item.thumbnail} alt="" className="w-8 h-8 object-cover rounded border border-border/50" />
                      : <div className="w-8 h-8 rounded bg-muted/30" />}
                  </td>
                )}
                <td className="px-3 py-2 max-w-[250px]">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">{item.title}</p>
                      {item.sku && <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>}
                    </div>
                    {item.permalink && (
                      <a href={item.permalink} target="_blank" rel="noreferrer" className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </td>
                {isVendedores && (
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">
                    {item.seller_name}
                  </td>
                )}
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {item.current_qty}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                  {item.prev_qty ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <DeltaBadge delta={item.delta} pct={item.pct_change} isNew={item.is_new} />
                </td>
                {!isPropias && (
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    {item.price != null ? `$${Number(item.price).toLocaleString("es-AR")}` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const byType = signals.reduce((acc: Record<string, Signal[]>, s) => {
    ;(acc[s.signal_type] = acc[s.signal_type] ?? []).push(s)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── VENTAS EN ALZA ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-emerald-400" />
              Tendencias de ventas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Libros con ventas en alza por período y fuente
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadVentas} disabled={loadingV}>
            <RefreshCw className={`h-4 w-4 ${loadingV ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <Card className="overflow-hidden">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/10">
            {/* Period */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {PERIOD_OPTS.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => setDays(opt.days)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === opt.days
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Source */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {SOURCE_OPTS.map(opt => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSource(opt.key as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                      source === opt.key
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* Account filter — propias */}
            {source === "propias" && accounts.length > 1 && (
              <Select value={accountId || "all"} onValueChange={v => setAccountId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-44 border-border">
                  <SelectValue placeholder="Todas las cuentas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las cuentas</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nickname || a.account_name || a.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Category — categoria */}
            {source === "categoria" && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Categoría ML:</span>
                <Input
                  className="h-8 text-xs w-28 font-mono"
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  onBlur={loadVentas}
                  placeholder="MLA1144"
                />
              </div>
            )}

            {/* Manage sellers */}
            {source === "vendedores" && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAddSeller(s => !s)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Gestionar
              </Button>
            )}

            {ventasTotal > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">{ventasTotal} libros</span>
            )}
          </div>

          {/* History notice for ML sources */}
          {(source === "categoria" || source === "vendedores") && hasHistory === false && (
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
              Primer snapshot tomado hoy. El δ estará disponible cuando haya datos del período anterior.
            </div>
          )}

          {/* Sellers manager panel */}
          {source === "vendedores" && showAddSeller && (
            <div className="px-4 py-3 border-b border-border bg-muted/5 space-y-3">
              {sellers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sellers.map(s => (
                    <span key={s.seller_id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/30 border border-border text-xs">
                      {s.nickname}
                      <span className="text-muted-foreground font-mono text-[10px]">#{s.seller_id}</span>
                      <button onClick={() => removeSeller(s.seller_id)} className="text-muted-foreground hover:text-rose-400 ml-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Input
                  className="h-8 text-xs w-36 font-mono"
                  placeholder="Seller ID (ej. 123456)"
                  value={newSellerId}
                  onChange={e => setNewSellerId(e.target.value)}
                />
                <Input
                  className="h-8 text-xs w-40"
                  placeholder="Nombre (opcional)"
                  value={newNickname}
                  onChange={e => setNewNickname(e.target.value)}
                />
                <Button size="sm" className="h-8 text-xs" onClick={addSeller} disabled={addingS || !newSellerId.trim()}>
                  {addingS ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Agregar"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                El Seller ID se obtiene del perfil del vendedor en ML (número en la URL). Si no ingresás nombre, se resuelve automáticamente.
              </p>
            </div>
          )}

          {renderVentasTable()}
        </Card>
      </div>

      {/* ── SEÑALES EXTERNAS ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Señales externas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Capturas de fuentes editoriales</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadSignals} disabled={loadingSig}>
            <RefreshCw className={`h-4 w-4 ${loadingSig ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
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
            <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="Tipo señal" /></SelectTrigger>
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

        {loadingSig ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg bg-muted/20 animate-pulse border border-border" />
            ))}
          </div>
        ) : signals.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-muted-foreground text-sm">Sin señales capturadas. Configurá fuentes en Ajustes.</p>
          </Card>
        ) : sigType ? (
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
                {signals.map(s => (
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
          <div className="space-y-6">
            {Object.entries(byType).map(([type, sigs]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SIGNAL_COLOR[type] ?? "bg-muted"}`}>
                    {type}
                  </span>
                  <span className="text-xs text-muted-foreground">{sigs.length} señales</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sigs.slice(0, 6).map(s => (
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
                {sigs.length > 6 && (
                  <p className="text-xs text-muted-foreground mt-2">+{sigs.length - 6} señales más</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
