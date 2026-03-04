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
} from "lucide-react"
import Link from "next/link"

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
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MLPublicationsPage() {
  const [accounts, setAccounts]           = useState<Account[]>([])
  const [accountId, setAccountId]         = useState<string>("all")
  const [statusFilter, setStatusFilter]   = useState<string>("all")
  const [search, setSearch]               = useState<string>("")
  const [sinProducto, setSinProducto]     = useState(false)
  const [soloElegibles, setSoloElegibles] = useState(false)
  const [page, setPage]                   = useState(0)
  const [rows, setRows]                   = useState<Publication[]>([])
  const [total, setTotal]                 = useState(0)
  const [loading, setLoading]             = useState(false)
  const [copied, setCopied]               = useState<string | null>(null)
  const [detail, setDetail]               = useState<Publication | null>(null)
  const [counts, setCounts]               = useState<Counts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

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
  }, [accountId, statusFilter, sinProducto, soloElegibles])

  useEffect(() => { setPage(0); load(0) }, [accountId, statusFilter, sinProducto, soloElegibles])

  const handleSearch = () => { setPage(0); load(0) }
  const prevPage = () => { const p = page - 1; setPage(p); load(p) }
  const nextPage = () => { const p = page + 1; setPage(p); load(p) }
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  const handleRefresh = () => {
    load(page)
    loadCounts(accountId)
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
                    onClick={() => { setSinProducto(true); setStatusFilter("all"); setPage(0); }}
                  />
                </>
              ) : null}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading || countsLoading}
            className="bg-transparent shrink-0"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(loading || countsLoading) ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

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

                          {/* Fecha */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {relDate(row.updated_at)}
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                              {/* Abrir en ML */}
                              {row.permalink && (
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
                                  <button className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <DropdownMenuItem disabled className="gap-2 cursor-not-allowed opacity-50">
                                          <ShoppingCart className="h-4 w-4" />
                                          Opt-in catálogo
                                          <span className="ml-auto text-xs text-muted-foreground">pronto</span>
                                        </DropdownMenuItem>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">Próximamente</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <DropdownMenuItem disabled className="gap-2 cursor-not-allowed opacity-50">
                                          <Zap className="h-4 w-4" />
                                          Sync buybox
                                          <span className="ml-auto text-xs text-muted-foreground">pronto</span>
                                        </DropdownMenuItem>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">Próximamente</TooltipContent>
                                  </Tooltip>
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
