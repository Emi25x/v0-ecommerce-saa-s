"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Ban,
  Eye,
  RotateCcw,
  X,
  ChevronDown,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

interface SalesOrder {
  id: string
  platform: string
  platform_code: string | null
  platform_order_id: string
  account_id: string | null
  empresa_id: string | null
  company_name: string | null
  libral_reference: string | null
  customer_name: string | null
  order_date: string
  total: number
  currency: string
  status: string
  payment_status: string | null
  libral_status: string
  export_error: string | null
  last_export_attempt_at: string | null
  sent_to_libral: boolean
  libral_sent_at: string | null
  cancelled_at: string | null
}

interface OrderDetail {
  order: SalesOrder & { empresa_name: string | null }
  items: Array<{
    id: string
    ean: string | null
    sku: string | null
    title: string
    quantity: number
    unit_price: number
    total_price: number
  }>
  exports: Array<{
    id: string
    action: string
    status: string
    reference: string
    payload_json: any
    response_text: string | null
    attempts: number
    last_error: string | null
    sent_at: string | null
    created_at: string
  }>
}

// ── Status helpers ───────────────────────────────────────────────────────────

const COMMERCIAL_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  confirmed: { label: "Confirmada", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  paid: { label: "Pagada", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  shipped: { label: "Enviada", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  delivered: { label: "Entregada", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelled: { label: "Cancelada", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
}

const LIBRAL_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  not_ready: { label: "No configurada", color: "text-muted-foreground", icon: Clock },
  pending_export: { label: "Pendiente", color: "text-yellow-600 dark:text-yellow-400", icon: Clock },
  export_blocked: { label: "Bloqueada", color: "text-red-600 dark:text-red-400", icon: AlertCircle },
  sent: { label: "Enviada", color: "text-green-600 dark:text-green-400", icon: CheckCircle2 },
  failed: { label: "Error", color: "text-red-600 dark:text-red-400", icon: XCircle },
  cancel_pending: { label: "Cancel pendiente", color: "text-orange-600 dark:text-orange-400", icon: Ban },
  cancelled_in_erp: { label: "Cancelada en ERP", color: "text-muted-foreground", icon: Ban },
  cancel_failed: { label: "Error al cancelar", color: "text-red-600 dark:text-red-400", icon: XCircle },
  cancelled_not_sent: { label: "No enviada (cancelada)", color: "text-muted-foreground", icon: Ban },
}

const QUICK_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "pending_export", label: "Pendientes" },
  { key: "exported", label: "Enviadas" },
  { key: "failed", label: "Con error" },
  { key: "missing_ean", label: "Sin EAN" },
  { key: "not_sent", label: "No enviadas" },
  { key: "cancelled", label: "Canceladas" },
]

const PLATFORM_OPTIONS = [
  { value: "", label: "Todos los canales" },
  { value: "C1", label: "C1" },
  { value: "C2", label: "C2" },
  { value: "C3", label: "C3" },
  { value: "C4", label: "C4" },
  { value: "SP1", label: "SP1" },
  { value: "SP2", label: "SP2" },
]

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 50, total_pages: 0 })
  const [filter, setFilter] = useState("all")
  const [platformCode, setPlatformCode] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  // Detail modal
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ id: string; msg: string; ok: boolean } | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), filter })
      if (platformCode) qs.set("platform_code", platformCode)
      if (search) qs.set("search", search)
      const res = await fetch(`/api/sales?${qs}`)
      if (!res.ok) return
      const json = await res.json()
      setOrders(json.orders ?? [])
      setPagination(json.pagination ?? { total: 0, page: 1, page_size: 50, total_pages: 0 })
    } finally {
      setLoading(false)
    }
  }, [page, filter, platformCode, search])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setSearch(val)
    }, 400)
  }

  function handleFilterChange(f: string) {
    setFilter(f)
    setPage(1)
  }

  async function openDetail(orderId: string) {
    setShowDetail(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/sales/${orderId}`)
      if (res.ok) setDetail(await res.json())
    } finally {
      setDetailLoading(false)
    }
  }

  async function pushOrder(orderId: string) {
    setActionLoading(orderId)
    setActionResult(null)
    try {
      const res = await fetch("/api/sales/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await res.json()
      setActionResult({ id: orderId, msg: data.error ?? "Enviado", ok: data.success })
      fetchOrders()
    } finally {
      setActionLoading(null)
    }
  }

  async function cancelOrder(orderId: string) {
    if (!confirm("Cancelar esta venta en Libral?")) return
    setActionLoading(orderId)
    setActionResult(null)
    try {
      const res = await fetch("/api/sales/cancel-libral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await res.json()
      setActionResult({ id: orderId, msg: data.error ?? "Cancelado", ok: data.success })
      fetchOrders()
    } finally {
      setActionLoading(null)
    }
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    return dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ventas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vista unificada de ventas con estado de exportación a Libral
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {pagination.total.toLocaleString("es-AR")} ventas
        </Badge>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => handleFilterChange(f.key)}
            className="text-xs h-7"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Search + platform filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por ID, cliente o referencia Libral..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full border rounded-lg pl-9 pr-4 py-2 text-sm bg-background"
          />
        </div>
        <select
          value={platformCode}
          onChange={(e) => { setPlatformCode(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm bg-background min-w-[140px]"
        >
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div className={`rounded-lg px-4 py-2 text-sm flex items-center justify-between ${actionResult.ok ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"}`}>
          <span>{actionResult.msg}</span>
          <button onClick={() => setActionResult(null)} className="ml-2"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Canal</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Nro. Venta</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Ref. Libral</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Empresa</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Comercial</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Libral</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Error</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
                    <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No hay ventas para este filtro.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const cs = COMMERCIAL_STATUS[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-800" }
                  const ls = LIBRAL_STATUS[order.libral_status] ?? { label: order.libral_status, color: "text-muted-foreground", icon: Clock }
                  const LsIcon = ls.icon

                  return (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(order.order_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-xs font-mono">
                          {order.platform_code ?? order.platform?.slice(0, 3).toUpperCase() ?? "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        {order.platform_order_id}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {order.libral_reference ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[140px] truncate">
                        {order.company_name ?? <span className="text-amber-500">Sin empresa</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cs.color}`}>
                          {cs.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${ls.color}`}>
                          <LsIcon className="h-3.5 w-3.5" />
                          {ls.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[180px]">
                        {order.export_error ? (
                          <span className="text-red-600 dark:text-red-400 line-clamp-1" title={order.export_error}>
                            {order.export_error}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(order.id)} title="Ver detalle">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {(order.libral_status === "failed" || order.libral_status === "export_blocked" || order.libral_status === "not_ready" || order.libral_status === "pending_export") && order.status !== "cancelled" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-600"
                              onClick={() => pushOrder(order.id)}
                              disabled={actionLoading === order.id}
                              title="Push manual a Libral"
                            >
                              {actionLoading === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          {order.libral_status === "sent" && order.status === "cancelled" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600"
                              onClick={() => cancelOrder(order.id)}
                              disabled={actionLoading === order.id}
                              title="Cancelar en Libral"
                            >
                              {actionLoading === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm text-muted-foreground">
            <span>
              {((page - 1) * pagination.page_size + 1).toLocaleString("es-AR")}–
              {Math.min(page * pagination.page_size, pagination.total).toLocaleString("es-AR")} de{" "}
              {pagination.total.toLocaleString("es-AR")}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={page >= pagination.total_pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDetail(false)}>
          <div className="bg-background rounded-xl border shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : detail ? (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Venta {detail.order.platform_code ?? detail.order.platform}-{detail.order.platform_order_id}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(detail.order.order_date).toLocaleString("es-AR")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDetail(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Empresa</p>
                    <p className="font-medium">{detail.order.empresa_name ?? detail.order.company_name ?? <span className="text-amber-500">Sin empresa</span>}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cliente</p>
                    <p className="font-medium">{detail.order.customer_name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Referencia Libral</p>
                    <p className="font-mono text-xs">{detail.order.libral_reference ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-medium">${Number(detail.order.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Estado comercial</p>
                    <p>{COMMERCIAL_STATUS[detail.order.status]?.label ?? detail.order.status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Estado Libral</p>
                    <p className={LIBRAL_STATUS[detail.order.libral_status]?.color ?? ""}>
                      {LIBRAL_STATUS[detail.order.libral_status]?.label ?? detail.order.libral_status}
                    </p>
                  </div>
                </div>

                {/* Error banner */}
                {detail.order.export_error && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-300">
                    <p className="font-medium mb-1">Error de exportación</p>
                    <p className="font-mono text-xs">{detail.order.export_error}</p>
                  </div>
                )}

                {/* Items */}
                <div>
                  <h3 className="font-medium text-sm mb-2">Líneas ({detail.items.length})</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Producto</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">EAN</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cant.</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">P. Unit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="px-3 py-2 max-w-[200px] truncate">{item.title}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {item.ean ? (
                                item.ean
                              ) : (
                                <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" /> SIN EAN
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              ${Number(item.unit_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Export history */}
                {detail.exports.length > 0 && (
                  <div>
                    <h3 className="font-medium text-sm mb-2">Historial de exports a Libral</h3>
                    <div className="space-y-2">
                      {detail.exports.map((exp) => (
                        <div key={exp.id} className="border rounded-lg px-4 py-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={exp.status === "sent" || exp.status === "cancelled_in_erp" ? "default" : "destructive"} className="text-xs">
                                {exp.action === "delete" ? "DELETE" : "CREATE"} — {exp.status}
                              </Badge>
                              <span className="text-muted-foreground">Intento #{exp.attempts}</span>
                            </div>
                            <span className="text-muted-foreground">
                              {new Date(exp.created_at).toLocaleString("es-AR")}
                            </span>
                          </div>
                          {exp.last_error && (
                            <p className="text-red-600 dark:text-red-400 font-mono">{exp.last_error}</p>
                          )}
                          {exp.response_text && (
                            <p className="text-muted-foreground font-mono">Respuesta: {exp.response_text}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  {(detail.order.libral_status === "failed" || detail.order.libral_status === "export_blocked" || detail.order.libral_status === "not_ready") && detail.order.status !== "cancelled" && (
                    <Button size="sm" onClick={() => { pushOrder(detail.order.id); setShowDetail(false) }} className="gap-1">
                      <Send className="h-3.5 w-3.5" /> Push manual
                    </Button>
                  )}
                  {detail.order.libral_status === "sent" && detail.order.status === "cancelled" && (
                    <Button size="sm" variant="destructive" onClick={() => { cancelOrder(detail.order.id); setShowDetail(false) }} className="gap-1">
                      <Ban className="h-3.5 w-3.5" /> Cancelar en Libral
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setShowDetail(false)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground">Error al cargar detalle</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
