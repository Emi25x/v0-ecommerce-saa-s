"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  ShoppingBag,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  ExternalLink,
  Receipt,
  Package,
  AlertCircle,
  CheckCircle2,
  Clock,
  Truck,
  UserSearch,
  X,
  FileText,
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const ORDER_STATUS_LABEL: Record<string, string> = {
  paid: "Pagada",
  payment_required: "Pago pendiente",
  payment_in_process: "Pago en proceso",
  partially_refunded: "Reembolso parcial",
  cancelled: "Cancelada",
  invalid: "Inválida",
}

const ORDER_STATUS_COLOR: Record<string, string> = {
  paid: "bg-green-500/15 text-green-400 border-green-500/30",
  payment_required: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  payment_in_process: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  partially_refunded: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  invalid: "bg-red-500/15 text-red-400 border-red-500/30",
}

const SHIP_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  handling: "Preparando",
  ready_to_ship: "Lista para enviar",
  shipped: "Enviada",
  delivered: "Entregada",
  not_delivered: "No entregada",
  cancelled: "Cancelada",
}

const SHIP_STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-400",
  handling: "text-blue-400",
  ready_to_ship: "text-sky-400",
  shipped: "text-indigo-400",
  delivered: "text-green-400",
  not_delivered: "text-red-400",
  cancelled: "text-zinc-400",
}

const FACTURA_ESTADO_COLOR: Record<string, string> = {
  emitida: "bg-green-500/15 text-green-400 border-green-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, currency = "ARS") =>
  n != null ? new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n) : "—"

const relDate = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Hoy"
  if (days === 1) return "Ayer"
  if (days < 30) return `Hace ${days}d`
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

const fmtDateFull = (iso: string | null | undefined) => {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ── Types ──────────────────────────────────────────────────────────────────

interface MLOrderItem {
  title: string
  quantity: number
  unit_price: number
  ml_item_id: string | null
}

interface FacturaInfo {
  estado: string
  cae: string | null
  numero: number | null
  tipo_comprobante: number | null
}

interface MLOrder {
  id: string
  ml_order_id: number
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
  items_json: MLOrderItem[] | string | null
  updated_at: string
  factura: FacturaInfo | null
}

interface BillingInfo {
  nombre: string | null
  doc_tipo: string | null
  doc_numero: string | null
  condicion_iva: string | null
  direccion: string | null
  billing_info_missing: boolean
}

interface Account {
  id: string
  nickname: string
}

// ── Billing state per order ────────────────────────────────────────────────
type BillingLoadState = "idle" | "loading" | "loaded" | "error"
interface BillingCache {
  state: BillingLoadState
  data?: BillingInfo
  error?: string
}

// ── parseItems ─────────────────────────────────────────────────────────────

const parseItems = (json: MLOrderItem[] | string | null): MLOrderItem[] => {
  if (!json) return []
  if (Array.isArray(json)) return json
  if (typeof json === "object") return []
  try {
    return JSON.parse(json) as MLOrderItem[]
  } catch {
    return []
  }
}

// ── OrderDetailSheet ───────────────────────────────────────────────────────

function OrderDetailSheet({
  order,
  billingCache,
  onClose,
  onFetchBilling,
}: {
  order: MLOrder | null
  billingCache: Record<string, BillingCache>
  onClose: () => void
  onFetchBilling: (order: MLOrder) => void
}) {
  if (!order) return null

  const items = parseItems(order.items_json)
  const billing = billingCache[order.ml_order_id]
  const shipLabel = SHIP_STATUS_LABEL[order.shipping_status ?? ""] ?? order.shipping_status ?? "—"
  const shipColor = SHIP_STATUS_COLOR[order.shipping_status ?? ""] ?? "text-muted-foreground"

  return (
    <Sheet open={!!order} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Orden #{order.ml_order_id}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {fmtDateFull(order.date_created)} · {order.buyer_nickname ?? order.buyer_id}
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-5">
          {/* Status grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Estado" value={ORDER_STATUS_LABEL[order.status] ?? order.status} />
            <StatCard label="Envío" value={shipLabel} valueClassName={shipColor} />
            <StatCard label="Total" value={fmt(order.total_amount, order.currency_id)} />
            <StatCard label="Packing" value={order.packing_status ?? "—"} />
          </div>

          {/* Factura status */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Comprobante</p>
            {order.factura ? (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                      FACTURA_ESTADO_COLOR[order.factura.estado] ?? "bg-muted/30 text-muted-foreground border-border"
                    }`}
                  >
                    {order.factura.estado}
                  </span>
                  {order.factura.numero && (
                    <span className="text-xs text-muted-foreground font-mono">
                      #{String(order.factura.numero).padStart(8, "0")}
                    </span>
                  )}
                </div>
                {order.factura.cae && (
                  <p className="text-xs text-muted-foreground">
                    CAE: <span className="font-mono">{order.factura.cae}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Sin comprobante emitido</p>
            )}
          </div>

          {/* Items */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Items ({items.length})</p>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin items</p>
            ) : (
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <span className="leading-tight line-clamp-2">{it.title}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {it.quantity} × {fmt(it.unit_price, order.currency_id)}
                      </p>
                      <p className="font-medium">{fmt(it.quantity * it.unit_price, order.currency_id)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Billing info */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Datos fiscales</p>
              {(!billing || billing.state === "idle" || billing.state === "error") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={() => onFetchBilling(order)}
                  disabled={billing?.state === "loading"}
                >
                  <UserSearch className="h-3 w-3 mr-1" />
                  {billing?.state === "error" ? "Reintentar" : "Obtener"}
                </Button>
              )}
            </div>

            {!billing || billing.state === "idle" ? (
              <p className="text-xs text-muted-foreground italic">No cargados</p>
            ) : billing.state === "loading" ? (
              <div className="space-y-1.5">
                {[80, 60, 70].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-muted/40 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : billing.state === "error" ? (
              <p className="text-xs text-red-400">{billing.error}</p>
            ) : (
              <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5 text-sm">
                {billing.data?.billing_info_missing && (
                  <p className="text-xs text-amber-400 mb-2">Sin datos fiscales en ML — se usará Consumidor Final</p>
                )}
                <BillingRow label="Nombre" value={billing.data?.nombre} />
                <BillingRow label="Doc. tipo" value={billing.data?.doc_tipo} />
                <BillingRow label="Doc. nro." value={billing.data?.doc_numero} />
                <BillingRow label="Cond. IVA" value={billing.data?.condicion_iva} />
                <BillingRow label="Domicilio" value={billing.data?.direccion} />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            <a
              href={`https://www.mercadolibre.com.ar/ventas/${order.ml_order_id}/detalle`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-md border border-border hover:bg-muted/40 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver en MercadoLibre
            </a>
            {order.status === "paid" && !order.factura && (
              <Link
                href={`/billing/mercadolibre?order_id=${order.ml_order_id}&account_id=${order.account_id}`}
                className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Receipt className="h-3.5 w-3.5" />
                Facturar esta orden
              </Link>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StatCard({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium mt-0.5 ${valueClassName}`}>{value}</p>
    </div>
  )
}

function BillingRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function MLOrdersPage() {
  const { toast } = useToast()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<MLOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [detailOrder, setDetailOrder] = useState<MLOrder | null>(null)
  const [billingCache, setBillingCache] = useState<Record<string, BillingCache>>({})
  // Track which rows are fetching billing inline (table row indicator)
  const [fetchingBilling, setFetchingBilling] = useState<Set<string>>(new Set())

  const searchRef = useRef(search)
  searchRef.current = search

  // ── Load accounts ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/ml/accounts")
      .then((r) => r.json())
      .then((d) => {
        if (d.accounts?.length) {
          setAccounts(d.accounts)
          setAccountId(d.accounts[0].id)
        }
      })
  }, [])

  // ── Load orders ──────────────────────────────────────────────────────────

  const load = useCallback(
    async (p = 0) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(PAGE_SIZE),
          ...(accountId !== "all" ? { account_id: accountId } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(searchRef.current.trim() ? { q: searchRef.current.trim() } : {}),
        })
        const res = await fetch(`/api/ml/orders?${params}`)
        const data = await res.json()
        if (data.ok) {
          setRows(data.rows ?? [])
          setTotal(data.total ?? 0)
        }
      } finally {
        setLoading(false)
      }
    },
    [accountId, statusFilter],
  )

  useEffect(() => {
    setPage(0)
    load(0)
  }, [accountId, statusFilter]) // eslint-disable-line
  useEffect(() => {
    if (page > 0) load(page)
  }, [page]) // eslint-disable-line

  // ── Sync from ML ─────────────────────────────────────────────────────────

  const syncOrders = async () => {
    if (!accountId || accountId === "all") {
      toast({ title: "Seleccioná una cuenta", variant: "destructive" })
      return
    }
    setSyncing(true)
    try {
      const res = await fetch("/api/ml/sync-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
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

  // ── Fetch billing info ────────────────────────────────────────────────────

  const fetchBilling = useCallback(
    async (order: MLOrder) => {
      const key = String(order.ml_order_id)
      setBillingCache((prev) => ({ ...prev, [key]: { state: "loading" } }))
      setFetchingBilling((prev) => new Set(prev).add(key))
      try {
        const res = await fetch(`/api/billing/ml-order-billing?account_id=${order.account_id}&order_id=${key}`)
        const data = await res.json()
        if (data.ok) {
          setBillingCache((prev) => ({ ...prev, [key]: { state: "loaded", data } }))
          if (data.billing_info_missing) {
            toast({
              title: "Sin datos fiscales en ML",
              description: "Se usará Consumidor Final al facturar.",
              variant: "destructive",
            })
          } else {
            toast({ title: "Datos fiscales obtenidos", description: data.nombre ?? "" })
          }
        } else {
          setBillingCache((prev) => ({ ...prev, [key]: { state: "error", error: data.error ?? "Error desconocido" } }))
          toast({ title: "Error al obtener datos fiscales", description: data.error, variant: "destructive" })
        }
      } catch (e: any) {
        setBillingCache((prev) => ({ ...prev, [key]: { state: "error", error: e.message } }))
        toast({ title: "Error de red", variant: "destructive" })
      } finally {
        setFetchingBilling((prev) => {
          const s = new Set(prev)
          s.delete(key)
          return s
        })
      }
    },
    [toast],
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-primary" />
              Ventas ML
            </h1>
            {lastSync && <p className="text-xs text-muted-foreground mt-0.5">Última sync: {relDate(lastSync)}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={syncOrders} disabled={syncing || accountId === "all"}>
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
            <Select
              value={accountId}
              onValueChange={(v) => {
                setAccountId(v)
                setPage(0)
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(0)
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="Buscar comprador o ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setPage(0), load(0))}
            />
          </div>

          <span className="text-xs text-muted-foreground">
            {total.toLocaleString("es-AR")} orden{total !== 1 ? "es" : ""}
          </span>
        </div>

        {/* Empty state */}
        {!loading && rows.length === 0 && total === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="rounded-full bg-muted/30 p-5">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <div>
              <p className="font-semibold">Sin órdenes en la base de datos</p>
              <p className="text-sm text-muted-foreground mt-1">
                Seleccioná una cuenta y hacé clic en "Sincronizar ML".
              </p>
            </div>
            <Button size="sm" onClick={syncOrders} disabled={syncing || accountId === "all"}>
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
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Factura</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {Array.from({ length: 9 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div
                                className="h-3.5 rounded bg-muted/40 animate-pulse"
                                style={{ width: `${60 + ((j * 7) % 30)}%` }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))
                    : rows.map((order) => {
                        const items = parseItems(order.items_json)
                        const shipColor = SHIP_STATUS_COLOR[order.shipping_status ?? ""] ?? "text-muted-foreground"
                        const shipLabel = SHIP_STATUS_LABEL[order.shipping_status ?? ""] ?? order.shipping_status ?? "—"
                        const key = String(order.ml_order_id)
                        const billing = billingCache[key]
                        const isFetchingBilling = fetchingBilling.has(key)

                        return (
                          <tr
                            key={order.id}
                            className="border-b border-border/50 hover:bg-muted/10 transition-colors cursor-pointer"
                            onClick={() => setDetailOrder(order)}
                          >
                            {/* Orden ID */}
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <span className="font-mono text-xs text-muted-foreground">#{order.ml_order_id}</span>
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
                            <td className="px-4 py-3 max-w-[240px]">
                              {items.length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div className="space-y-0.5">
                                  {items.slice(0, 2).map((it, i) => (
                                    <div key={i} className="flex items-start gap-1.5">
                                      <Package className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                                      <span className="text-xs leading-tight line-clamp-1">
                                        {it.quantity > 1 && (
                                          <span className="font-semibold text-primary mr-0.5">{it.quantity}×</span>
                                        )}
                                        {it.title}
                                      </span>
                                    </div>
                                  ))}
                                  {items.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground pl-4">
                                      +{items.length - 2} más
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Total */}
                            <td className="px-4 py-3 text-right font-semibold text-sm whitespace-nowrap">
                              {fmt(order.total_amount, order.currency_id)}
                            </td>

                            {/* Estado orden */}
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                                  ORDER_STATUS_COLOR[order.status] ?? "bg-muted/30 text-muted-foreground border-border"
                                }`}
                              >
                                {order.status === "paid" ? (
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                ) : order.status === "cancelled" ? (
                                  <AlertCircle className="h-2.5 w-2.5" />
                                ) : (
                                  <Clock className="h-2.5 w-2.5" />
                                )}
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

                            {/* Factura */}
                            <td className="px-4 py-3">
                              {order.factura ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                                    FACTURA_ESTADO_COLOR[order.factura.estado] ??
                                    "bg-muted/30 text-muted-foreground border-border"
                                  }`}
                                >
                                  <FileText className="h-2.5 w-2.5" />
                                  {order.factura.estado}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Acciones */}
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                {/* Ver detalle */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="p-1.5 rounded hover:bg-muted/40 transition-colors"
                                      onClick={() => setDetailOrder(order)}
                                    >
                                      <FileText className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Ver detalle</TooltipContent>
                                </Tooltip>

                                {/* Obtener datos fiscales */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className="p-1.5 rounded hover:bg-muted/40 transition-colors"
                                      onClick={() => fetchBilling(order)}
                                      disabled={isFetchingBilling || billing?.state === "loaded"}
                                    >
                                      <UserSearch
                                        className={`h-3.5 w-3.5 transition-colors ${
                                          billing?.state === "loaded"
                                            ? "text-green-400"
                                            : billing?.state === "error"
                                              ? "text-red-400"
                                              : isFetchingBilling
                                                ? "text-blue-400 animate-pulse"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                      />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    {billing?.state === "loaded"
                                      ? `${billing.data?.nombre ?? "Datos cargados"}`
                                      : billing?.state === "error"
                                        ? "Error — reintentar"
                                        : isFetchingBilling
                                          ? "Obteniendo..."
                                          : "Obtener datos fiscales"}
                                  </TooltipContent>
                                </Tooltip>

                                {/* Facturar */}
                                {order.status === "paid" && !order.factura && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Link
                                        href={`/billing/mercadolibre?order_id=${order.ml_order_id}&account_id=${order.account_id}`}
                                        className="p-1.5 rounded hover:bg-muted/40 transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Receipt className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                      </Link>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Facturar</TooltipContent>
                                  </Tooltip>
                                )}

                                {/* Ver en ML */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a
                                      href={`https://www.mercadolibre.com.ar/ventas/${order.ml_order_id}/detalle`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded hover:bg-muted/40 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Ver en ML</TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
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
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || loading}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Detail drawer */}
        <OrderDetailSheet
          order={detailOrder}
          billingCache={billingCache}
          onClose={() => setDetailOrder(null)}
          onFetchBilling={fetchBilling}
        />
      </div>
    </TooltipProvider>
  )
}
