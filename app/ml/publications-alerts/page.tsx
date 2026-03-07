"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Badge }  from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Pause,
  RefreshCw,
  Search,
  ShoppingCart,
  WifiOff,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ── Types ───────────────────────────────────────────────────────────────────

type AlertsMode = "con_stock" | "sin_stock" | "eligible_catalog"

interface Publication {
  id:                       string
  ml_item_id:               string
  account_id:               string
  title:                    string
  status:                   string
  price:                    number | null
  current_stock:            number | null
  sku:                      string | null
  ean:                      string | null
  isbn:                     string | null
  gtin:                     string | null
  catalog_listing_eligible: boolean | null
  catalog_listing:          boolean | null
  product_id:               string | null
  permalink:                string | null
  updated_at:               string
}

interface Account {
  id:       string
  nickname: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const TABS: { value: AlertsMode; label: string; description: string; color: string; bg: string; badgeCls: string }[] = [
  {
    value:       "con_stock",
    label:       "Con stock",
    description: "Publicaciones activas con stock disponible (current_stock > 0), ordenadas de mayor a menor stock.",
    color:       "text-blue-400",
    bg:          "bg-blue-500/10 border-blue-500/20",
    badgeCls:    "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  {
    value:       "sin_stock",
    label:       "Sin stock",
    description: "Publicaciones con stock agotado (current_stock = 0). Considerá pausarlas o reponer stock.",
    color:       "text-red-400",
    bg:          "bg-red-500/10 border-red-500/20",
    badgeCls:    "bg-red-500/15 text-red-300 border-red-500/30",
  },
  {
    value:       "eligible_catalog",
    label:       "Elegibles catálogo",
    description: "Activas con catalog_listing_eligible = true. Podés hacer opt-in para competir directamente.",
    color:       "text-emerald-400",
    bg:          "bg-emerald-500/10 border-emerald-500/20",
    badgeCls:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(n)
    : "—"

// ── ListRow sub-component ────────────────────────────────────────────────────

interface ListRowProps {
  row:          Publication
  tab:          (typeof TABS)[number]
  activeTab:    AlertsMode
  selected:     boolean
  onToggle:     (id: string) => void
  enqueueing:   string | null
  onEnqueue:    (pub: Publication) => void
  copiedLink:   string | null
  onCopyLink:   (permalink: string, id: string) => void
}

function ListRow({
  row,
  tab,
  activeTab,
  selected,
  onToggle,
  enqueueing,
  onEnqueue,
  copiedLink,
  onCopyLink,
}: ListRowProps) {
  const isEnqueueing = enqueueing === row.ml_item_id
  const ean          = row.isbn ?? row.ean ?? row.gtin ?? null
  // Pause action: only on sin_stock tab, always enabled
  const isPauseAction = activeTab === "sin_stock"
  // Opt-in: only on eligible_catalog tab AND item must have catalog_listing_eligible = true
  const isEligibleForOptin = row.catalog_listing_eligible === true
  // Show action button on sin_stock (pause) and eligible_catalog (opt-in) tabs
  const showActionBtn = activeTab === "sin_stock" || activeTab === "eligible_catalog"
  // Disabled only when it's an opt-in attempt on a non-eligible item
  const actionDisabled = !isPauseAction && !isEligibleForOptin
  const actionTooltip = isPauseAction
    ? "Encolar job pause_item"
    : isEligibleForOptin
      ? "Encolar job catalog_optin"
      : "Esta publicación no es elegible para catálogo (catalog_listing_eligible = false)"

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        selected ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(row.id)}
        className="accent-primary h-4 w-4 shrink-0 cursor-pointer"
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug line-clamp-2">{row.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{row.ml_item_id}</span>

          {/* SKU */}
          <span>
            SKU:{" "}
            <span className={row.sku ? "text-foreground font-mono" : ""}>
              {row.sku ?? "—"}
            </span>
          </span>

          {/* EAN/ISBN */}
          {ean && (
            <span>
              EAN/ISBN:{" "}
              <span className="text-foreground font-mono">{ean}</span>
            </span>
          )}

          {/* Precio */}
          <span className="font-semibold text-foreground">{fmt(row.price)}</span>

          {/* Stock */}
          <span>
            Stock:{" "}
            <span
              className={
                (row.current_stock ?? 0) <= 0
                  ? "text-red-400 font-semibold"
                  : "text-foreground"
              }
            >
              {row.current_stock ?? 0}
            </span>
          </span>

          {/* Estado badge */}
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              row.status === "active"  ? "bg-green-500/10 text-green-400 border-green-500/20"
              : row.status === "paused" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
              : row.status === "closed" ? "bg-red-500/10 text-red-400 border-red-500/20"
              : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {row.status ?? "—"}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {row.permalink && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={row.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Abrir en ML</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onCopyLink(row.permalink!, row.id)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {copiedLink === row.id
                    ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                    : <Link2 className="h-4 w-4" />
                  }
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {copiedLink === row.id ? "Copiado!" : "Copiar link"}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {showActionBtn && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isEnqueueing || actionDisabled}
                  onClick={() => !actionDisabled && onEnqueue(row)}
                  className={`h-8 gap-1.5 bg-transparent ${actionDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {isEnqueueing
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : isPauseAction
                      ? <Pause className="h-3.5 w-3.5" />
                      : <ShoppingCart className="h-3.5 w-3.5" />
                  }
                  <span className="hidden sm:inline">
                    {isPauseAction ? "Pausar" : "Opt-in"}
                  </span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{actionTooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicationsAlertsPage() {
  const { toast } = useToast()

  // Accounts
  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string>("")

  // Tab / mode
  const [activeTab, setActiveTab] = useState<AlertsMode>("con_stock")

  // Tab counts (exact, from HEAD queries)
  const [tabCounts,       setTabCounts]       = useState<Record<AlertsMode, number | null>>({ con_stock: null, sin_stock: null, eligible_catalog: null })
  const [countsLoading,   setCountsLoading]   = useState(false)

  // Data
  const [rows,        setRows]        = useState<Publication[]>([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [placeholder, setPlaceholder] = useState(false)

  // Filters
  const [search, setSearch] = useState("")
  const searchRef  = useRef(search)
  searchRef.current = search

  // Bulk
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult,  setBulkResult]  = useState<{ enqueued: number; failed: number } | null>(null)

  // Copy link feedback
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  // Per-row enqueueing (single-row opt-in)
  const [enqueueing, setEnqueueing] = useState<string | null>(null)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Load accounts ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/mercadolibre/accounts")
      .then(r => r.json())
      .then(d => {
        if (d.accounts?.length) {
          setAccounts(d.accounts)
          setAccountId(d.accounts[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // ── Load tab counts ───────────────────────────────────────────────────────

  const loadCounts = useCallback(async (accId: string) => {
    if (!accId) return
    setCountsLoading(true)
    try {
      // Three HEAD queries in parallel — one per tab definition
      const [conRes, sinRes, eligRes] = await Promise.all([
        fetch(`/api/ml/publications?counts_only=1&account_id=${accId}&con_stock=1`),
        fetch(`/api/ml/publications?counts_only=1&account_id=${accId}&sin_stock=1`),
        fetch(`/api/ml/publications?counts_only=1&account_id=${accId}&solo_elegibles=1&status=active`),
      ])
      const [conD, sinD, eligD] = await Promise.all([conRes.json(), sinRes.json(), eligRes.json()])
      setTabCounts({
        con_stock:        conD.ok  ? (conD.counts?.total  ?? null) : null,
        sin_stock:        sinD.ok  ? (sinD.counts?.total  ?? null) : null,
        eligible_catalog: eligD.ok ? (eligD.counts?.total ?? null) : null,
      })
    } catch { /* silent */ } finally {
      setCountsLoading(false)
    }
  }, [])

  // ── Load rows ─────────────────────────────────────────────────────────────

  const load = useCallback(async (p = 0) => {
    if (!accountId) return
    setLoading(true)
    setPlaceholder(false)
    try {
      // Map tab to API params
      const tabParams: Record<AlertsMode, Record<string, string>> = {
        con_stock:        { con_stock: "1",      stock_first: "1" },
        sin_stock:        { sin_stock: "1",      stock_first: "1" },
        eligible_catalog: { solo_elegibles: "1", stock_first: "1", status: "active" },
      }

      const params = new URLSearchParams({
        page:       String(p),
        limit:      String(PAGE_SIZE),
        account_id: accountId,
        ...tabParams[activeTab],
        ...(searchRef.current?.trim() ? { q: searchRef.current } : {}),
      })
      const res  = await fetch(`/api/ml/publications?${params}`)
      const data = await res.json()
      if (data.ok) {
        setRows(data.rows ?? [])
        setTotal(data.total ?? 0)
        if (data.placeholder) setPlaceholder(true)
      } else {
        toast({ title: "Error al cargar publicaciones", description: data.error, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [accountId, activeTab, toast])

  useEffect(() => {
    if (accountId) { setPage(0); setSelected(new Set()); load(0); loadCounts(accountId) }
  }, [accountId, activeTab])

  const handleSearch = () => { setPage(0); setSelected(new Set()); load(0) }

  // ── Tab change ────────────────────────────────────────────────────────────

  const handleTabChange = (tab: AlertsMode) => {
    setActiveTab(tab)
    setPage(0)
    setSelected(new Set())
    setBulkResult(null)
    setSearch("")
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  const prevPage = () => { const p = page - 1; setPage(p); setSelected(new Set()); load(p) }
  const nextPage = () => { const p = page + 1; setPage(p); setSelected(new Set()); load(p) }

  // ── Bulk selection ────────────────────────────────────────────────────────

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rows.map(r => r.id)))
    }
  }

  // ── Single row enqueue ────────────────────────────────────────────────────

  const enqueueOne = async (pub: Publication) => {
    const jobType = activeTab === "sin_stock" ? "pause_item" : "catalog_optin"
    setEnqueueing(pub.ml_item_id)
    try {
      const res  = await fetch("/api/ml/jobs/enqueue", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          account_id: pub.account_id,
          type:       jobType,
          payload:    { item_id: pub.ml_item_id, account_id: pub.account_id },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ title: "Job encolado", description: `${pub.ml_item_id} → ${jobType}` })
      } else {
        toast({ title: "Error al encolar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setEnqueueing(null)
    }
  }

  // ── Bulk action (tipo varía por tab) ─────────────────────────────────────

  // sin_stock  → pause_item
  // eligible_catalog / con_stock → catalog_optin
  const bulkJobType = activeTab === "sin_stock" ? "pause_item" : "catalog_optin"

  const handleBulkAction = async () => {
    if (selected.size === 0) return
    setBulkLoading(true)
    setBulkResult(null)

    // For eligible_catalog tab: only process rows that are actually eligible
    const targets = rows.filter(r => {
      if (!selected.has(r.id)) return false
      if (bulkJobType === "catalog_optin") return r.catalog_listing_eligible === true
      return true
    })
    let enqueued  = 0
    let failed    = 0

    for (const pub of targets) {
      try {
        const res  = await fetch("/api/ml/jobs/enqueue", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            account_id: pub.account_id,
            type:       bulkJobType,
            payload:    { item_id: pub.ml_item_id, account_id: pub.account_id },
          }),
        })
        const data = await res.json()
        data.ok ? enqueued++ : failed++
      } catch {
        failed++
      }
    }

    const actionLabel = bulkJobType === "pause_item" ? "pausas" : "opt-ins"
    setBulkResult({ enqueued, failed })
    setBulkLoading(false)
    setSelected(new Set())
    toast({
      title:       `${enqueued} ${actionLabel} encolados`,
      description: failed > 0 ? `${failed} fallaron` : "Todos encolados correctamente",
      variant:     failed > 0 ? "destructive" : "default",
    })
  }

  // ── Copy link ─────────────────────────────────────────────────────────────

  const copyLink = (permalink: string, id: string) => {
    navigator.clipboard.writeText(permalink)
    setCopiedLink(id)
    toast({ title: "Copiado", description: "Link copiado al portapapeles" })
    setTimeout(() => setCopiedLink(null), 2000)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const currentTab = TABS.find(t => t.value === activeTab) ?? TABS[0]
  const allSelected = rows.length > 0 && selected.size === rows.length

  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Alertas de Publicaciones</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Publicaciones que requieren acción en Mercado Libre
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {accounts.length > 1 && (
              <Select value={accountId} onValueChange={v => { setAccountId(v); setPage(0); setSelected(new Set()) }}>
                <SelectTrigger className="w-44 h-9 bg-transparent">
                  <SelectValue placeholder="Cuenta ML" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPage(0); load(0); loadCounts(accountId) }}
              disabled={loading || !accountId}
              className="h-9 bg-transparent"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading || countsLoading ? "animate-spin" : ""}`} />
              Refrescar
            </Button>
          </div>
        </div>

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
                {count != null && (
                  <span className={`text-xs font-mono px-1.5 py-0 rounded-full border ${
                    activeTab === tab.value ? tab.badgeCls : "bg-muted/40 text-muted-foreground border-border"
                  }`}>
                    {count.toLocaleString("es-AR")}
                  </span>
                )}
                {count == null && countsLoading && (
                  <span className="h-3.5 w-6 rounded-full bg-muted animate-pulse" />
                )}
              </button>
            )
          })}
        </div>

        {/* Description banner */}
        <div className={`rounded-lg border px-4 py-3 text-sm flex gap-2 items-start ${currentTab.bg}`}>
          <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${currentTab.color}`} />
          <p className="text-muted-foreground">{currentTab.description}</p>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
          <div className="flex gap-2 flex-1 min-w-52">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Título o Item ID..."
              className="h-9 bg-transparent"
            />
            <Button
              onClick={handleSearch}
              size="sm"
              variant="outline"
              className="h-9 bg-transparent px-3"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>

        </div>

        {/* Bulk actions bar */}
        {rows.length > 0 && !placeholder && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="accent-primary h-4 w-4"
              />
              Seleccionar todos en la página
              {selected.size > 0 && (
                <span className="text-muted-foreground">({selected.size} seleccionados)</span>
              )}
            </label>

            {selected.size > 0 && (
              <Button
                size="sm"
                onClick={handleBulkAction}
                disabled={bulkLoading}
                className="gap-1.5"
              >
                {bulkLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : bulkJobType === "pause_item"
                    ? <Pause className="h-3.5 w-3.5" />
                    : <ShoppingCart className="h-3.5 w-3.5" />
                }
                {bulkJobType === "pause_item"
                  ? `Pausar sin stock (${selected.size})`
                  : `Opt-in catálogo (${selected.size})`
                }
              </Button>
            )}

            {/* Bulk result pill */}
            {bulkResult && (
              <span className="text-xs text-muted-foreground">
                <span className="text-green-400 font-medium">{bulkResult.enqueued}</span> encolados
                {bulkResult.failed > 0 && (
                  <> · <span className="text-red-400 font-medium">{bulkResult.failed}</span> fallidos</>
                )}
              </span>
            )}

            <span className="ml-auto text-sm text-muted-foreground">
              {loading ? "Cargando..." : `${total.toLocaleString("es-AR")} publicaciones`}
            </span>
          </div>
        )}

        {/* Placeholder for about_to_pause */}
        {placeholder && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 py-16 flex flex-col items-center gap-3 text-center">
            <WifiOff className="h-10 w-10 text-amber-400/60" />
            <p className="font-medium text-amber-300">No disponible</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              La detección de publicaciones próximas a pausarse requiere un campo adicional en la base de datos.
              Esta funcionalidad estará disponible próximamente.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !placeholder && rows.length === 0 && (
          <div className="rounded-xl border border-border bg-card py-16 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
            <p className="font-medium">No hay publicaciones en este estado</p>
            <p className="text-sm text-muted-foreground">
              {search ? "Ninguna publicación cumple los filtros activos." : currentTab.description}
            </p>
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[72px] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {/* List */}
        {!loading && !placeholder && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map(row => (
              <ListRow
                key={row.id}
                row={row}
                tab={currentTab}
                activeTab={activeTab}
                selected={selected.has(row.id)}
                onToggle={toggleRow}
                enqueueing={enqueueing}
                onEnqueue={enqueueOne}
                copiedLink={copiedLink}
                onCopyLink={copyLink}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && !loading && !placeholder && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              {(page * PAGE_SIZE + 1).toLocaleString("es-AR")}–
              {Math.min((page + 1) * PAGE_SIZE, total).toLocaleString("es-AR")} de{" "}
              {total.toLocaleString("es-AR")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prevPage}
                disabled={page === 0}
                className="bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm tabular-nums px-1">
                {page + 1} / {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={nextPage}
                disabled={page >= totalPages - 1}
                className="bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

      </div>
    </TooltipProvider>
  )
}
