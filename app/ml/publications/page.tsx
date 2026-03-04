"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ExternalLink, Copy, RefreshCw, ChevronLeft, ChevronRight,
  Search, Package, CheckCircle2, AlertCircle, Info,
} from "lucide-react"
import Link from "next/link"

const PAGE_SIZE = 50

const STATUS_LABEL: Record<string, string> = {
  active:   "Activa",
  paused:   "Pausada",
  closed:   "Cerrada",
  under_review: "Revisión",
  inactive: "Inactiva",
}
const STATUS_COLOR: Record<string, string> = {
  active:       "bg-green-500/15 text-green-400 border-green-500/30",
  paused:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  closed:       "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  under_review: "bg-red-500/15 text-red-400 border-red-500/30",
  inactive:     "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
}

const fmt = (n: number | null | undefined) =>
  n != null
    ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
    : "—"

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
  catalog_listing_eligible: boolean | null
  product_id: string | null
  permalink: string | null
  updated_at: string
}

interface Account { id: string; nickname: string }

export default function MLPublicationsPage() {
  const [accounts, setAccounts]         = useState<Account[]>([])
  const [accountId, setAccountId]       = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch]             = useState<string>("")
  const [sinProducto, setSinProducto]   = useState(false)
  const [soloElegibles, setSoloElegibles] = useState(false)
  const [page, setPage]                 = useState(0)
  const [rows, setRows]                 = useState<Publication[]>([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(false)
  const [copied, setCopied]             = useState<string | null>(null)
  const [detail, setDetail]             = useState<Publication | null>(null)

  // Cargar cuentas
  useEffect(() => {
    fetch("/api/mercadolibre/accounts")
      .then(r => r.json())
      .then(d => {
        if (d.accounts) setAccounts(d.accounts)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page:   String(p),
        limit:  String(PAGE_SIZE),
        ...(accountId !== "all" ? { account_id: accountId } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(search ? { q: search } : {}),
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
  }, [accountId, statusFilter, search, sinProducto, soloElegibles])

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

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Publicaciones ML</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total > 0 ? `${total.toLocaleString("es-AR")} publicaciones importadas` : "Publicaciones importadas desde MercadoLibre"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="bg-transparent">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Cuenta */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Cuenta</label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-44 h-9 bg-transparent">
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
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
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-xs text-muted-foreground">Buscar</label>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Título o item_id..."
              className="h-9 bg-transparent"
            />
            <Button onClick={handleSearch} size="sm" variant="outline" className="h-9 bg-transparent">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-3 items-center pb-0.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sinProducto}
              onChange={e => setSinProducto(e.target.checked)}
              className="accent-primary"
            />
            Sin producto
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloElegibles}
              onChange={e => setSoloElegibles(e.target.checked)}
              className="accent-primary"
            />
            Solo elegibles catálogo
          </label>
        </div>
      </div>

      {/* Tabla */}
      {rows.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center border border-dashed rounded-xl">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium">No hay publicaciones importadas</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Primero tenés que importar tus publicaciones desde la sección de importación inicial.
          </p>
          <Button asChild>
            <Link href="/ml/importer">Ir a Importación inicial</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Item ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Título</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">EAN / ISBN</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Catálogo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actualizado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b animate-pulse">
                        {Array.from({ length: 10 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-muted/40 rounded w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map(row => (
                      <tr key={row.id} className="border-b hover:bg-muted/20 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-muted-foreground">{row.ml_item_id}</span>
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
                        <td className="px-4 py-3 max-w-[260px]">
                          <span className="line-clamp-2 leading-tight">{row.title}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${STATUS_COLOR[row.status] ?? ""}`}>
                            {STATUS_LABEL[row.status] ?? row.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">{fmt(row.price)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={row.current_stock === 0 ? "text-red-400" : ""}>
                            {row.current_stock ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{row.sku ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {row.isbn ?? row.ean ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.catalog_listing_eligible
                            ? <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                            : <span className="text-muted-foreground/30">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {row.updated_at
                            ? new Date(row.updated_at).toLocaleDateString("es-AR")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {row.permalink && (
                              <a
                                href={row.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                title="Abrir en ML"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              onClick={() => setDetail(row)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Ver detalle"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString("es-AR")}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prevPage} disabled={page === 0 || loading} className="bg-transparent">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">{page + 1} / {totalPages || 1}</span>
              <Button variant="outline" size="sm" onClick={nextPage} disabled={page >= totalPages - 1 || loading} className="bg-transparent">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-background border rounded-xl p-6 max-w-lg w-full space-y-3 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold leading-snug">{detail.title}</h2>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground shrink-0">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ["Item ID",    detail.ml_item_id],
                ["Estado",     STATUS_LABEL[detail.status] ?? detail.status],
                ["Precio",     fmt(detail.price)],
                ["Stock",      detail.current_stock ?? "—"],
                ["SKU",        detail.sku ?? "—"],
                ["EAN",        detail.ean ?? "—"],
                ["ISBN",       detail.isbn ?? "—"],
                ["Elegible catálogo", detail.catalog_listing_eligible ? "Sí" : "No"],
                ["Producto vinculado", detail.product_id ? "Sí" : "No"],
                ["Actualizado", detail.updated_at ? new Date(detail.updated_at).toLocaleString("es-AR") : "—"],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="font-medium">{String(value)}</p>
                </div>
              ))}
            </div>
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
          </div>
        </div>
      )}
    </div>
  )
}
