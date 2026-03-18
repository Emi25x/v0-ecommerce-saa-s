"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Badge }  from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ChevronLeft, ChevronRight, Copy, ExternalLink,
  Loader2, Pause, RefreshCw, Search, Zap,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "con_stock" | "sin_stock" | "eligible_catalog"

interface Account {
  id:          string
  nickname:    string
  ml_user_id?: string
}

interface Publication {
  id:                       string
  ml_item_id:               string
  title:                    string
  status:                   string
  price:                    number | null
  current_stock:            number | null
  sku:                      string | null
  ean:                      string | null
  isbn:                     string | null
  catalog_listing_eligible: boolean | null
  catalog_listing:          boolean | null
  product_id:               string | null
  permalink:                string | null
}

// ── Tab config ───────────────────────────────────────────────────────────────

const TABS: {
  value:    Tab
  label:    string
  bg:       string
  color:    string
  badgeCls: string
  params:   Record<string, string>
}[] = [
  {
    value:    "con_stock",
    label:    "Con stock",
    bg:       "bg-emerald-500/10",
    color:    "text-emerald-400",
    badgeCls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    params:   { con_stock: "1" },
  },
  {
    value:    "sin_stock",
    label:    "Sin stock",
    bg:       "bg-rose-500/10",
    color:    "text-rose-400",
    badgeCls: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    params:   { sin_stock: "1" },
  },
  {
    value:    "eligible_catalog",
    label:    "Elegibles catálogo",
    bg:       "bg-violet-500/10",
    color:    "text-violet-400",
    badgeCls: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    params:   { solo_elegibles: "1", status: "active" },
  },
]

const PAGE_SIZE = 50

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(params: Record<string, string>) {
  const sp = new URLSearchParams(params)
  return `/api/ml/publications?${sp}`
}

function statusColor(s: string) {
  if (s === "active")  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
  if (s === "paused")  return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
  if (s === "closed")  return "bg-rose-500/10 text-rose-400 border-rose-500/20"
  return "bg-muted text-muted-foreground border-border"
}

// ── Row component ─────────────────────────────────────────────────────────────

function PublicationRow({
  row,
  tab,
  onOptin,
  onPause,
  enqueueing,
}: {
  row:        Publication
  tab:        Tab
  onOptin:    (id: string) => void
  onPause:    (id: string) => void
  enqueueing: string | null
}) {
  const { toast } = useToast()
  const isBusy = enqueueing === row.ml_item_id

  // Opt-in: only enabled when catalog_listing_eligible === true
  const canOptin = row.catalog_listing_eligible === true

  function copyLink() {
    if (row.permalink) {
      navigator.clipboard.writeText(row.permalink)
      toast({ description: "Link copiado" })
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
      {/* Status badge */}
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${statusColor(row.status)}`}>
        {row.status}
      </Badge>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{row.title}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{row.ml_item_id}</span>
          {row.sku  && <span>SKU: {row.sku}</span>}
          {(row.ean || row.isbn) && <span>EAN: {row.ean ?? row.isbn}</span>}
        </div>
      </div>

      {/* Stock */}
      <div className="text-right w-16 shrink-0">
        <p className="text-sm font-mono font-medium">
          {row.current_stock ?? 0}
        </p>
        <p className="text-[10px] text-muted-foreground">stock</p>
      </div>

      {/* Price */}
      {row.price != null && (
        <div className="text-right w-20 shrink-0">
          <p className="text-sm font-mono">
            ${row.price.toLocaleString("es-AR")}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Copy link */}
        {row.permalink && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLink}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Copiar link</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Open in ML */}
        {row.permalink && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={row.permalink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Ver en ML</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Tab-specific action */}
        {tab === "sin_stock" && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isBusy}
                  onClick={() => onPause(row.ml_item_id)}
                >
                  {isBusy
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Pause className="h-3 w-3" />}
                  <span className="ml-1">Pausar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Encolar job pause_item</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {tab === "eligible_catalog" && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* wrapper div needed so Tooltip works on disabled button */}
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={!canOptin || isBusy}
                    onClick={() => canOptin && onOptin(row.ml_item_id)}
                  >
                    {isBusy
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Zap className="h-3 w-3" />}
                    <span className="ml-1">Opt-in</span>
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {canOptin
                  ? "Encolar job catalog_optin"
                  : "catalog_listing_eligible = false — esta publicación no puede hacer opt-in"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicationsAlertsPage() {
  const { toast } = useToast()

  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string>("")
  const [activeTab, setActiveTab] = useState<Tab>("con_stock")

  // Tab counts (from parallel HEAD queries)
  const [tabCounts,     setTabCounts]     = useState<Record<Tab, number | null>>({
    con_stock: null, sin_stock: null, eligible_catalog: null,
  })
  const [countsLoading, setCountsLoading] = useState(false)

  // Table state
  const [rows,    setRows]    = useState<Publication[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(false)

  // Search
  const [search,    setSearch]    = useState("")
  const searchRef   = useRef(search)
  searchRef.current = search

  // Actions
  const [enqueueing, setEnqueueing] = useState<string | null>(null)

  // ── Load accounts ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/ml/accounts")
      .then(r => r.json())
      .then(d => {
        const list: Account[] = d.accounts ?? []
        setAccounts(list)
        if (list.length === 1) setAccountId(list[0].id)
      })
      .catch(() => {})
  }, [])

  // ── Load tab counts ────────────────────────────────────────────────────────
  const loadCounts = useCallback(async (accId: string) => {
    if (!accId) return
    setCountsLoading(true)
    try {
      const make = (extra: Record<string, string>) =>
        fetch(`/api/ml/publications?counts_only=1&account_id=${accId}&${new URLSearchParams(extra)}`)
          .then(r => r.json())

      const [conD, sinD, eligD] = await Promise.all([
        make({ con_stock: "1" }),
        make({ sin_stock: "1" }),
        make({ solo_elegibles: "1", status: "active" }),
      ])

      setTabCounts({
        con_stock:        conD.ok  ? (conD.counts?.total  ?? null) : null,
        sin_stock:        sinD.ok  ? (sinD.counts?.total  ?? null) : null,
        eligible_catalog: eligD.ok ? (eligD.counts?.total ?? null) : null,
      })
    } catch { /* silent */ } finally {
      setCountsLoading(false)
    }
  }, [])

  // ── Load rows ──────────────────────────────────────────────────────────────
  const load = useCallback(async (p = 0) => {
    if (!accountId) return
    setLoading(true)
    try {
      const tab    = TABS.find(t => t.value === activeTab)!
      const params: Record<string, string> = {
        account_id: accountId,
        page:       String(p),
        limit:      String(PAGE_SIZE),
        ...tab.params,
      }
      const q = searchRef.current.trim()
      if (q) params.q = q

      const res  = await fetch(buildUrl(params))
      const data = await res.json()
      if (data.ok) {
        setRows(data.rows ?? [])
        setTotal(data.total ?? 0)
        setPage(p)
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [accountId, activeTab])

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (accountId) {
      setPage(0)
      load(0)
      loadCounts(accountId)
    }
  }, [accountId, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  useEffect(() => {
    if (!accountId) return
    const t = setTimeout(() => { setPage(0); load(0) }, 400)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab change ─────────────────────────────────────────────────────────────
  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    setRows([])
    setPage(0)
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleOptin(mlItemId: string) {
    setEnqueueing(mlItemId)
    try {
      const res  = await fetch("/api/ml/jobs/enqueue", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ job_type: "catalog_optin", ml_item_id: mlItemId, account_id: accountId }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ description: "Job opt-in encolado" })
      } else {
        toast({ variant: "destructive", description: data.error ?? "Error al encolar opt-in" })
      }
    } catch {
      toast({ variant: "destructive", description: "Error de red" })
    } finally {
      setEnqueueing(null)
    }
  }

  async function handlePause(mlItemId: string) {
    setEnqueueing(mlItemId)
    try {
      const res  = await fetch("/api/ml/jobs/enqueue", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ job_type: "pause_item", ml_item_id: mlItemId, account_id: accountId }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ description: "Job pausa encolado" })
      } else {
        toast({ variant: "destructive", description: data.error ?? "Error al encolar pausa" })
      }
    } catch {
      toast({ variant: "destructive", description: "Error de red" })
    } finally {
      setEnqueueing(null)
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-screen-xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alertas de publicaciones</h1>
          <p className="text-sm text-muted-foreground">
            Publicaciones agrupadas por stock y elegibilidad de catálogo
          </p>
        </div>

        {/* Account selector */}
        {accounts.length > 1 && (
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue placeholder="Seleccionar cuenta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(tab => {
            const count = tabCounts[tab.value]
            return (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  activeTab === tab.value
                    ? `${tab.bg} ${tab.color} border-current`
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {tab.label}
                {count != null
                  ? (
                    <span className={`text-[11px] font-mono px-1.5 py-0 rounded-full border ${
                      activeTab === tab.value
                        ? tab.badgeCls
                        : "bg-muted/40 text-muted-foreground border-border"
                    }`}>
                      {count.toLocaleString("es-AR")}
                    </span>
                  )
                  : countsLoading && (
                    <span className="h-3.5 w-5 rounded-full bg-muted animate-pulse inline-block" />
                  )
                }
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm bg-transparent"
            placeholder="Buscar título o ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          className="h-9 bg-transparent"
          disabled={loading || !accountId}
          onClick={() => { setPage(0); load(0); loadCounts(accountId) }}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading || countsLoading ? "animate-spin" : ""}`} />
          Refrescar
        </Button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          <span className="w-16 shrink-0">Estado</span>
          <span className="flex-1">Publicación</span>
          <span className="w-16 text-right shrink-0">Stock</span>
          <span className="w-20 text-right shrink-0">Precio</span>
          <span className="w-32 shrink-0">&nbsp;</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : !accountId ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Seleccioná una cuenta para ver publicaciones
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No hay publicaciones en esta categoría
          </div>
        ) : (
          rows.map(row => (
            <PublicationRow
              key={row.id}
              row={row}
              tab={activeTab}
              onOptin={handleOptin}
              onPause={handlePause}
              enqueueing={enqueueing}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de{" "}
            {total.toLocaleString("es-AR")}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline" size="icon"
              className="h-8 w-8 bg-transparent"
              disabled={page === 0 || loading}
              onClick={() => load(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon"
              className="h-8 w-8 bg-transparent"
              disabled={page >= totalPages - 1 || loading}
              onClick={() => load(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
