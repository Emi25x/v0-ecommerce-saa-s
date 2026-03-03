"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge }    from "@/components/ui/badge"
import {
  Receipt, RefreshCw, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  FileText, Zap, Filter, Calendar, Building2, AlertTriangle, X,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────
interface MLOrder {
  id:           number
  fecha:        string
  estado:       string
  total:        number
  moneda:       string
  comprador:    string
  items:        { titulo: string; cantidad: number; precio: number }[]
  facturada:    boolean
  factura_info: any
}

interface MLAccount {
  seller_id: string
  nickname:  string
}

interface Empresa {
  id:             string
  razon_social:   string
  nombre_empresa: string | null
  cuit:           string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ESTADO_OPTS = [
  { value: "all",       label: "Todos los estados" },
  { value: "paid",      label: "Pagadas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "pending",   label: "Pendientes" },
]

const FACTURADO_OPTS = [
  { value: "all", label: "Todas" },
  { value: "no",  label: "Sin facturar" },
  { value: "si",  label: "Ya facturadas" },
]

function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    paid:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
    pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  }
  const labels: Record<string, string> = { paid: "Pagada", cancelled: "Cancelada", pending: "Pendiente" }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[estado] || "bg-muted/30 text-muted-foreground border-border"}`}>
      {labels[estado] || estado}
    </span>
  )
}

function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n)
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function MLBillingPage() {
  // Cuentas ML y empresas
  const [accounts,       setAccounts]       = useState<MLAccount[]>([])
  const [empresas,       setEmpresas]       = useState<Empresa[]>([])
  const [activeAccount,  setActiveAccount]  = useState<string>("")
  const [activeEmpresa,  setActiveEmpresa]  = useState<string>("")

  // Filtros
  const [filterEstado,    setFilterEstado]    = useState("all")
  const [filterFacturado, setFilterFacturado] = useState("no")
  const [fechaDesde,      setFechaDesde]      = useState("")
  const [fechaHasta,      setFechaHasta]      = useState("")

  // Datos
  const [orders,     setOrders]     = useState<MLOrder[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const LIMIT = 50

  // Selección para facturación masiva
  const [selected,        setSelected]        = useState<Set<number>>(new Set())
  const [emittingBatch,   setEmittingBatch]   = useState(false)
  const [batchResult,     setBatchResult]     = useState<{ ok: number; err: number } | null>(null)
  const [batchLog,        setBatchLog]        = useState<string[]>([])

  // ── Load accounts & empresas ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [r1, r2] = await Promise.all([
        fetch("/api/ml/accounts"),
        fetch("/api/billing/config"),
      ])
      const d1 = await r1.json()
      const d2 = await r2.json()

      if (d1.accounts?.length) {
        setAccounts(d1.accounts)
        const saved = localStorage.getItem("billing_ml_account")
        const match = d1.accounts.find((a: MLAccount) => a.seller_id === saved)
        setActiveAccount((match || d1.accounts[0]).seller_id)
      }
      if (d2.empresas?.length) {
        setEmpresas(d2.empresas)
        const saved = localStorage.getItem("billing_empresa_activa")
        const match = d2.empresas.find((e: Empresa) => e.id === saved)
        setActiveEmpresa((match || d2.empresas[0]).id)
      }
    }
    load()
  }, [])

  // ── Load orders ────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async (p = 0) => {
    if (!activeAccount) return
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        account_id: activeAccount,
        page:       String(p + 1),
        limit:      String(LIMIT),
        ...(filterEstado    !== "all" && { estado:    filterEstado }),
        ...(filterFacturado !== "all" && { facturado: filterFacturado }),
        ...(fechaDesde && { fecha_desde: fechaDesde }),
        ...(fechaHasta && { fecha_hasta: fechaHasta }),
      })
      const r = await fetch(`/api/billing/ml-ventas?${params}`)
      const d = await r.json()
      if (d.ok) { setOrders(d.orders); setTotal(d.total); setSelected(new Set()) }
      else setError(d.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeAccount, filterEstado, filterFacturado, fechaDesde, fechaHasta])

  useEffect(() => { loadOrders(page) }, [loadOrders, page])
  useEffect(() => { setPage(0) }, [activeAccount, filterEstado, filterFacturado, fechaDesde, fechaHasta])

  // ── Selección ──────────────────────────────────────────────────────────────
  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const selectAll   = () => setSelected(new Set(orders.filter(o => !o.facturada).map(o => o.id)))
  const clearSelect = () => setSelected(new Set())
  const selectedOrders = orders.filter(o => selected.has(o.id))
  const totalSelected  = selectedOrders.reduce((s, o) => s + o.total, 0)

  // ── Facturación masiva ─────────────────────────────────────────────────────
  const emitBatch = async () => {
    if (!selectedOrders.length || !activeEmpresa) return
    setEmittingBatch(true); setBatchResult(null); setBatchLog([])

    let ok = 0; let err = 0
    const log: string[] = []

    for (const order of selectedOrders) {
      try {
        // Emitir factura por esta orden
        const r = await fetch("/api/billing/facturas", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            empresa_id:             activeEmpresa,
            tipo_comprobante:       "6",   // Factura B por defecto
            concepto:               "1",
            tipo_doc_receptor:      "99",
            nro_doc_receptor:       "",
            receptor_nombre:        order.comprador,
            receptor_condicion_iva: "consumidor_final",
            moneda:                 order.moneda === "ARS" ? "PES" : order.moneda,
            items: order.items.map(i => ({
              descripcion:     i.titulo,
              cantidad:        i.cantidad,
              precio_unitario: i.precio,
              alicuota_iva:    21,
            })),
          }),
        })
        const d = await r.json()
        if (d.ok) {
          // Registrar en ml_order_facturas
          await fetch("/api/billing/ml-ventas", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              ml_order_ids:   [order.id],
              ml_account_id:  activeAccount,
              factura_id:     d.factura?.id,
              empresa_id:     activeEmpresa,
            }),
          })
          ok++
          log.push(`#${order.id} — ${order.comprador} — ${fmtARS(order.total)} — OK`)
        } else {
          err++
          log.push(`#${order.id} — ${order.comprador} — ERROR: ${d.error}`)
        }
      } catch (e: any) {
        err++
        log.push(`#${order.id} — ERROR: ${e.message}`)
      }
      setBatchLog([...log])
    }

    setBatchResult({ ok, err })
    setEmittingBatch(false)
    loadOrders(page)
  }

  const empresaActiva = empresas.find(e => e.id === activeEmpresa)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col gap-5 p-6 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
            </svg>
            Ventas MercadoLibre
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Facturá tus ventas de ML en masa o individualmente</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadOrders(page)} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Selección de cuenta ML y empresa */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Cuentas ML */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Cuenta MercadoLibre</Label>
          <div className="flex gap-2 flex-wrap">
            {accounts.map(acc => (
              <button
                key={acc.seller_id}
                onClick={() => { setActiveAccount(acc.seller_id); localStorage.setItem("billing_ml_account", acc.seller_id) }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  activeAccount === acc.seller_id
                    ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-300"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
                </svg>
                {acc.nickname}
              </button>
            ))}
            {accounts.length === 0 && (
              <span className="text-sm text-muted-foreground">No hay cuentas ML vinculadas</span>
            )}
          </div>
        </div>

        <div className="w-px h-10 bg-border hidden md:block" />

        {/* Empresa emisora */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Factura a nombre de</Label>
          <div className="flex gap-2 flex-wrap">
            {empresas.map(emp => (
              <button
                key={emp.id}
                onClick={() => { setActiveEmpresa(emp.id); localStorage.setItem("billing_empresa_activa", emp.id) }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  activeEmpresa === emp.id
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                {emp.nombre_empresa || emp.razon_social}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Estado de venta</Label>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{ESTADO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Facturación</Label>
            <Select value={filterFacturado} onValueChange={setFilterFacturado}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{FACTURADO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" className="h-8 text-xs w-36" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" className="h-8 text-xs w-36" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
          </div>
          {(filterEstado !== "all" || filterFacturado !== "no" || fechaDesde || fechaHasta) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground mt-4"
              onClick={() => { setFilterEstado("all"); setFilterFacturado("no"); setFechaDesde(""); setFechaHasta("") }}>
              <X className="h-3 w-3" />Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Barra de acción masiva */}
      {selected.size > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{selected.size}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{selected.size} venta{selected.size !== 1 ? "s" : ""} seleccionada{selected.size !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">{fmtARS(totalSelected)}</span></p>
            </div>
            {empresaActiva && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-md px-2 py-1">
                <Building2 className="h-3 w-3" />
                {empresaActiva.nombre_empresa || empresaActiva.razon_social}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={clearSelect}>Deseleccionar todo</Button>
            <Button size="sm" className="gap-2 h-8" onClick={emitBatch} disabled={emittingBatch || !activeEmpresa}>
              {emittingBatch
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Facturando...</>
                : <><Zap className="h-3.5 w-3.5" />Facturar {selected.size} venta{selected.size !== 1 ? "s" : ""}</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* Resultado batch */}
      {batchResult && (
        <div className={`rounded-lg border p-4 space-y-3 ${batchResult.err === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex items-center gap-3">
            {batchResult.err === 0
              ? <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              : <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
            }
            <div>
              <p className="text-sm font-semibold">
                {batchResult.ok} factura{batchResult.ok !== 1 ? "s" : ""} emitida{batchResult.ok !== 1 ? "s" : ""} correctamente
                {batchResult.err > 0 && ` · ${batchResult.err} con error`}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" onClick={() => setBatchResult(null)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          {batchLog.length > 0 && (
            <div className="rounded-md bg-black/20 p-3 space-y-1 max-h-40 overflow-y-auto">
              {batchLog.map((l, i) => (
                <p key={i} className={`text-xs font-mono ${l.includes("ERROR") ? "text-red-400" : "text-emerald-400"}`}>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3 text-sm text-red-400">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header de tabla */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {loading ? "Cargando..." : `${total.toLocaleString("es-AR")} venta${total !== 1 ? "s" : ""}`}
            </span>
            {orders.some(o => !o.facturada) && (
              <button onClick={selectAll} className="text-xs text-primary hover:text-primary/80 transition-colors">
                Seleccionar sin facturar
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <span className="text-xs text-muted-foreground">{selected.size} seleccionada{selected.size !== 1 ? "s" : ""}</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />Cargando ventas...
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Receipt className="h-8 w-8 opacity-30" />
            <p className="text-sm">No hay ventas con los filtros seleccionados</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {orders.map(order => (
              <div
                key={order.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/10 ${selected.has(order.id) ? "bg-primary/5" : ""}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => !order.facturada && toggleSelect(order.id)}
                  disabled={order.facturada}
                  className={`mt-0.5 h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    order.facturada
                      ? "border-border cursor-default opacity-40"
                      : selected.has(order.id)
                        ? "border-primary bg-primary"
                        : "border-border hover:border-primary/60"
                  }`}
                >
                  {selected.has(order.id) && <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="currentColor"><path d="M8.5 2.5L4 7 1.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                </button>

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-muted-foreground">#{order.id}</span>
                    {estadoBadge(order.estado)}
                    {order.facturada && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />Facturada
                        {order.factura_info?.facturas?.numero && ` · #${String(order.factura_info.facturas.numero).padStart(8,"0")}`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-1 truncate">{order.comprador}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtFecha(order.fecha)} · {order.items.map(i => `${i.cantidad}x ${i.titulo}`).join(", ")}
                  </p>
                </div>

                {/* Total + acción */}
                <div className="flex-shrink-0 text-right flex flex-col items-end gap-2">
                  <p className="text-sm font-semibold">{fmtARS(order.total)}</p>
                  {!order.facturada ? (
                    <button
                      onClick={() => { setSelected(new Set([order.id])) }}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                    >
                      <FileText className="h-3 w-3" />Facturar
                    </button>
                  ) : (
                    order.factura_info?.factura_id && (
                      <a
                        href={`/api/billing/facturas/${order.factura_info.factura_id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <FileText className="h-3 w-3" />Ver PDF
                      </a>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginación */}
        {total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {Math.ceil(total / LIMIT)} · {total.toLocaleString("es-AR")} ventas
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
