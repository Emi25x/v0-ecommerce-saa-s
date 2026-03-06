"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  ShoppingBag, RefreshCw, ChevronLeft, ChevronRight, Search,
  ExternalLink, Receipt, Package, AlertCircle, CheckCircle2,
  Clock, Truck,
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const ORDER_STATUS_LABEL: Record<string, string> = {
  paid:               "Pagada",
  payment_required:   "Pago pendiente",
  payment_in_process: "Pago en proceso",
  partially_refunded: "Reembolso parcial",
  cancelled:          "Cancelada",
  invalid:            "Inválida",
}

const ORDER_STATUS_COLOR: Record<string, string> = {
  paid:               "bg-green-500/15 text-green-400 border-green-500/30",
  payment_required:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  payment_in_process: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  partially_refunded: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  cancelled:          "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  invalid:            "bg-red-500/15 text-red-400 border-red-500/30",
}

const SHIP_STATUS_LABEL: Record<string, string> = {
  pending:     "Pendiente",
  handling:    "Preparando",
  ready_to_ship: "Lista para enviar",
  shipped:     "Enviada",
  delivered:   "Entregada",
  not_delivered: "No entregada",
  cancelled:   "Cancelada",
}

const SHIP_STATUS_COLOR: Record<string, string> = {
  pending:       "text-amber-400",
  handling:      "text-blue-400",
  ready_to_ship: "text-sky-400",
  shipped:       "text-indigo-400",
  delivered:     "text-green-400",
  not_delivered: "text-red-400",
  cancelled:     "text-zinc-400",
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, currency = "ARS") =>
  n != null
    ? new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n)
    : "—"

const relDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Hoy"
  if (days === 1) return "Ayer"
  if (days < 30)  return `Hace ${days}d`
  return new Date(iso).toLocaleDateString("es-AR")
}

// ── Types ──────────────────────────────────────────────────────────────────

interface MLOrder {
  id: string
  ml_order_id: number    // bigint en Postgres → number en JS
  account_id: string
  buyer_id: number | null
  buyer_nickname: string | null
  status: string
  date_created: string
  total_amount: number
  currency_id: string
  shipping_status: string | null
  shipping_id: string | null
  packing_status: string | null
  items_json: string | null
  updated_at: string
}

interface Account { id: string; nickname: string }

// ── Component ──────────────────────────────────────────────────────────────

export default function MLOrdersPage() {
  const { toast } = useToast()

  const [accounts, setAccounts]         = useState<Account[]>([])
  const [accountId, setAccountId]       = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch]             = useState("")
  const [page, setPage]                 = useState(0)
  const [rows, setRows]                 = useState<MLOrder[]>([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(false)
  const [syncing, setSyncing]           = useState(false)
  const [lastSync, setLastSync]         = useState<string | null>(null)

  const searchRef = useRef(search)
  searchRef.current = search

  // ── Load accounts ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then(r => r.json())
      .then(d => {
        if (d.accounts?.length) {
          setAccounts(d.accounts)
          setAccountId(d.accounts[0].id)
        }
      })
  }, [])

  // ── Load orders from DB ──────────────────────────────────────────────────

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(PAGE_SIZE),
        ...(accountId !== "all"  ? { account_id: accountId }   : {}),
        ...(statusFilter !== "all" ? { status: statusFilter }   : {}),
        ...(searchRef.current.trim() ? { q: searchRef.current.trim() } : {}),
      })
      const res  = await fetch(`/api/ml/orders?${params}`)
      const data = await res.json()
      if (data.ok) {
        setRows(data.rows ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [accountId, statusFilter])

  useEffect(() => { setPage(0); load(0) }, [accountId, statusFilter, load])
  useEffect(() => { load(page) }, [page, load])

  // ── Sync from ML ─────────────────────────────────────────────────────────

  const syncOrders = async () => {
    if (!accountId || accountId === "all") {
      toast({ title: "Seleccioná una cuenta", variant: "destructive" })
      return
    }
    setSyncing(true)
    try {
      const res  = await fetch("/api/ml/sync-orders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ account_id: accountId }),
      })
      const data = await res.json()
      if (data.ok) {
        setLastSync(new Date().toISOString())
        toast({ title: `Sincronizadas ${data.synced} órdenes`, description: `Total en ML: ${data.total}` })
        load(0)
      } else if (data.rate_limited) {
        toast({ title: "Rate limit ML", description: "Esperá unos segundos y reintentá.", variant: "destructive" })
      } else {
        toast({ title: "Error al sincronizar", description: data.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" })
    } finally {
      setSyncing(false)
    }
  }

  // ── Items parser ─────────────────────────────────────────────────────────

  const parseItems = (json: string | null) => {
    if (!json) return []
    try { return JSON.parse(json) as { title: string; quantity: number; unit_price: number; ml_item_id: string | null }[] }
    catch { return [] }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            Ventas ML
          </h1>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Última sync: {relDate(lastSync)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={syncOrders}
            disabled={syncing || accountId === "all"}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar ML"}
          </Button>
          <Link href="/billing/mercadolibre">
            <Button size="sm" variant="default">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Facturar
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {accounts.length > 1 && (
          <Select value={accountId} onValueChange={v => { setAccountId(v); setPage(0) }}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Cuenta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.nickname}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0) }}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Buscar comprador o ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (setPage(0), load(0))}
          />
        </div>

        <span className="text-xs text-muted-foreground">
          {total.toLocaleString("es-AR")} orden{total !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Empty state — no sync yet */}
      {!loading && rows.length === 0 && total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="rounded-full bg-muted/30 p-5">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <div>
            <p className="font-semibold">Sin órdenes en la base de datos</p>
            <p className="text-sm text-muted-foreground mt-1">
              Seleccioná una cuenta y hacé clic en "Sincronizar ML" para traer las órdenes.
            </p>
          </div>
          <Button
            size="sm"
            onClick={syncOrders}
            disabled={syncing || accountId === "all"}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar ML
          </Button>
        </div>
      )}

      {/* Table */}
      {(rows.length > 0 || loading) && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Orden</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Comprador</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Items</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Envío</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-3.5 rounded bg-muted/40 animate-pulse" style={{ width: `${60 + (j * 7) % 30}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map(order => {
                      const items = parseItems(order.items_json)
                      const shipColor = SHIP_STATUS_COLOR[order.shipping_status ?? ""] ?? "text-muted-foreground"
                      const shipLabel = SHIP_STATUS_LABEL[order.shipping_status ?? ""] ?? order.shipping_status ?? "—"

                      return (
                        <tr key={order.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                          {/* Orden ID */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-muted-foreground">
                              #{order.ml_order_id}
                            </span>
                          </td>

                          {/* Fecha */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {relDate(order.date_created)}
                          </td>

                          {/* Comprador */}
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium">{order.buyer_nickname ?? order.buyer_id}</span>
                          </td>

                          {/* Items */}
                          <td className="px-4 py-3 max-w-[260px]">
                            {items.length === 0
                              ? <span className="text-xs text-muted-foreground">—</span>
                              : (
                                <div className="space-y-0.5">
                                  {items.slice(0, 2).map((it, i) => (
                                    <div key={i} className="flex items-start gap-1.5">
                                      <Package className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                                      <span className="text-xs leading-tight line-clamp-1">
                                        {it.quantity > 1 && <span className="font-semibold text-primary mr-0.5">{it.quantity}×</span>}
                                        {it.title}
                                      </span>
                                    </div>
                                  ))}
                                  {items.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground pl-4">+{items.length - 2} más</span>
                                  )}
                                </div>
                              )
                            }
                          </td>

                          {/* Total */}
                          <td className="px-4 py-3 text-right font-semibold text-sm whitespace-nowrap">
                            {fmt(order.total_amount, order.currency_id)}
                          </td>

                          {/* Estado orden */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                              ORDER_STATUS_COLOR[order.status] ?? "bg-muted/30 text-muted-foreground border-border"
                            }`}>
                              {order.status === "paid"
                                ? <CheckCircle2 className="h-2.5 w-2.5" />
                                : order.status === "cancelled"
                                ? <AlertCircle className="h-2.5 w-2.5" />
                                : <Clock className="h-2.5 w-2.5" />
                              }
                              {ORDER_STATUS_LABEL[order.status] ?? order.status}
                            </span>
                          </td>

                          {/* Envío */}
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1 text-xs ${shipColor}`}>
                              <Truck className="h-3 w-3 flex-shrink-0" />
                              {shipLabel}
                            </span>
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Ver en ML */}
                              <a
                                href={`https://www.mercadolibre.com.ar/ventas/${order.ml_order_id}/detalle`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-muted/40 transition-colors"
                                title="Ver en ML"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </a>

                              {/* Facturar */}
                              {order.status === "paid" && (
                                <Link
                                  href={`/billing/mercadolibre?order_id=${order.ml_order_id}&account_id=${order.account_id}`}
                                  className="p-1 rounded hover:bg-muted/40 transition-colors"
                                  title="Facturar"
                                >
                                  <Receipt className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                </Link>
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

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPages} · {total.toLocaleString("es-AR")} órdenes
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
