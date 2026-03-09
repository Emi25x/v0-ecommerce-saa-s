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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Loader2,
  Play,
  Database,
  BookOpen,
  ShoppingCart,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const STATUS_COLOR: Record<string, string> = {
  active:       "bg-green-500/15 text-green-400 border-green-500/30",
  paused:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  closed:       "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  under_review: "bg-red-500/15 text-red-400 border-red-500/30",
  inactive:     "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Row {
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
  catalog_product_id: string | null
  product_id: string | null
  permalink: string | null
  updated_at: string
}

interface Account {
  id: string
  nickname: string
}

interface Counts {
  total:    number
  eligible: number
  matched:  number
  pending:  number
}

interface RunLog {
  ts:   string
  msg:  string
  kind: "info" | "ok" | "warn" | "error"
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

const nowTs = () =>
  new Date().toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

// ── BadgeCount ─────────────────────────────────────────────────────────────

function BadgeCount({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label:   string
  value:   number
  color?:  "green" | "blue" | "yellow" | "orange" | "zinc"
  active?: boolean
  onClick?: () => void
}) {
  const colorMap: Record<string, string> = {
    green:  "text-green-400 border-green-500/40",
    blue:   "text-blue-400 border-blue-500/40",
    yellow: "text-yellow-400 border-yellow-500/40",
    orange: "text-orange-400 border-orange-500/40",
    zinc:   "text-zinc-400 border-zinc-500/40",
  }
  const colorClass = color ? colorMap[color] : "text-foreground border-border"

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium
        transition-colors cursor-pointer select-none
        ${active ? "bg-muted" : "bg-transparent hover:bg-muted/50"}
        ${colorClass}
      `}
    >
      {label}
      <span className="tabular-nums">{value.toLocaleString("es-AR")}</span>
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CatalogEligibilityPage() {
  const { toast } = useToast()

  // Accounts
  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string>("all")

  // Table
  const [rows,    setRows]    = useState<Row[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(false)

  // Filters
  const [eligibleFilter, setEligibleFilter] = useState<string>("all")
  const [search,         setSearch]         = useState("")

  // Counts (badges)
  const [counts,        setCounts]        = useState<Counts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

  // Run loop
  const [running,     setRunning]     = useState(false)
  const [logs,        setLogs]        = useState<RunLog[]>([])
  const [runProgress, setRunProgress] = useState<{ processed: number; matched: number } | null>(null)
  const abortRef  = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Inline copy feedback
  const [copied, setCopied] = useState<string | null>(null)

  // Opt-in state
  const [optingIn, setOptingIn] = useState<Set<string>>(new Set())

  const searchRef = useRef(search)
  searchRef.current = search

  // ── Log helper ──────────────────────────────────────────────────────────

  const addLog = useCallback((msg: string, kind: RunLog["kind"] = "info") => {
    setLogs((prev) => [...prev.slice(-199), { ts: nowTs(), msg, kind }])
  }, [])

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  const handleOptIn = async (row: Row) => {
    setOptingIn(prev => new Set(prev).add(row.id))
    try {
      const res = await fetch("/api/ml/catalog-optin", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          account_id: row.account_id,
          item_id:    row.ml_item_id,
          ean:        row.gtin || row.ean || row.isbn,
        }),
      })
      const data = await res.json()
      if (data.ok || data.status === "already_in_catalog") {
        toast({ title: "Opt-in exitoso", description: row.title.slice(0, 60) })
        load(page)
      } else {
        toast({ title: "Error en opt-in", description: data.error ?? data.status ?? "Error desconocido", variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setOptingIn(prev => { const s = new Set(prev); s.delete(row.id); return s })
    }
  }

  // ── Load accounts ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/mercadolibre/accounts")
      .then((r) => r.json())
      .then((d) => { if (d.accounts) setAccounts(d.accounts) })
      .catch(() => {})
  }, [])

  // ── Fetch table rows ─────────────────────────────────────────────────────

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(PAGE_SIZE),
        ...(accountId !== "all"      ? { account_id: accountId } : {}),
        ...(eligibleFilter === "1"   ? { eligible: "1" }         : {}),
        ...(eligibleFilter === "0"   ? { eligible: "0" }         : {}),
        ...(eligibleFilter === "pid" ? { has_product_id: "1" }   : {}),
        ...(searchRef.current        ? { q: searchRef.current }  : {}),
      })
      const res  = await fetch(`/api/ml/catalog/eligibility?${params}`)
      const data = await res.json()
      if (data.ok) {
        setRows(data.rows)
        setTotal(data.total)
        if (data.counts) setCounts(data.counts)
      }
    } finally {
      setLoading(false)
    }
  }, [accountId, eligibleFilter])

  const loadCounts = useCallback(async () => {
    setCountsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: "1",
        ...(accountId !== "all" ? { account_id: accountId } : {}),
      })
      const res  = await fetch(`/api/ml/catalog/eligibility?${params}`)
      const data = await res.json()
      if (data.ok && data.counts) setCounts(data.counts)
    } catch { /* silent */ } finally {
      setCountsLoading(false)
    }
  }, [accountId])

  useEffect(() => { setPage(0); load(0) },  [accountId, eligibleFilter])
  useEffect(() => { loadCounts() },          [accountId])

  const handleSearch = () => { setPage(0); load(0) }
  const prevPage = () => { const p = page - 1; setPage(p); load(p) }
  const nextPage = () => { const p = page + 1; setPage(p); load(p) }
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Run eligibility scan (in-browser batched loop) ───────────────────────

  const handleRun = useCallback(async (force = false) => {
    if (!accountId || accountId === "all") {
      toast({ title: "Seleccioná una cuenta ML primero", variant: "destructive" })
      return
    }
    setRunning(true)
    abortRef.current = false
    setLogs([])
    setRunProgress({ processed: 0, matched: 0 })

    let offset         = 0
    let totalProcessed = 0
    let totalMatched   = 0

    addLog(
      `Iniciando indexacion (${accountId}${force ? ", forzando re-proceso" : ""})`,
      "info",
    )

    try {
      while (!abortRef.current) {
        const res = await fetch("/api/ml/catalog/eligibility/run", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ account_id: accountId, batch_size: 20, offset, force }),
        })
        const data = await res.json()

        if (!data.ok) {
          addLog(`Error: ${data.error}`, "error")
          break
        }

        totalProcessed += data.processed ?? 0
        totalMatched   += data.matched   ?? 0
        setRunProgress({ processed: totalProcessed, matched: totalMatched })

        const parts = [
          `lote=${data.processed}`,
          `match=${data.matched}`,
          data.not_found ? `no_encontrado=${data.not_found}` : null,
          data.ambiguous ? `ambiguo=${data.ambiguous}`       : null,
          data.errors    ? `errores=${data.errors}`          : null,
        ]
          .filter(Boolean)
          .join(" | ")

        addLog(parts, data.errors ? "warn" : "ok")
        if (data.errors && data.last_error) {
          addLog(`↳ Error: ${data.last_error}`, "error")
        }

        if (data.done || !data.has_more) {
          addLog(
            `Completado. Total procesadas: ${totalProcessed}, con match: ${totalMatched}`,
            "ok",
          )
          break
        }

        offset = data.next_offset
        await new Promise((r) => setTimeout(r, 300))
      }
    } finally {
      setRunning(false)
      load(0)
      loadCounts()
    }
  }, [accountId, addLog, load, loadCounts, toast])

  // ── Enqueue background job ────────────────────────────────────────────────

  const handleEnqueue = useCallback(async () => {
    if (!accountId || accountId === "all") {
      toast({ title: "Seleccioná una cuenta ML primero", variant: "destructive" })
      return
    }
    try {
      const res  = await fetch("/api/ml/catalog/eligibility/enqueue", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ account_id: accountId }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ title: "Job encolado", description: `ID: ${data.job_id}` })
      } else {
        toast({ title: "Error al encolar", description: data.error, variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "Error de red", description: e.message, variant: "destructive" })
    }
  }, [accountId, toast])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 max-w-[1400px] mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Elegibilidad de Catálogo</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Publicaciones con ISBN / EAN consultadas contra la API de productos de Mercado Libre.
              Las que tienen match único se marcan elegibles para opt-in al catálogo.
            </p>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2 items-center">
            {countsLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-6 w-20 rounded-full bg-muted/40 animate-pulse" />
                ))
              : counts
              ? (
                <>
                  <BadgeCount
                    label="Con ID"
                    value={counts.total}
                    active={eligibleFilter === "all"}
                    onClick={() => { setEligibleFilter("all");  setPage(0) }}
                  />
                  <BadgeCount
                    label="Elegibles"
                    value={counts.eligible}
                    color="green"
                    active={eligibleFilter === "1"}
                    onClick={() => { setEligibleFilter("1");   setPage(0) }}
                  />
                  <BadgeCount
                    label="Con match"
                    value={counts.matched}
                    color="blue"
                    active={eligibleFilter === "pid"}
                    onClick={() => { setEligibleFilter("pid"); setPage(0) }}
                  />
                  <BadgeCount
                    label="Sin match"
                    value={counts.pending}
                    color="orange"
                    active={eligibleFilter === "0"}
                    onClick={() => { setEligibleFilter("0");   setPage(0) }}
                  />
                </>
              )
              : null}
          </div>
        </div>

        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 items-end justify-between">

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cuenta</label>
              <Select
                value={accountId}
                onValueChange={(v) => { setAccountId(v); setPage(0) }}
              >
                <SelectTrigger className="w-48 h-9 bg-transparent">
                  <SelectValue placeholder="Todas las cuentas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las cuentas</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 flex-1 min-w-52">
              <label className="text-xs text-muted-foreground">Buscar</label>
              <div className="flex gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Título, Item ID, ISBN, EAN..."
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => { load(page); loadCounts() }}
              disabled={loading || countsLoading}
              className="h-9 bg-transparent"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading || countsLoading ? "animate-spin" : ""}`}
              />
              Actualizar
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={running || accountId === "all"}
                  onClick={handleEnqueue}
                  className="h-9 bg-transparent"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Encolar job
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {"Inserta un job tipo 'catalog_index' en ml_jobs para procesamiento en background"}
              </TooltipContent>
            </Tooltip>

            <Button
              size="sm"
              disabled={running || accountId === "all"}
              onClick={() => handleRun(false)}
              className="h-9"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Indexando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Indexar elegibles
                </>
              )}
            </Button>

            {running && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { abortRef.current = true }}
                className="h-9"
              >
                Detener
              </Button>
            )}
          </div>
        </div>

        {/* ── Run progress + logs ───────────────────────────────────────────── */}
        {(running || logs.length > 0) && (
          <div className="rounded-xl border border-border overflow-hidden">
            {running && runProgress && (
              <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/20 border-b border-border text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>
                  Procesadas:{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {runProgress.processed}
                  </span>
                  &nbsp;·&nbsp; Con match:{" "}
                  <span className="text-green-400 font-medium tabular-nums">
                    {runProgress.matched}
                  </span>
                </span>
              </div>
            )}
            <div className="h-40 overflow-y-auto bg-black/60 p-3 font-mono text-xs space-y-0.5">
              {logs.length === 0 ? (
                <span className="text-zinc-600">Sin logs todavía.</span>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.kind === "error" ? "text-red-400"
                      : l.kind === "warn" ? "text-yellow-400"
                      : l.kind === "ok"   ? "text-green-400"
                      : "text-zinc-300"
                    }
                  >
                    <span className="text-zinc-600 mr-2">{l.ts}</span>
                    {l.msg}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────────── */}
        {rows.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 border border-dashed rounded-xl text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-lg font-medium">Sin publicaciones con ISBN / EAN</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {eligibleFilter !== "all" || search
                ? "Ninguna publicación cumple los filtros activos."
                : "Importá publicaciones que tengan ISBN o EAN para activar este proceso."}
            </p>
            {eligibleFilter === "all" && !search && (
              <Button asChild variant="outline" size="sm">
                <Link href="/ml/publications">Ver publicaciones</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      Item
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Título
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      ISBN / EAN
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      Catalog Product
                    </th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      Elegible
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                      Estado
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Precio
                    </th>
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b animate-pulse">
                          {Array.from({ length: 8 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-4 bg-muted/40 rounded w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : rows.map((row) => {
                        const identifier = row.isbn || row.ean || row.gtin
                        const idType     = row.isbn ? "ISBN" : row.ean ? "EAN" : "GTIN"
                        return (
                          <tr
                            key={row.id}
                            className="border-b hover:bg-muted/20 transition-colors group"
                          >
                            {/* Item ID */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                  {row.ml_item_id}
                                </span>
                                <button
                                  onClick={() => copyText(row.ml_item_id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  title="Copiar item ID"
                                >
                                  {copied === row.ml_item_id
                                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                    : <Copy className="h-3.5 w-3.5" />
                                  }
                                </button>
                              </div>
                            </td>

                            {/* Título */}
                            <td className="px-4 py-3 max-w-[220px]">
                              <span className="line-clamp-2 leading-tight">{row.title}</span>
                            </td>

                            {/* ISBN / EAN */}
                            <td className="px-4 py-3">
                              {identifier ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-mono text-muted-foreground">
                                    {identifier}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1 py-0 h-4 text-muted-foreground"
                                  >
                                    {idType}
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>

                            {/* Catalog Product ID */}
                            <td className="px-4 py-3">
                              {row.catalog_product_id ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs text-blue-400">
                                    {row.catalog_product_id}
                                  </span>
                                  <button
                                    onClick={() => copyText(row.catalog_product_id!)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                    title="Copiar catalog product ID"
                                  >
                                    {copied === row.catalog_product_id
                                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                      : <Copy className="h-3.5 w-3.5" />
                                    }
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </td>

                            {/* Elegible */}
                            <td className="px-4 py-3 text-center">
                              {row.catalog_listing_eligible === true ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                                  </TooltipTrigger>
                                  <TooltipContent>Elegible para catálogo</TooltipContent>
                                </Tooltip>
                              ) : row.catalog_listing_eligible === false ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                                  </TooltipTrigger>
                                  <TooltipContent>No elegible — sin match único</TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground/30 text-base leading-none">
                                  —
                                </span>
                              )}
                            </td>

                            {/* Estado */}
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`text-xs whitespace-nowrap ${STATUS_COLOR[row.status] ?? ""}`}
                              >
                                {row.status}
                              </Badge>
                            </td>

                            {/* Precio */}
                            <td className="px-4 py-3 text-right font-mono text-sm whitespace-nowrap">
                              {fmt(row.price)}
                            </td>

                            {/* Actions: opt-in + external link */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {/* Opt-in al catálogo — visible cuando es elegible */}
                                {row.catalog_listing_eligible && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => handleOptIn(row)}
                                        disabled={optingIn.has(row.id)}
                                        className="text-muted-foreground hover:text-green-400 transition-colors disabled:opacity-50"
                                        title="Hacer opt-in al catálogo"
                                      >
                                        {optingIn.has(row.id)
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <ShoppingCart className="h-3.5 w-3.5" />
                                        }
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>Opt-in al catálogo</TooltipContent>
                                  </Tooltip>
                                )}
                                {row.permalink && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a
                                        href={row.permalink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent>Ver en MercadoLibre</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
              <span className="text-xs text-muted-foreground">
                {total.toLocaleString("es-AR")} publicaciones con identificador
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevPage}
                  disabled={page === 0 || loading}
                  className="h-8 px-2 bg-transparent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {page + 1} / {Math.max(1, totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextPage}
                  disabled={page + 1 >= totalPages || loading}
                  className="h-8 px-2 bg-transparent"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
