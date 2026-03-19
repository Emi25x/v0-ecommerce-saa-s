"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Receipt,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Zap,
  Filter,
  Building2,
  AlertTriangle,
  ShoppingCart,
  Download,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────
interface ShopifyOrder {
  id: number
  fecha: string
  financial_status: string
  fulfillment_status: string | null
  total: number
  moneda: string
  comprador: string
  email: string | null
  items: { titulo: string; sku: string | null; cantidad: number; precio: number }[]
  billing_address: Record<string, string>
  note_attributes: { name: string; value: string }[]
  note: string | null
  facturada: boolean
  factura_info: any
}

interface ShopifyStore {
  id: string
  shop_domain: string
}

interface Empresa {
  id: string
  razon_social: string
  nombre_empresa: string | null
  cuit: string
  iva_default?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FINANCIAL_STATUS_OPTS = [
  { value: "any", label: "Todos los estados" },
  { value: "paid", label: "Pagadas" },
  { value: "partially_paid", label: "Parcialmente pagadas" },
  { value: "refunded", label: "Reembolsadas" },
  { value: "partially_refunded", label: "Parcialmente reembolsadas" },
  { value: "pending", label: "Pendientes" },
  { value: "voided", label: "Anuladas" },
]

const FULFILLMENT_STATUS_OPTS = [
  { value: "any", label: "Todos los envíos" },
  { value: "fulfilled", label: "Enviadas" },
  { value: "unfulfilled", label: "Sin enviar" },
  { value: "partial", label: "Parcialmente enviadas" },
]

const FACTURADO_OPTS = [
  { value: "all", label: "Todas" },
  { value: "no", label: "Sin facturar" },
  { value: "si", label: "Ya facturadas" },
]

function FinancialBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    partially_paid: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    refunded: "bg-red-500/15 text-red-400 border-red-500/30",
    partially_refunded: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    voided: "bg-muted/30 text-muted-foreground border-border",
  }
  const labels: Record<string, string> = {
    paid: "Pagada",
    partially_paid: "Parcial",
    refunded: "Reembolsada",
    partially_refunded: "Parc. reembolso",
    pending: "Pendiente",
    voided: "Anulada",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted/30 text-muted-foreground border-border"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function FulfillmentBadge({ status }: { status: string | null }) {
  if (!status || status === "unfulfilled") {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400 border-amber-500/30">
        Sin enviar
      </span>
    )
  }
  const map: Record<string, string> = {
    fulfilled: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    partial: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  }
  const labels: Record<string, string> = {
    fulfilled: "Enviada",
    partial: "Parcial",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[status] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function fmtARS(n: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, minimumFractionDigits: 0 }).format(n)
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Extrae CUIT/DNI de los note_attributes o de campos de texto libre */
function extractDocFromOrder(order: ShopifyOrder): { docNro: string | null; docTipo: string | null } {
  const attrs = order.note_attributes || []
  const find = (...names: string[]) => {
    for (const n of names) {
      const f = attrs.find((a) => a.name?.toLowerCase() === n.toLowerCase())
      if (f?.value?.trim()) return f.value.trim()
    }
    return null
  }

  let docNro = find(
    "cuit",
    "nro_doc",
    "doc_number",
    "dni",
    "numero_documento",
    "identification",
    "numero_cuit",
    "numero_dni",
  )

  // Buscar en nota del pedido (ej: "CUIT: 20-12345678-9")
  if (!docNro && order.note) {
    const m = order.note.match(/\b(\d{2}[-]?\d{8}[-]?\d{1})\b/)
    if (m) docNro = m[1].replace(/-/g, "")
  }

  // Buscar en company del billing_address
  if (!docNro && order.billing_address?.company) {
    const m = order.billing_address.company.match(/\b(\d{2}[-]?\d{8}[-]?\d{1})\b/)
    if (m) docNro = m[1].replace(/-/g, "")
  }

  if (docNro) docNro = docNro.replace(/\D/g, "")

  const docTipo =
    find("tipo_doc", "doc_type", "tipo_documento") || (docNro && docNro.length === 11 ? "CUIT" : docNro ? "DNI" : null)

  return { docNro: docNro || null, docTipo: docTipo || null }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ShopifyBillingPage() {
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [activeStore, setActiveStore] = useState<string>("")
  const [activeEmpresa, setActiveEmpresa] = useState<string>("")
  const [loadingSetup, setLoadingSetup] = useState(true)

  // Filtros
  const [filterFinancial, setFilterFinancial] = useState("paid")
  const [filterFulfillment, setFilterFulfillment] = useState("any")
  const [filterFacturado, setFilterFacturado] = useState("no")
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split("T")[0])

  // Datos y paginación (cursor-based)
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [prevCursor, setPrevCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<string[]>([]) // historial para "página anterior"
  const LIMIT = 50

  // Selección masiva
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [emittingBatch, setEmittingBatch] = useState(false)
  const [batchResult, setBatchResult] = useState<{
    ok: number
    err: number
    errors: string[]
    warnings: string[]
  } | null>(null)

  // ── Cargar órdenes ─────────────────────────────────────────────────────────
  const loadOrders = useCallback(
    async (pageInfo = "") => {
      if (!activeStore) return
      setLoading(true)
      setError(null)
      setSelected(new Set())
      try {
        const params = new URLSearchParams({
          store_id: activeStore,
          financial_status: filterFinancial,
          facturado: filterFacturado === "all" ? "all" : filterFacturado,
          limit: String(LIMIT),
        })
        if (filterFulfillment !== "any") params.set("fulfillment_status", filterFulfillment)
        if (!pageInfo && fechaDesde) params.set("fecha_desde", `${fechaDesde}T00:00:00-03:00`)
        if (!pageInfo && fechaHasta) params.set("fecha_hasta", `${fechaHasta}T23:59:59-03:00`)
        if (pageInfo) params.set("page_info", pageInfo)

        const res = await fetch(`/api/billing/shopify-ventas?${params}`)
        const data = await res.json()
        if (!res.ok || !data.ok) {
          setError(data.error || "Error cargando órdenes")
          return
        }
        setOrders(data.orders)
        setNextCursor(data.pagination.next_page_info)
        setPrevCursor(data.pagination.prev_page_info)
      } finally {
        setLoading(false)
      }
    },
    [activeStore, filterFinancial, filterFulfillment, filterFacturado, fechaDesde, fechaHasta],
  )

  // ── Cargar tiendas Shopify y empresas ARCA ─────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingSetup(true)
      const [storesRes, empRes] = await Promise.all([fetch("/api/shopify/stores"), fetch("/api/billing/config")])
      const storesData = await storesRes.json()
      const empData = await empRes.json()

      const ss: ShopifyStore[] = (storesData.stores || []).map((s: any) => ({
        id: s.id,
        shop_domain: s.shop_domain,
      }))
      const emps: Empresa[] = empData.empresas || []

      setStores(ss)
      setEmpresas(emps)
      if (ss[0]) setActiveStore(ss[0].id)
      if (emps[0]) setActiveEmpresa(emps[0].id)
      setLoadingSetup(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (activeStore) {
      setCursorStack([])
      loadOrders()
    }
  }, [activeStore, filterFinancial, filterFulfillment, filterFacturado])

  // ── Selección ──────────────────────────────────────────────────────────────
  const toggleOrder = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const toggleAll = () => {
    const unfacturadas = orders.filter((o) => !o.facturada).map((o) => o.id)
    if (selected.size === unfacturadas.length) setSelected(new Set())
    else setSelected(new Set(unfacturadas))
  }

  // ── Paginación cursor ──────────────────────────────────────────────────────
  const goNext = () => {
    if (!nextCursor) return
    setCursorStack((prev) => [...prev, nextCursor])
    loadOrders(nextCursor)
  }
  const goPrev = () => {
    const stack = [...cursorStack]
    stack.pop()
    const cursor = stack[stack.length - 1] || ""
    setCursorStack(stack)
    loadOrders(cursor)
  }

  // ── Núcleo de facturación ──────────────────────────────────────────────────
  const processOrders = async (
    selOrders: ShopifyOrder[],
  ): Promise<{ ok: number; err: number; errors: string[]; warnings: string[] }> => {
    let ok = 0
    let err = 0
    const errs: string[] = []
    const warns: string[] = []
    const round2 = (n: number) => Math.round(n * 100) / 100
    const ivaDefault = empresas.find((e) => e.id === activeEmpresa)?.iva_default ?? 0

    for (const order of selOrders) {
      if (order.facturada) continue
      try {
        const { docNro, docTipo } = extractDocFromOrder(order)

        const tipoDoc = docNro ? (["CUIT", "CUIL"].includes((docTipo || "").toUpperCase()) ? 80 : 96) : 99
        const nroDoc = docNro || "0"

        if (!docNro) {
          warns.push(`Orden #${order.id} (${order.comprador}): sin CUIT/DNI, facturada como Consumidor Final`)
        }

        const condIva =
          tipoDoc === 80 ? "responsable_inscripto" : tipoDoc === 96 ? "consumidor_final" : "consumidor_final"

        const ba = order.billing_address || {}
        const domicilio = [ba.address1, ba.city, ba.province, ba.zip, ba.country].filter(Boolean).join(", ") || null

        const facRes = await fetch("/api/billing/facturas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empresa_id: activeEmpresa,
            tipo_comprobante: 11,
            concepto: 1,
            tipo_doc_receptor: tipoDoc,
            nro_doc_receptor: nroDoc,
            receptor_nombre: order.comprador || "Consumidor Final",
            receptor_domicilio: domicilio,
            receptor_condicion_iva: condIva,
            origen: "shopify",
            orden_id: String(order.id),
            items: order.items.map((i) => ({
              descripcion: i.titulo || "Venta Shopify",
              cantidad: i.cantidad,
              precio_unitario: round2(i.precio),
              alicuota_iva: ivaDefault,
            })),
          }),
        })
        const facData = await facRes.json()

        if (facData.ok) {
          await fetch("/api/billing/shopify-ventas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shopify_order_ids: [String(order.id)],
              store_id: activeStore,
              factura_id: facData.factura?.id,
              empresa_id: activeEmpresa,
            }),
          })
          ok++
        } else {
          err++
          errs.push(`Orden #${order.id}: ${facData.error || "Error"}`)
        }
      } catch (e: any) {
        err++
        errs.push(`Orden #${order.id}: ${e.message}`)
      }
    }
    return { ok, err, errors: errs, warnings: warns }
  }

  const emitirMasivo = async () => {
    if (!selected.size || !activeEmpresa || !activeStore) return
    setEmittingBatch(true)
    setBatchResult(null)
    const result = await processOrders(orders.filter((o) => selected.has(o.id)))
    setBatchResult(result)
    setEmittingBatch(false)
    loadOrders(cursorStack[cursorStack.length - 1] || "")
  }

  const handleBuscar = () => {
    setCursorStack([])
    loadOrders()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingSetup) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!stores.length) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Ventas Shopify</h1>
        <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold">No hay tiendas Shopify conectadas</p>
            <p className="text-sm text-muted-foreground mt-1">
              Conectá tu tienda Shopify desde la sección de integraciones para ver las ventas y facturarlas a ARCA.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const unfacturadas = orders.filter((o) => !o.facturada)
  const allSelected = unfacturadas.length > 0 && selected.size === unfacturadas.length
  const totalSelected = orders.filter((o) => selected.has(o.id)).reduce((s, o) => s + o.total, 0)
  const hasPrev = cursorStack.length > 0

  return (
    <div className="space-y-5 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas Shopify</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Consultá tus ventas y facturálas directamente a ARCA</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCursorStack([])
            loadOrders()
          }}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Selector de tienda + empresa ARCA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tienda Shopify</Label>
          <div className="flex flex-wrap gap-2">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => setActiveStore(store.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  activeStore === store.id
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }`}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                {store.shop_domain.replace(".myshopify.com", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Empresa para facturar (ARCA)</Label>
          {empresas.length ? (
            <div className="flex flex-wrap gap-2">
              {empresas.map((emp) => (
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
            <Label className="text-xs">Estado del pago</Label>
            <Select value={filterFinancial} onValueChange={setFilterFinancial}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINANCIAL_STATUS_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estado del envío</Label>
            <Select value={filterFulfillment} onValueChange={setFilterFulfillment}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FULFILLMENT_STATUS_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estado de facturación</Label>
            <Select value={filterFacturado} onValueChange={setFilterFacturado}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACTURADO_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                className="h-8 text-xs flex-1"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
              <Button size="sm" className="h-8 px-3 text-xs" onClick={handleBuscar}>
                Buscar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de acción masiva */}
      {selected.size > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">{selected.size} ventas seleccionadas</p>
                <p className="text-xs text-muted-foreground">Total: {fmtARS(totalSelected)}</p>
              </div>
            </div>
            <Button onClick={emitirMasivo} disabled={emittingBatch || !activeEmpresa} className="gap-2">
              {emittingBatch ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Facturando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Facturar ({selected.size})
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Resultado batch */}
      {batchResult && (
        <div
          className={`rounded-lg border p-4 flex items-start gap-3 ${
            batchResult.err === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          {batchResult.err === 0 ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              {batchResult.ok} factura{batchResult.ok !== 1 ? "s" : ""} emitida{batchResult.ok !== 1 ? "s" : ""}{" "}
              correctamente
              {batchResult.err > 0 && ` · ${batchResult.err} con error`}
              {batchResult.warnings.length > 0 && ` · ${batchResult.warnings.length} sin CUIT/DNI`}
            </p>
            {batchResult.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {batchResult.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-400">
                    {e}
                  </li>
                ))}
              </ul>
            )}
            {batchResult.warnings.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-amber-400 cursor-pointer select-none flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {batchResult.warnings.length} orden{batchResult.warnings.length !== 1 ? "es" : ""} sin CUIT/DNI
                  (facturadas como Consumidor Final)
                </summary>
                <ul className="mt-1.5 space-y-0.5 pl-4">
                  {batchResult.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {w}
                    </li>
                  ))}
                </ul>
              </details>
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
            <Badge variant="secondary" className="text-xs">
              {orders.length}
            </Badge>
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
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <p className="text-sm">Cargando…</p>
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
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Orden
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Fecha
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Comprador
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Artículos
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Total
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Pago
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Envío
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Factura
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={`transition-colors ${selected.has(order.id) ? "bg-primary/5" : "hover:bg-muted/20"} ${order.facturada ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected.has(order.id)}
                        onCheckedChange={() => toggleOrder(order.id)}
                        className={order.facturada ? "opacity-50" : ""}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{order.id}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtFecha(order.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm leading-tight">{order.comprador || "—"}</p>
                      {order.email && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{order.email}</p>}
                      {!order.facturada &&
                        (() => {
                          const { docNro } = extractDocFromOrder(order)
                          return docNro ? (
                            <p className="text-[10px] text-emerald-400/70 mt-0.5 font-mono">{docNro}</p>
                          ) : (
                            <p className="text-[10px] text-amber-400/60 mt-0.5 italic">Sin CUIT/DNI → Cons. Final</p>
                          )
                        })()}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {order.items.slice(0, 2).map((item, i) => (
                        <div key={i} className="text-xs text-muted-foreground truncate">
                          {item.cantidad > 1 ? `${item.cantidad}x ` : ""}
                          {item.titulo}
                          {item.sku && <span className="ml-1 text-[10px] opacity-50 font-mono">[{item.sku}]</span>}
                        </div>
                      ))}
                      {order.items.length > 2 && (
                        <p className="text-xs text-muted-foreground/60">+{order.items.length - 2} más</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {fmtARS(order.total, order.moneda)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <FinancialBadge status={order.financial_status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <FulfillmentBadge status={order.fulfillment_status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {order.facturada ? (
                        <div className="inline-flex flex-col items-center gap-1 min-w-[80px]">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            {order.factura_info?.facturado_at
                              ? new Date(order.factura_info.facturado_at).toLocaleDateString("es-AR")
                              : "Sí"}
                          </span>
                          {order.factura_info?.factura_id && (
                            <a
                              href={`/api/billing/facturas/${order.factura_info.factura_id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
                            >
                              <Download className="h-3 w-3" />
                              PDF
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación cursor */}
        {(hasPrev || nextCursor) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {orders.length} resultado{orders.length !== 1 ? "s" : ""} en esta página
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 gap-1 text-xs"
                onClick={goPrev}
                disabled={!hasPrev || loading}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 gap-1 text-xs"
                onClick={goNext}
                disabled={!nextCursor || loading}
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
