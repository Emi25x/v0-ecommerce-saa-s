"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ExternalLink,
  Copy,
  Link2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  Package,
  CheckCircle2,
  Info,
  MoreHorizontal,
  ShoppingCart,
  Zap,
  RotateCcw,
  Scale,
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const STATUS_LABEL: Record<string, string> = {
  active:       "Activa",
  paused:       "Pausada",
  closed:       "Cerrada",
  under_review: "Revisión",
  inactive:     "Inactiva",
}

const STATUS_COLOR: Record<string, string> = {
  active:       "bg-green-500/15 text-green-400 border-green-500/30",
  paused:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  closed:       "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  under_review: "bg-red-500/15 text-red-400 border-red-500/30",
  inactive:     "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(n)
    : "—"

const relDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Hoy"
  if (days === 1) return "Ayer"
  if (days < 30) return `Hace ${days}d`
  return d.toLocaleDateString("es-AR")
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Publication {
  id: string
  ml_item_id: string
  account_id: string
  title: string
  status: string
  price: number | null
  current_stock: number | null
  sku: string | null
  ean: string | null
  isbn: string | null
  gtin: string | null
  catalog_listing_eligible: boolean | null
  product_id: string | null
  permalink: string | null
  updated_at: string
}

interface Account {
  id: string
  nickname: string
}

interface Counts {
  total: number
  active: number
  paused: number
  closed: number
  sin_producto: number
  sin_stock: number
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MLPublicationsPage() {
  const { toast } = useToast()

  const [accounts, setAccounts]           = useState<Account[]>([])
  const [accountId, setAccountId]         = useState<string>("all")
  const [statusFilter, setStatusFilter]   = useState<string>("all")
  const [search, setSearch]               = useState<string>("")
  const [sinProducto, setSinProducto]     = useState(false)
  const [soloElegibles, setSoloElegibles] = useState(false)
  const [sinStock, setSinStock]           = useState(false)
  const [importProgress, setImportProgress] = useState<{
    status: string
    publications_offset: number
    publications_total: number | null
  } | null>(null)
  const [page, setPage]                   = useState(0)
  const [rows, setRows]                   = useState<Publication[]>([])
  const [total, setTotal]                 = useState(0)
  const [loading, setLoading]             = useState(false)
  const [copied, setCopied]               = useState<string | null>(null)
  const [copiedLink, setCopiedLink]       = useState<string | null>(null)
  const [detail, setDetail]               = useState<Publication | null>(null)
  const [counts, setCounts]               = useState<Counts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)
  const [enqueueing, setEnqueueing]       = useState<string | null>(null) // tracks "itemId:type"
  const [weightSync, setWeightSync]       = useState<{ loading: boolean; result: { updated: number; missing: number; processed: number } | null }>({ loading: false, result: null })

  const searchRef = useRef(search)
  searchRef.current = search

  // ── Load accounts ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/mercadolibre/accounts")
      .then(r => r.json())
      .then(d => {
        if (d.accounts) setAccounts(d.accounts)
      })
      .catch(() => {})
  }, [])

  // ── Load status counts (badge query) ──────────────────────────────────

  const loadCounts = useCallback(async (accId: string) => {
    setCountsLoading(true)
    try {
      const params = new URLSearchParams({ counts_only: "1" })
      if (accId !== "all") params.set("account_id", accId)
      const res  = await fetch(`/api/ml/publications?${params}`)
      const data = await res.json()
      if (data.ok) setCounts(data.counts)
    } catch { /* silent */ } finally {
      setCountsLoading(false)
    }
  }, [])

  useEffect(() => { loadCounts(accountId) }, [accountId, loadCounts])

  // ── Load import progress from ml_import_progress ──────────────────────

  useEffect(() => {
    if (accountId === "all") { setImportProgress(null); return }
    fetch(`/api/ml/publications/import-progress?account_id=${accountId}`)
      .then(r => r.json())
      .then(d => { if (d.ok && d.progress) setImportProgress(d.progress) })
      .catch(() => {})
  }, [accountId])

  // ── Load rows ──────────────────────────────────────────────────────────

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(PAGE_SIZE),
        ...(accountId !== "all" ? { account_id: accountId } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(searchRef.current ? { q: searchRef.current } : {}),
        ...(sinProducto ? { sin_producto: "1" } : {}),
        ...(soloElegibles ? { solo_elegibles: "1" } : {}),
        ...(sinStock ? { sin_stock: "1" } : {}),
      })
      const res  = await fetch(`/api/ml/publications?${params}`)
      const data = await res.json()
      if (data.ok) {
        setRows(data.rows)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [accountId, statusFilter, sinProducto, soloElegibles, sinStock])

  useEffect(() => { setPage(0); load(0) }, [accountId, statusFilter, sinProducto, soloElegibles, sinStock])

  const handleSearch = () => { setPage(0); load(0) }
  const prevPage = () => { const p = page - 1; setPage(p); load(p) }
  const nextPage = () => { const p = page + 1; setPage(p); load(p) }
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  const copyLink = (permalink: string, id: string) => {
    navigator.clipboard.writeText(permalink)
    setCopiedLink(id)
    setTimeout(() => setCopiedLink(null), 1500)
  }

  const handleRefresh = () => {
    load(page)
    loadCounts(accountId)
  }

  const enqueueJob = async (
    pub: Publication,
    type: "catalog_optin" | "buybox_sync" | "import_single_item",
  ) => {
    const key = `${pub.ml_item_id}:${type}`
    setEnqueueing(key)
    try {
      const res = await fetch("/api/ml/jobs/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: pub.account_id,
          type,
          payload: { item_id: pub.ml_item_id, account_id: pub.account_id },
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ title: "Job agregado a la cola", description: `${pub.ml_item_id} → ${type}` })
        load(page)
      } else {
        toast({ title: "Error al encolar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    } finally {
      setEnqueueing(null)
    }
  }

  const syncWeights = async () => {
    if (accountId === "all") {
      toast({ title: "Seleccioná una cuenta", description: "Elegí una cuenta antes de sincronizar pesos.", variant: "destructive" })
      return
    }
    setWeightSync({ loading: true, result: null })
    try {
      const res  = await fetch("/api/ml/publications/sync-weight", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ account_id: accountId, batch_size: 100 }),
      })
      const data = await res.json()
      if (data.ok) {
        setWeightSync({ loading: false, result: { updated: data.updated, missing: data.missing, processed: data.processed } })
        toast({ title: "Sincronización completada", description: `${data.updated} pesos actualizados, ${data.missing} sin peso en ML.` })
        load(page)
      } else {
        setWeightSync({ loading: false, result: null })
        toast({ title: "Error al sincronizar", description: data.error ?? "Error desconocido", variant: "destructive" })
      }
    } catch (err: any) {
      setWeightSync({ loading: false, result: null })
      toast({ title: "Error de red", description: err.message, variant: "destructive" })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 max-w-[1400px] mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Publicaciones (Mercado Libre)
            </h1>

            {/* Status count badges */}
            <div className="flex flex-wrap gap-2">
              {countsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-6 w-16 rounded-full bg-muted/40 animate-pulse" />
                ))
              ) : counts ? (
                <>
                  <BadgeCount
                    label="Total"
                    value={counts.total}
                    active={statusFilter === "all" && !sinProducto}
                    onClick={() => { setStatusFilter("all"); setSinProducto(false); setPage(0); }}
                  />
                  <BadgeCount
                    label="Activas"
                    value={counts.active}
                    color="green"
                    active={statusFilter === "active"}
                    onClick={() => { setStatusFilter("active"); setSinProducto(false); setPage(0); }}
                  />
                  <BadgeCount
                    label="Pausadas"
                    value={counts.paused}
                    color="yellow"
                    active={statusFilter === "paused"}
                    onClick={() => { setStatusFilter("paused"); setSinProducto(false); setPage(0); }}
                  />
                  <BadgeCount
                    label="Cerradas"
                    value={counts.closed}
                    color="zinc"
                    active={statusFilter === "closed"}
                    onClick={() => { setStatusFilter("closed"); setSinProducto(false); setPage(0); }}
                  />
                  <BadgeCount
                    label="Sin producto"
                    value={counts.sin_producto}
                    color="orange"
                    active={sinProducto}
                    onClick={() => { setSinProducto(p => !p); setSinStock(false); setStatusFilter("all"); setPage(0); }}
                  />
                  <BadgeCount
                    label="Sin stock"
                    value={counts.sin_stock}
                    color="red"
                    active={sinStock}
                    onClick={() => { setSinStock(s => !s); setSinProducto(false); setStatusFilter("all"); setPage(0); }}
                  />
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Weight sync result pill */}
            {weightSync.result && (
              <span className="text-xs text-muted-foreground">
                <span className="text-green-400 font-medium">{weightSync.result.updated}</span> actualizados
                {weightSync.result.missing > 0 && (
                  <> · <span className="text-yellow-400">{weightSync.result.missing}</span> sin peso</>
                )}
              </span>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncWeights}
                  disabled={weightSync.loading || accountId === "all"}
                  className="bg-transparent"
                >
                  <Scale className={`h-4 w-4 mr-2 ${weightSync.loading ? "animate-spin" : ""}`} />
                  {weightSync.loading ? "Sincronizando..." : "Sincronizar pesos"}
                </Button>
              </TooltipTrigger>
              {accountId === "all" && (
                <TooltipContent>Seleccioná una cuenta primero</TooltipContent>
              )}
            </Tooltip>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading || countsLoading}
              className="bg-transparent"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${(loading || countsLoading) ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </div>

        {/* ── Import progress indicator ───────────────────────────────────── */}
        {importProgress && importProgress.status !== "completed" && (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 flex items-center gap-4 text-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="text-muted-foreground font-medium truncate">
                  Importación {importProgress.status === "running" ? "en curso" : importProgress.status}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                  {importProgress.publications_offset.toLocaleString("es-AR")}
                  {importProgress.publications_total
                    ? ` / ${importProgress.publications_total.toLocaleString("es-AR")}`
                    : ""}
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${importProgress.status === "running" ? "bg-blue-500 animate-pulse" : "bg-green-500"}`}
                  style={{
                    width: importProgress.publications_total
                      ? `${Math.min(100, (importProgress.publications_offset / importProgress.publications_total) * 100)}%`
                      : "100%",
                  }}
                />
              </div>
            </div>
            {importProgress.status === "running" && (
              <RefreshCw className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
            )}
          </div>
        )}

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 items-end">

          {/* Cuenta */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Cuenta</label>
            <Select value={accountId} onValueChange={v => { setAccountId(v); setPage(0) }}>
              <SelectTrigger className="w-48 h-9 bg-transparent">
                <SelectValue placeholder="Todas las cuentas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas</SelectItem>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Estado */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Estado</label>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0) }}>
              <SelectTrigger className="w-36 h-9 bg-transparent">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="paused">Pausadas</SelectItem>
                <SelectItem value="under_review">Revisión</SelectItem>
                <SelectItem value="closed">Cerradas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Búsqueda */}
          <div className="space-y-1 flex-1 min-w-52">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="Título o Item ID..."
                className="h-9 bg-transparent"
              />
              <Button onClick={handleSearch} size="sm" variant="outline" className="h-9 bg-transparent px-3">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-4 items-center pb-0.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sinProducto}
                onChange={e => { setSinProducto(e.target.checked); setPage(0) }}
                className="accent-primary"
              />
              Sin producto
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soloElegibles}
                onChange={e => { setSoloElegibles(e.target.checked); setPage(0) }}
                className="accent-primary"
              />
              Solo elegibles catálogo
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sinStock}
                onChange={e => { setSinStock(e.target.checked); setPage(0) }}
                className="accent-primary"
              />
              Sin stock
            </label>
          </div>
        </div>

        {/* ── Tabla / Empty ───────────────────────────────────────────────── */}
        {rows.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border border-dashed rounded-xl">
            <Package className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-lg font-medium">No hay publicaciones</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {sinProducto || soloElegibles || statusFilter !== "all" || search
                ? "Ninguna publicación cumple los filtros activos."
                : "Primero importá tus publicaciones desde la sección de importación inicial."}
            </p>
            {!sinProducto && !soloElegibles && statusFilter === "all" && !search && (
              <Button asChild>
                <Link href="/ml/importer">Ir a Importación inicial</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Item ID</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Título</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Estado</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Precio</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">EAN / ISBN</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Cat.</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Peso (g)</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actualizado</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} className="border-b animate-pulse">
                          {Array.from({ length: 10 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-4 bg-muted/40 rounded w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : rows.map(row => (
                        <tr
                          key={row.id}
                          className="border-b hover:bg-muted/20 transition-colors group cursor-pointer"
                          onClick={() => setDetail(row)}
                        >
                          {/* Item ID */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                {row.ml_item_id}
                              </span>
                              <button
                                onClick={() => copyId(row.ml_item_id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                title="Copiar item_id"
                              >
                                {copied === row.ml_item_id
                                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                  : <Copy className="h-3.5 w-3.5" />
                                }
                              </button>
                            </div>
                          </td>

                          {/* Título */}
                          <td className="px-4 py-3 max-w-[240px]">
                            <span className="line-clamp-2 leading-tight">{row.title}</span>
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={`text-xs whitespace-nowrap ${STATUS_COLOR[row.status] ?? ""}`}
                            >
                              {STATUS_LABEL[row.status] ?? row.status}
                            </Badge>
                          </td>

                          {/* Precio */}
                          <td className="px-4 py-3 text-right font-mono text-sm whitespace-nowrap">
                            {fmt(row.price)}
                          </td>

                          {/* Stock */}
                          <td className="px-4 py-3 text-right">
                            <span className={row.current_stock === 0 ? "text-red-400 font-medium" : ""}>
                              {row.current_stock ?? "—"}
                            </span>
                          </td>

                          {/* SKU */}
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-[100px]">
                            <span className="truncate block">{row.sku ?? "—"}</span>
                          </td>

                          {/* EAN / ISBN */}
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                            {row.isbn ?? row.ean ?? row.gtin ?? "—"}
                          </td>

                          {/* Catálogo elegible */}
                          <td className="px-4 py-3 text-center">
                            {row.catalog_listing_eligible
                              ? <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                              : <span className="text-muted-foreground/30 text-base leading-none">—</span>
                            }
                          </td>

                          {/* Peso */}
                          <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {row.meli_weight_g != null
                              ? <span className="text-foreground">{row.meli_weight_g.toLocaleString()}</span>
                              : <span className="text-muted-foreground/30">—</span>
                            }
                          </td>

                          {/* Fecha */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {relDate(row.updated_at)}
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                              {/* Abrir en ML + Copiar link */}
                              {row.permalink && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a
                                        href={row.permalink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent>Abrir en ML</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => copyLink(row.permalink!, row.id)}
                                        className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
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

                              {/* Detalle */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => setDetail(row)}
                                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
                                  >
                                    <Info className="h-4 w-4" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Ver detalle</TooltipContent>
                              </Tooltip>

                              {/* Menú Más */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    disabled={enqueueing?.startsWith(row.ml_item_id) ?? false}
                                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50 disabled:opacity-40"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">

                                  {/* Copiar item ID */}
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onClick={() => copyId(row.ml_item_id)}
                                  >
                                    <Copy className="h-4 w-4" />
                                    Copiar item ID
                                  </DropdownMenuItem>

                                  {/* Abrir en ML */}
                                  {row.permalink && (
                                    <DropdownMenuItem className="gap-2" asChild>
                                      <a href={row.permalink} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                        Abrir en ML
                                      </a>
                                    </DropdownMenuItem>
                                  )}

                                  {/* Opt-in catálogo */}
                                  {row.catalog_listing_eligible ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div>
                                          <DropdownMenuItem disabled className="gap-2 opacity-50">
                                            <ShoppingCart className="h-4 w-4" />
                                            Opt-in catálogo
                                          </DropdownMenuItem>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="left">Ya está en catálogo</TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <DropdownMenuItem
                                      className="gap-2"
                                      disabled={enqueueing === `${row.ml_item_id}:catalog_optin`}
                                      onClick={() => enqueueJob(row, "catalog_optin")}
                                    >
                                      <ShoppingCart className="h-4 w-4" />
                                      Opt-in catálogo
                                    </DropdownMenuItem>
                                  )}

                                  {/* Sync buybox */}
                                  <DropdownMenuItem
                                    className="gap-2"
                                    disabled={enqueueing === `${row.ml_item_id}:buybox_sync`}
                                    onClick={() => enqueueJob(row, "buybox_sync")}
                                  >
                                    <Zap className="h-4 w-4" />
                                    Sync buybox
                                  </DropdownMenuItem>

                                  {/* Reimportar */}
                                  <DropdownMenuItem
                                    className="gap-2"
                                    disabled={enqueueing === `${row.ml_item_id}:import_single_item`}
                                    onClick={() => enqueueJob(row, "import_single_item")}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    Reimportar
                                  </DropdownMenuItem>

                                </DropdownMenuContent>
                              </DropdownMenu>

                            </div>
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
                <p className="text-sm text-muted-foreground">
                  {loading
                    ? "Cargando..."
                    : `${(page * PAGE_SIZE + 1).toLocaleString("es-AR")}–${Math.min((page + 1) * PAGE_SIZE, total).toLocaleString("es-AR")} de ${total.toLocaleString("es-AR")}`
                  }
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevPage}
                    disabled={page === 0 || loading}
                    className="bg-transparent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm tabular-nums">
                    {page + 1} / {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextPage}
                    disabled={page >= totalPages - 1 || loading}
                    className="bg-transparent"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Modal detalle ────────────────────────────────────────────────── */}
        {detail && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setDetail(null)}
          >
            <div
              className="bg-background border rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-semibold leading-snug text-balance">{detail.title}</h2>
                  <Badge
                    variant="outline"
                    className={`text-xs ${STATUS_COLOR[detail.status] ?? ""}`}
                  >
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </Badge>
                </div>
                <button
                  onClick={() => setDetail(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0 text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {([
                  ["Item ID",              detail.ml_item_id],
                  ["Precio",               fmt(detail.price)],
                  ["Stock",                detail.current_stock ?? "—"],
                  ["SKU",                  detail.sku ?? "—"],
                  ["EAN",                  detail.ean ?? "—"],
                  ["ISBN",                 detail.isbn ?? "—"],
                  ["GTIN",                 detail.gtin ?? "—"],
                  ["Elegible catálogo",    detail.catalog_listing_eligible ? "Sí" : "No"],
                  ["Producto vinculado",   detail.product_id ? "Sí" : "No"],
                  ["Actualizado",          detail.updated_at ? new Date(detail.updated_at).toLocaleString("es-AR") : "—"],
                ] as [string, string | number][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium break-all">{String(value)}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-1">
                {detail.permalink && (
                  <a
                    href={detail.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-400 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir en MercadoLibre
                  </a>
                )}
                <button
                  onClick={() => copyId(detail.ml_item_id)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground ml-auto"
                >
                  {copied === detail.ml_item_id
                    ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                    : <Copy className="h-4 w-4" />
                  }
                  Copiar ID
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </TooltipProvider>
  )
}

// ── BadgeCount sub-component ──────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  green:  "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25",
  zinc:   "bg-zinc-500/15 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/25",
  orange: "bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25",
  red:    "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25",
  default:"bg-muted/40 text-muted-foreground border-border hover:bg-muted/60",
}

function BadgeCount({
  label,
  value,
  color = "default",
  active,
  onClick,
}: {
  label: string
  value: number
  color?: string
  active?: boolean
  onClick?: () => void
}) {
  const cls = COLOR_MAP[color] ?? COLOR_MAP.default
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium
        transition-colors cursor-pointer
        ${cls}
        ${active ? "ring-2 ring-offset-1 ring-offset-background ring-current" : ""}
      `}
    >
      {label}
      <span className="tabular-nums">{value.toLocaleString("es-AR")}</span>
    </button>
  )
}
