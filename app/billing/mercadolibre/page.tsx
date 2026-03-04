"use client"

import { useState, useEffect, useCallback } from "react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge }    from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Receipt, RefreshCw, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  FileText, Zap, Filter, Building2, AlertTriangle, ShoppingCart, Info, Download,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────
interface MLOrder {
  id:                  number
  fecha:               string
  estado:              string
  envio_status:        string | null
  envio_substatus:     string | null
  total:               number
  moneda:              string
  comprador:           string
  comprador_doc:       string | null
  comprador_doc_tipo:  string | null
  buyer_id:            string
  items:               { titulo: string; ean: string | null; cantidad: number; precio: number }[]
  facturada:           boolean
  factura_info:        any
}

interface MLAccount {
  id:          string
  ml_user_id:  string
  nickname:    string
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

const ENVIO_OPTS = [
  { value: "all",          label: "Todos los envíos" },
  { value: "delivered",    label: "Entregadas" },
  { value: "shipped",      label: "En camino" },
  { value: "ready_to_ship", label: "Listas para enviar" },
  { value: "not_delivered", label: "No entregadas" },
]

const FACTURADO_OPTS = [
  { value: "all", label: "Todas" },
  { value: "no",  label: "Sin facturar" },
  { value: "si",  label: "Ya facturadas" },
]

function EnvioBadge({ estado }: { estado?: string }) {
  if (!estado) return <span className="text-xs text-muted-foreground/40">—</span>
  const map: Record<string, string> = {
    delivered:      "bg-blue-500/15 text-blue-400 border-blue-500/30",
    shipped:        "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    ready_to_ship:  "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    not_delivered:  "bg-red-500/15 text-red-400 border-red-500/30",
    cancelled:      "bg-red-500/15 text-red-400 border-red-500/30",
    pending:        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  }
  const labels: Record<string, string> = {
    delivered: "Entregada", shipped: "En camino", ready_to_ship: "Lista enviar",
    not_delivered: "No entregada", cancelled: "Cancelado", pending: "Pendiente",
  }
  const cls = map[estado] || "bg-muted text-muted-foreground border-border"
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {labels[estado] || estado}
    </span>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    paid:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    delivered: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
    pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  }
  const labels: Record<string, string> = {
    paid: "Pagada", delivered: "Entregada", cancelled: "Cancelada", pending: "Pendiente",
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[estado] ?? "bg-muted/30 text-muted-foreground border-border"}`}>
      {labels[estado] ?? estado}
    </span>
  )
}

function fmtARS(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(n)
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function MLBillingPage() {
  // Cuentas ML y empresas ARCA
  const [accounts,      setAccounts]      = useState<MLAccount[]>([])
  const [empresas,      setEmpresas]      = useState<Empresa[]>([])
  const [activeAccount, setActiveAccount] = useState<string>("")
  const [activeEmpresa, setActiveEmpresa] = useState<string>("")
  const [loadingSetup,  setLoadingSetup]  = useState(true)

  // Filtros — por defecto: pagadas, entregadas, sin facturar
  const [filterEstado,    setFilterEstado]    = useState("paid")
  const [filterEnvio,     setFilterEnvio]     = useState("delivered")
  const [filterFacturado, setFilterFacturado] = useState("no")
  const [fechaDesde,      setFechaDesde]      = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split("T")[0])

  // Datos
  const [orders,  setOrders]  = useState<MLOrder[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const LIMIT = 50

  // Selección masiva
  const [selected,      setSelected]      = useState<Set<number>>(new Set())
  const [emittingBatch, setEmittingBatch] = useState(false)
  const [batchResult,   setBatchResult]   = useState<{ ok: number; err: number; errors: string[] } | null>(null)

  // ── Conectar nueva cuenta ML ───────────────────────────────────────────────
  const conectarML = async () => {
    try {
      const res  = await fetch("/api/mercadolibre/generate-link", { method: "POST" })
      const data = await res.json()
      if (res.ok && data.url) {
        const target = window.top || window
        target.location.href = data.url
      }
    } catch { /* ignorar */ }
  }

  // ── Cargar cuentas ML y empresas ARCA ─────────────────────────────────────
  useEffect(() => {
    const loadSetup = async () => {
      setLoadingSetup(true)
      const [accRes, empRes] = await Promise.all([
        fetch("/api/ml/accounts"),
        fetch("/api/billing/config"),
      ])
      const accData = await accRes.json()
      const empData = await empRes.json()

      const accs: MLAccount[] = (accData.accounts || []).map((a: any) => ({
        id:         a.id,
        ml_user_id: a.ml_user_id,
        nickname:   a.nickname,
      }))
      const emps: Empresa[] = empData.empresas || []

      setAccounts(accs)
      setEmpresas(emps)
      if (accs[0]) setActiveAccount(accs[0].id)
      if (emps[0]) setActiveEmpresa(emps[0].id)
      setLoadingSetup(false)
    }
    loadSetup()
  }, [])

  // ── Cargar órdenes ────────────────────────────────────────────────────────
  const loadOrders = useCallback(async (p = 0) => {
    if (!activeAccount) return
    setLoading(true); setError(null); setSelected(new Set())
    try {
      const params = new URLSearchParams({
        account_id:   activeAccount,
        page:         String(p + 1),
        limit:        String(LIMIT),
        facturado:    filterFacturado === "all" ? "" : filterFacturado,
        fecha_desde:  fechaDesde ? `${fechaDesde}T00:00:00.000Z` : "",
        fecha_hasta:  fechaHasta ? `${fechaHasta}T23:59:59.000Z` : "",
      })
      if (filterEstado !== "all") params.set("estado",       filterEstado)
      if (filterEnvio  !== "all") params.set("estado_envio", filterEnvio)

      const res  = await fetch(`/api/billing/ml-ventas?${params}`)
      const data = await res.json()
      if (!res.ok || !data.ok) { setError(data.error || "Error cargando órdenes"); return }
      setOrders(data.orders); setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [activeAccount, filterEstado, filterEnvio, filterFacturado, fechaDesde, fechaHasta])

  useEffect(() => { if (activeAccount) { setPage(0); loadOrders(0) } }, [activeAccount, filterEstado, filterEnvio, filterFacturado])

  // ── Selección ─────────────────────────────────────────────────────────────
  const toggleOrder = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const toggleAll = () => {
    const unfacturadas = orders.filter(o => !o.facturada).map(o => o.id)
    if (selected.size === unfacturadas.length) setSelected(new Set())
    else setSelected(new Set(unfacturadas))
  }

  // ── Facturación masiva ────────────────────────────────────────────────────
  const emitirMasivo = async () => {
    if (!selected.size || !activeEmpresa || !activeAccount) return
    setEmittingBatch(true); setBatchResult(null)

    const selOrders = orders.filter(o => selected.has(o.id))
    let ok = 0; let err = 0; const errs: string[] = []

    for (const order of selOrders) {
      try {
        // Emitir factura para esta orden
        // Para Factura C: IVA = 0, precio_unitario es el precio final (IVA incluido)
        // ARCA exige: ImpIVA = 0, ImpNeto = ImpTotal, no informar objeto IVA
        // Los importes se redondean a 2 decimales máx (ARCA rechaza más)
        const round2 = (n: number) => Math.round(n * 100) / 100

        // Mapear tipo de doc ML → código ARCA
        // ML devuelve doc_type: "DNI" → 96, "CUIT"/"CUIL" → 80, otros → 99
        const docNum  = (order as any).comprador_doc
        const docTipo = (order as any).comprador_doc_tipo || ""
        const tipoDoc = docNum
          ? (["CUIT","CUIL"].includes(docTipo) ? 80 : 96)
          : 99
        const nroDoc  = docNum ? String(docNum).replace(/\D/g, "") : "0"

        const facRes = await fetch("/api/billing/facturas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa_id:             activeEmpresa,
            tipo_comprobante:       11,  // Factura C
            concepto:               1,
            tipo_doc_receptor:      tipoDoc,
            nro_doc_receptor:       nroDoc,
            receptor_nombre:        order.comprador || "Consumidor Final",
            receptor_condicion_iva: "consumidor_final",
            items: order.items.map(i => ({
              descripcion:     i.titulo || "Venta ML",
              cantidad:        i.cantidad,
              precio_unitario: round2(i.precio),
              alicuota_iva:    0,   // Factura C: IVA = 0, no se informa objeto IVA
            })),
          }),
        })
        const facData = await facRes.json()
        if (facData.ok) {
          // Registrar la orden como facturada
          await fetch("/api/billing/ml-ventas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ml_order_ids:   [order.id],
              ml_account_id:  activeAccount,
              factura_id:     facData.factura?.id,
              empresa_id:     activeEmpresa,
            }),
          })
          ok++
        } else {
          err++; errs.push(`Orden #${order.id}: ${facData.error || "Error"}`)
        }
      } catch (e: any) {
        err++; errs.push(`Orden #${order.id}: ${e.message}`)
      }
    }

    setBatchResult({ ok, err, errors: errs })
    setEmittingBatch(false)
    loadOrders(page)
  }

  // ── Búsqueda con Enter ────────────────────────────────────────────────────
  const handleBuscar = () => { setPage(0); loadOrders(0) }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadingSetup) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!accounts.length) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Ventas MercadoLibre</h1>
        <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <svg className="h-6 w-6 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">No hay cuentas de MercadoLibre conectadas</p>
            <p className="text-sm text-muted-foreground mt-1">
              Conectá tu cuenta para ver las ventas y facturarlas directamente a ARCA.
            </p>
          </div>
          <Button onClick={conectarML} className="gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" /></svg>
            Conectar cuenta MercadoLibre
          </Button>
        </div>
      </div>
    )
  }

  const unfacturadas = orders.filter(o => !o.facturada)
  const allSelected  = unfacturadas.length > 0 && selected.size === unfacturadas.length
  const totalSelected = orders.filter(o => selected.has(o.id)).reduce((s, o) => s + o.total, 0)

  return (
    <div className="space-y-5 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas MercadoLibre</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Consultá tus ventas y facturálas directamente a ARCA</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadOrders(page)} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Selector de cuenta ML + empresa ARCA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cuenta MercadoLibre</Label>
          <div className="flex flex-wrap gap-2">
            {accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => setActiveAccount(acc.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  activeAccount === acc.id
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
            <button
              onClick={conectarML}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-yellow-500/40 px-3 py-2 text-xs text-yellow-400/70 hover:text-yellow-300 hover:border-yellow-500/70 transition-colors"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v16m8-8H4" /></svg>
              Conectar otra cuenta
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Empresa para facturar (ARCA)</Label>
          {empresas.length ? (
            <div className="flex flex-wrap gap-2">
              {empresas.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => setActiveEmpresa(emp.id)}
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
          ) : (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Configurá al menos una empresa en Facturación → Configuración
            </p>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Estado de la venta</Label>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estado del envío</Label>
            <Select value={filterEnvio} onValueChange={setFilterEnvio}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENVIO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estado de facturación</Label>
            <Select value={filterFacturado} onValueChange={setFilterFacturado}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FACTURADO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" className="h-8 text-xs" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <div className="flex gap-2">
              <Input type="date" className="h-8 text-xs flex-1" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
              <Button size="sm" className="h-8 px-3 text-xs" onClick={handleBuscar}>Buscar</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de acción masiva */}
      {selected.size > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">{selected.size} ventas seleccionadas</p>
              <p className="text-xs text-muted-foreground">Total: {fmtARS(totalSelected)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              Se emitirá Factura C — Consumidor Final por cada venta
            </div>
            <Button
              onClick={emitirMasivo}
              disabled={emittingBatch || !activeEmpresa}
              className="gap-2"
            >
              {emittingBatch
                ? <><RefreshCw className="h-4 w-4 animate-spin" />Facturando...</>
                : <><FileText className="h-4 w-4" />Facturar {selected.size} ventas</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* Resultado batch */}
      {batchResult && (
        <div className={`rounded-lg border p-4 flex items-start gap-3 ${
          batchResult.err === 0
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}>
          {batchResult.err === 0
            ? <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            : <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          }
          <div>
            <p className="text-sm font-semibold">
              {batchResult.ok} factura{batchResult.ok !== 1 ? "s" : ""} emitida{batchResult.ok !== 1 ? "s" : ""} correctamente
              {batchResult.err > 0 && ` · ${batchResult.err} con error`}
            </p>
            {batchResult.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {batchResult.errors.map((e, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Tabla de órdenes */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Órdenes</span>
            <Badge variant="secondary" className="text-xs">{total.toLocaleString("es-AR")}</Badge>
          </div>
          {unfacturadas.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {allSelected ? "Deseleccionar todas" : `Seleccionar ${unfacturadas.length} sin facturar`}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <ShoppingCart className="h-8 w-8 opacity-30" />
            <p className="text-sm">No hay ventas con los filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-10 px-4 py-2.5" />
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Orden</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Comprador</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Artículos</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado venta</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">Envío</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">Factura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map(order => (
                  <tr
                    key={order.id}
                    className={`transition-colors ${
                      selected.has(order.id)
                        ? "bg-primary/5"
                        : "hover:bg-muted/20"
                    } ${order.facturada ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      {!order.facturada && (
                        <Checkbox
                          checked={selected.has(order.id)}
                          onCheckedChange={() => toggleOrder(order.id)}
                          aria-label={`Seleccionar orden ${order.id}`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{order.id}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtFecha(order.fecha)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm leading-tight">{order.comprador || "—"}</p>
                      {(order as any).comprador_doc ? (
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {(order as any).comprador_doc_tipo || "Doc"}: {(order as any).comprador_doc}
                        </p>
                      ) : (
                        <button
                          className="text-[10px] text-blue-400 hover:underline mt-0.5"
                          onClick={async () => {
                            const r = await fetch(`/api/mercadolibre/debug-order?account_id=${activeAccount}&order_id=${order.id}`)
                            const d = await r.json()
                            alert(JSON.stringify(d, null, 2))
                          }}
                        >
                          [ver datos ML]
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {order.items.slice(0, 2).map((item: any, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground truncate">
                          <span>{item.cantidad > 1 ? `${item.cantidad}x ` : ""}{item.titulo}</span>
                          {item.ean && <span className="ml-1 text-[10px] text-muted-foreground/50 font-mono">[{item.ean}]</span>}
                        </div>
                      ))}
                      {order.items.length > 2 && (
                        <p className="text-xs text-muted-foreground/60">+{order.items.length - 2} más</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtARS(order.total)}</td>
                    <td className="px-4 py-3 text-center"><EstadoBadge estado={order.estado} /></td>
                    <td className="px-4 py-3 text-center"><EnvioBadge estado={order.envio_status} /></td>
                    <td className="px-4 py-3 text-center">
                      {order.facturada ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {order.factura_info?.facturado_at
                              ? new Date(order.factura_info.facturado_at).toLocaleDateString("es-AR")
                              : "Sí"
                            }
                          </span>
                          {order.factura_info?.factura_id && (
                            <a
                              href={`/api/billing/facturas/${order.factura_info.factura_id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
                            >
                              <Download className="h-3 w-3" />PDF
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Mostrando {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} de {total}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                onClick={() => { setPage(p => p - 1); loadOrders(page - 1) }} disabled={page === 0 || loading}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{page + 1} / {Math.ceil(total / LIMIT)}</span>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                onClick={() => { setPage(p => p + 1); loadOrders(page + 1) }} disabled={(page + 1) * LIMIT >= total || loading}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
