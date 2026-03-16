"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import {
  PackageX, TrendingUp, Copy, Check, ExternalLink,
  ArrowUpDown, RefreshCw, ChevronLeft, Search, X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

interface ReorderBook {
  id: string
  ml_item_id: string
  title: string
  sku: string | null
  isbn: string | null
  price: number | null
  current_stock: number
  sold_quantity: number
  editorial: string | null
  status: string
  account_id: string
  permalink: string | null
}

interface MLAccount {
  id: string
  nickname: string | null
  ml_user_id: string | null
}

const STATUS_LABEL: Record<string, string> = {
  active:       "Activa",
  paused:       "Pausada",
  under_review: "En revisión",
  inactive:     "Inactiva",
}

const STATUS_COLOR: Record<string, string> = {
  active:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  paused:       "bg-orange-500/15 text-orange-400 border-orange-500/30",
  under_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  inactive:     "bg-muted text-muted-foreground",
}

const LIMIT = 30

export default function VolverAPedirPage() {
  const [books, setBooks]           = useState<ReorderBook[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(0)
  const [sort, setSort]             = useState<"sold" | "editorial">("sold")
  const [search, setSearch]         = useState("")
  const [inputVal, setInputVal]     = useState("")
  const [accountId, setAccountId]   = useState<string>("all")
  const [accounts, setAccounts]     = useState<MLAccount[]>([])
  const [copiedId, setCopiedId]     = useState<string | null>(null)
  const searchTimer                 = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load accounts for selector
  useEffect(() => {
    fetch("/api/ml/accounts")
      .then(r => r.json())
      .then(d => setAccounts(d.accounts ?? []))
      .catch(() => {})
  }, [])

  const load = useCallback(async (
    currentSort: string,
    currentSearch: string,
    currentPage: number,
    currentAccount: string,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort:   currentSort,
        limit:  String(LIMIT),
        offset: String(currentPage * LIMIT),
      })
      if (currentSearch) params.set("search", currentSearch)
      if (currentAccount !== "all") params.set("account_id", currentAccount)

      const res  = await fetch(`/api/radar/reorder?${params}`)
      const data = await res.json()
      if (data.ok) {
        setBooks(data.rows ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(sort, search, page, accountId)
  }, [load, sort, search, page, accountId])

  // Debounce search input
  const handleInput = (v: string) => {
    setInputVal(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(v)
      setPage(0)
    }, 350)
  }

  const handleSort = (s: "sold" | "editorial") => {
    setSort(s)
    setPage(0)
  }

  const handleAccount = (v: string) => {
    setAccountId(v)
    setPage(0)
  }

  const copySku = (book: ReorderBook) => {
    const value = book.sku ?? book.isbn ?? book.ml_item_id
    navigator.clipboard.writeText(value).then(() => {
      setCopiedId(book.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/radar">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-orange-400" />
            <h1 className="text-xl font-bold tracking-tight">Volver a pedir</h1>
            {total > 0 && (
              <Badge variant="outline" className="text-[11px] text-orange-400 border-orange-500/30">
                {total} sin stock
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Publicaciones pausadas o con stock cero — ordenadas por ventas
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(sort, search, page, accountId)}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Título, SKU o ISBN…"
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            className="h-8 text-sm pl-8 w-56"
          />
          {inputVal && (
            <button
              onClick={() => { setInputVal(""); setSearch(""); setPage(0) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Account selector */}
        <Select value={accountId} onValueChange={handleAccount}>
          <SelectTrigger className="h-8 text-sm w-44">
            <SelectValue placeholder="Todas las cuentas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {accounts.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.nickname ?? a.ml_user_id ?? a.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={sort === "sold" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs px-3"
            onClick={() => handleSort("sold")}
          >
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            Más vendidos
          </Button>
          <Button
            variant={sort === "editorial" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs px-3"
            onClick={() => handleSort("editorial")}
          >
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
            Por editorial
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {/* Column headers */}
        <div className="hidden md:grid grid-cols-[1fr_160px_130px_90px_80px_72px] gap-4 px-4 py-2.5 border-b border-border bg-muted/20 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
          <span>Título</span>
          <span>Editorial</span>
          <span>SKU / ISBN</span>
          <span className="text-center">Estado</span>
          <span className="text-right">Vendidos</span>
          <span />
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <PackageX className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "Sin resultados para esa búsqueda." : "No hay publicaciones sin stock. ¡Todo en orden!"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {books.map(book => (
              <div
                key={book.id}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_160px_130px_90px_80px_72px] gap-4 items-center px-4 py-3 hover:bg-muted/10 transition-colors"
              >
                {/* Título */}
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug truncate">{book.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {book.editorial && (
                      <span className="md:hidden text-[10px] text-muted-foreground">{book.editorial}</span>
                    )}
                    {book.sku && (
                      <span className="md:hidden text-[10px] font-mono text-muted-foreground/70">SKU: {book.sku}</span>
                    )}
                    <span className={`md:hidden text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[book.status] ?? STATUS_COLOR.inactive}`}>
                      {STATUS_LABEL[book.status] ?? book.status}
                    </span>
                  </div>
                </div>

                {/* Editorial (desktop) */}
                <span className="hidden md:block text-sm text-muted-foreground truncate">
                  {book.editorial ?? <span className="text-muted-foreground/40">—</span>}
                </span>

                {/* SKU / ISBN (desktop) */}
                <span className="hidden md:block text-xs font-mono text-muted-foreground truncate">
                  {book.sku ?? book.isbn ?? <span className="text-muted-foreground/40">—</span>}
                </span>

                {/* Estado (desktop) */}
                <div className="hidden md:flex justify-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[book.status] ?? STATUS_COLOR.inactive}`}>
                    {STATUS_LABEL[book.status] ?? book.status}
                  </span>
                </div>

                {/* Vendidos */}
                <div className="hidden md:flex items-center justify-end gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="text-sm font-mono font-semibold tabular-nums text-emerald-400">
                    {book.sold_quantity.toLocaleString("es-AR")}
                  </span>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-0.5 justify-end">
                  {/* Mobile: sold qty */}
                  <span className="md:hidden text-xs font-mono font-semibold text-emerald-400 mr-1">
                    {book.sold_quantity.toLocaleString("es-AR")}
                  </span>

                  {book.permalink && (
                    <a
                      href={book.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                      title="Ver en MercadoLibre"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => copySku(book)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                    title={`Copiar SKU: ${book.sku ?? book.isbn ?? book.ml_item_id}`}
                  >
                    {copiedId === book.id
                      ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
            <span className="text-xs text-muted-foreground">
              {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} de {total.toLocaleString("es-AR")}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                disabled={page === 0 || loading}
                onClick={() => setPage(p => p - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 text-xs"
                disabled={page >= totalPages - 1 || loading}
                onClick={() => setPage(p => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
