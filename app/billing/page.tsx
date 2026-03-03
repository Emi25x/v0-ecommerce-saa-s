"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  FileText, Plus, Settings, RefreshCw, Download, Search,
  CheckCircle2, XCircle, Clock, Trash2, ChevronLeft, ChevronRight, Building2, Receipt,
  HelpCircle, ExternalLink, ChevronDown, ChevronUp, ShieldCheck, Key, Globe, Terminal
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArcaConfig {
  id: string
  cuit: string
  razon_social: string
  domicilio_fiscal: string
  punto_venta: number
  condicion_iva: string
  ambiente: string
  wsaa_expires_at: string | null
}

interface FacturaItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  alicuota_iva: 0 | 10.5 | 21 | 27
  subtotal: number
  iva: number
}

interface Factura {
  id: string
  tipo_comprobante: number
  punto_venta: number
  numero: number
  fecha: string
  cae: string | null
  cae_vencimiento: string | null
  razon_social_receptor: string
  nro_doc_receptor: string
  importe_total: number
  importe_neto: number
  importe_iva: number
  estado: string
  error_mensaje: string | null
  items: FacturaItem[]
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_COMPROBANTE: Record<number, { letra: string; label: string }> = {
  1:  { letra: "A", label: "Factura A" },
  6:  { letra: "B", label: "Factura B" },
  11: { letra: "C", label: "Factura C" },
}

// Según FEParamGetCondicionIvaReceptor de ARCA (RG 5616)
const CONDICION_IVA_OPTS = [
  { value: "consumidor_final",                    label: "Consumidor Final (5)" },
  { value: "responsable_inscripto",               label: "Responsable Inscripto (1)" },
  { value: "monotributo",                         label: "Responsable Monotributo (6)" },
  { value: "exento",                              label: "IVA Sujeto Exento (4)" },
  { value: "no_categorizado",                     label: "Sujeto No Categorizado (7)" },
  { value: "monotributista_social",               label: "Monotributista Social (13)" },
  { value: "no_alcanzado",                        label: "IVA No Alcanzado (15)" },
  { value: "proveedor_exterior",                  label: "Proveedor del Exterior (8)" },
  { value: "cliente_exterior",                    label: "Cliente del Exterior (9)" },
  { value: "liberado",                            label: "IVA Liberado Ley 19640 (10)" },
  { value: "monotributo_trabajador_independiente",label: "Monotributo Trab. Independiente (16)" },
]

// Según FEParamGetTiposDoc de ARCA
const TIPO_DOC_OPTS = [
  { value: "99", label: "Sin documento / Consumidor Final" },
  { value: "96", label: "DNI" },
  { value: "80", label: "CUIT" },
  { value: "86", label: "CUIL" },
  { value: "87", label: "CDI" },
  { value: "89", label: "LE" },
  { value: "90", label: "LC" },
  { value: "91", label: "CI Extranjera" },
  { value: "92", label: "en trámite" },
  { value: "95", label: "Pasaporte" },
]

const IVA_OPTS: Array<{ value: 0 | 10.5 | 21 | 27; label: string }> = [
  { value: 0,    label: "Exento (0%)" },
  { value: 10.5, label: "10.5%" },
  { value: 21,   label: "21%" },
  { value: 27,   label: "27%" },
]

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n)
}

function fmtFecha(s: string) {
  if (!s) return "—"
  const [y, m, d] = s.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function nroFmt(pv: number, num: number) {
  return `${String(pv).padStart(4, "0")}-${String(num).padStart(8, "0")}`
}

function estadoBadge(estado: string) {
  if (estado === "emitida")   return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Emitida</Badge>
  if (estado === "pendiente") return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Pendiente</Badge>
  if (estado === "error")     return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">Error</Badge>
  return <Badge className="bg-muted text-muted-foreground text-xs">{estado}</Badge>
}

function calcItem(item: Partial<FacturaItem>): FacturaItem {
  const cantidad   = Number(item.cantidad || 0)
  const precio     = Number(item.precio_unitario || 0)
  const alicuota   = Number(item.alicuota_iva ?? 21) as 0 | 10.5 | 21 | 27
  const subtotal   = parseFloat((cantidad * precio).toFixed(2))
  const iva        = alicuota === 0 ? 0 : parseFloat((subtotal * alicuota / 100).toFixed(2))
  return {
    descripcion:     item.descripcion || "",
    cantidad,
    precio_unitario: precio,
    alicuota_iva:    alicuota,
    subtotal,
    iva,
  }
}

const EMPTY_ITEM = (): Partial<FacturaItem> => ({
  descripcion: "", cantidad: 1, precio_unitario: 0, alicuota_iva: 21, subtotal: 0, iva: 0,
})

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState("facturas")

  // Config
  const [config, setConfig]           = useState<ArcaConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig]   = useState(false)
  const [configForm, setConfigForm]   = useState({
    cuit: "", razon_social: "", domicilio_fiscal: "", punto_venta: "1",
    condicion_iva: "responsable_inscripto", ambiente: "homologacion",
    cert_pem: "", clave_pem: "",
  })
  const [configMsg, setConfigMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  // Facturas
  const [facturas, setFacturas]   = useState<Factura[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loadingF, setLoadingF]   = useState(false)
  const [searchQ, setSearchQ]     = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const LIMIT = 20

  // Nueva factura
  const [showNew, setShowNew]     = useState(false)
  const [emitting, setEmitting]   = useState(false)
  const [emitError, setEmitError] = useState<string | null>(null)
  const [newForm, setNewForm]     = useState({
    tipo_comprobante: "6",
    concepto: "1",
    tipo_doc_receptor: "99",
    nro_doc_receptor: "",
    receptor_nombre: "",
    receptor_domicilio: "",
    receptor_condicion_iva: "consumidor_final",
    moneda: "PES",
  })
  const [items, setItems]         = useState<Partial<FacturaItem>[]>([EMPTY_ITEM()])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const r = await fetch("/api/billing/config")
      const d = await r.json()
      if (d.config) {
        setConfig(d.config)
        setConfigForm(prev => ({
          ...prev,
          cuit:             d.config.cuit || "",
          razon_social:     d.config.razon_social || "",
          domicilio_fiscal: d.config.domicilio_fiscal || "",
          punto_venta:      String(d.config.punto_venta || "1"),
          condicion_iva:    d.config.condicion_iva || "responsable_inscripto",
          ambiente:         d.config.ambiente || "homologacion",
        }))
      }
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  const loadFacturas = useCallback(async (p = 0) => {
    setLoadingF(true)
    try {
      const params = new URLSearchParams({
        page: String(p + 1), limit: String(LIMIT),
        ...(filterEstado !== "all" && { estado: filterEstado }),
        ...(searchQ && { q: searchQ }),
      })
      const r = await fetch(`/api/billing/facturas?${params}`)
      const d = await r.json()
      if (d.ok) { setFacturas(d.facturas); setTotal(d.total) }
    } finally {
      setLoadingF(false)
    }
  }, [filterEstado, searchQ])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { loadFacturas(page) }, [loadFacturas, page])

  // ── Config save ───────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setSavingConfig(true); setConfigMsg(null)
    try {
      const r = await fetch("/api/billing/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configForm),
      })
      const d = await r.json()
      if (d.ok) { setConfigMsg({ type: "ok", text: "Configuración guardada correctamente." }); loadConfig() }
      else setConfigMsg({ type: "err", text: d.error || "Error al guardar" })
    } finally {
      setSavingConfig(false)
    }
  }

  // ── Emitir factura ────────────────────────────────────────────────────────

  const emitirFactura = async () => {
    setEmitting(true); setEmitError(null)
    try {
      const typedItems = items.map(calcItem).filter(i => i.descripcion && i.cantidad > 0)
      if (!typedItems.length) { setEmitError("Agregá al menos un ítem con descripción y cantidad."); setEmitting(false); return }

      const r = await fetch("/api/billing/facturas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newForm, items: typedItems }),
      })
      const d = await r.json()
      if (d.ok) {
        setShowNew(false)
        setNewForm({ tipo_comprobante: "6", concepto: "1", tipo_doc_receptor: "99", nro_doc_receptor: "", receptor_nombre: "", receptor_domicilio: "", receptor_condicion_iva: "consumidor_final", moneda: "PES" })
        setItems([EMPTY_ITEM()])
        loadFacturas(0); setPage(0)
      } else {
        setEmitError(d.error || "Error al emitir")
      }
    } finally {
      setEmitting(false)
    }
  }

  // ── Items helpers ─────────────────────────────────────────────────────────

  const updateItem = (idx: number, field: keyof FacturaItem, value: any) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const addItem = () => setItems(prev => [...prev, EMPTY_ITEM()])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const calcedItems = items.map(calcItem)
  const totales = calcedItems.reduce(
    (acc, i) => ({
      subtotal: acc.subtotal + i.subtotal,
      iva:      acc.iva + i.iva,
      total:    acc.total + i.subtotal + i.iva,
    }),
    { subtotal: 0, iva: 0, total: 0 }
  )

  // ── Render ────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground text-balance">Facturación Electrónica</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emisión de comprobantes electrónicos via ARCA (ex-AFIP) — Webservice WSFE v1
          </p>
        </div>
        <Button
          onClick={() => { if (!config) { setActiveTab("config") } else { setShowNew(true) } }}
          className="gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Nueva factura
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total emitidas</p>
          <p className="text-2xl font-bold">{total.toLocaleString("es-AR")}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Estado ARCA</p>
          {config ? (
            <div className="flex items-center gap-2 mt-1">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">
                {config.ambiente === "produccion" ? "Producción" : "Homologación"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <XCircle className="h-5 w-5 text-amber-400" />
              <span className="text-sm font-semibold text-amber-400">Sin configurar</span>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">CUIT</p>
          <p className="text-sm font-mono font-semibold">{config?.cuit || "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Punto de venta</p>
          <p className="text-2xl font-bold">{config ? String(config.punto_venta).padStart(4, "0") : "—"}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="mb-4">
  <TabsTrigger value="facturas" className="gap-2"><Receipt className="h-4 w-4" />Facturas</TabsTrigger>
  <TabsTrigger value="config"   className="gap-2"><Settings className="h-4 w-4" />Configuración ARCA</TabsTrigger>
  <TabsTrigger value="ayuda"    className="gap-2"><HelpCircle className="h-4 w-4" />Cómo tramitar el certificado</TabsTrigger>
  </TabsList>

        {/* ── Facturas tab ── */}
        <TabsContent value="facturas">
          {!config && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-300">
                Para emitir facturas primero completá los datos en la pestaña{" "}
                <button onClick={() => setActiveTab("config")} className="underline font-semibold">Configuración ARCA</button>.
              </p>
            </div>
          )}

          {/* Filtros */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por receptor, CUIT, CAE..."
                className="pl-9"
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setPage(0) }}
              />
            </div>
            <Select value={filterEstado} onValueChange={v => { setFilterEstado(v); setPage(0) }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="emitida">Emitidas</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="error">Con error</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => loadFacturas(page)}>
              <RefreshCw className={`h-4 w-4 ${loadingF ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Tabla */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Tipo</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">N° Comprobante</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Fecha</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Receptor</th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Total</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Estado</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">CAE</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loadingF ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
                ) : facturas.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No hay facturas emitidas</p>
                  </td></tr>
                ) : facturas.map(f => (
                  <tr key={f.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded border-2 border-current font-bold text-sm font-mono">
                        {TIPO_COMPROBANTE[f.tipo_comprobante]?.letra || "?"}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">{nroFmt(f.punto_venta, f.numero)}</td>
                    <td className="p-3 text-muted-foreground text-xs">{fmtFecha(f.fecha)}</td>
                    <td className="p-3">
                      <p className="font-medium leading-tight">{f.razon_social_receptor}</p>
                      <p className="text-xs text-muted-foreground">{f.nro_doc_receptor}</p>
                    </td>
                    <td className="p-3 text-right font-mono font-semibold hidden md:table-cell">
                      {fmtMoney(Number(f.importe_total))}
                    </td>
                    <td className="p-3">{estadoBadge(f.estado)}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground hidden lg:table-cell">
                      {f.cae || "—"}
                    </td>
                    <td className="p-3">
                      {f.cae && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="Ver factura"
                          onClick={() => window.open(`/api/billing/facturas/${f.id}/pdf`, "_blank")}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {total.toLocaleString("es-AR")} facturas — Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Config tab ── */}
        <TabsContent value="config">
          <div className="max-w-2xl space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Building2 className="h-4 w-4" />Datos del emisor</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>CUIT (sin guiones)</Label>
                  <Input placeholder="20123456780" value={configForm.cuit} onChange={e => setConfigForm(p => ({ ...p, cuit: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Punto de venta</Label>
                  <Input type="number" min="1" max="9999" placeholder="1" value={configForm.punto_venta} onChange={e => setConfigForm(p => ({ ...p, punto_venta: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Razón social</Label>
                  <Input placeholder="Mi Empresa S.R.L." value={configForm.razon_social} onChange={e => setConfigForm(p => ({ ...p, razon_social: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Domicilio fiscal</Label>
                  <Input placeholder="Av. Corrientes 1234, CABA" value={configForm.domicilio_fiscal} onChange={e => setConfigForm(p => ({ ...p, domicilio_fiscal: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Condición frente al IVA</Label>
                  <Select value={configForm.condicion_iva} onValueChange={v => setConfigForm(p => ({ ...p, condicion_iva: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDICION_IVA_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ambiente</Label>
                  <Select value={configForm.ambiente} onValueChange={v => setConfigForm(p => ({ ...p, ambiente: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="homologacion">Homologación (pruebas)</SelectItem>
                      <SelectItem value="produccion">Producción</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold mb-1 flex items-center gap-2"><FileText className="h-4 w-4" />Certificado digital</h3>
              <p className="text-xs text-muted-foreground mb-4">
                El certificado .pem y la clave privada se obtienen al dar de alta el servicio en el portal de ARCA.
                Se guardan encriptados y se usan para autenticarse en el WSAA.
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Certificado (.pem)</Label>
                  <Textarea
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                    className="font-mono text-xs h-28 resize-none"
                    value={configForm.cert_pem}
                    onChange={e => setConfigForm(p => ({ ...p, cert_pem: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Clave privada (.pem)</Label>
                  <Textarea
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    className="font-mono text-xs h-28 resize-none"
                    value={configForm.clave_pem}
                    onChange={e => setConfigForm(p => ({ ...p, clave_pem: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {configMsg && (
              <div className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${configMsg.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                {configMsg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                {configMsg.text}
              </div>
            )}

            <Button onClick={saveConfig} disabled={savingConfig} className="gap-2">
              {savingConfig ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
              {savingConfig ? "Guardando..." : "Guardar configuración"}
            </Button>
          </div>
  </TabsContent>

  {/* ── Ayuda tab ── */}
  <TabsContent value="ayuda">
    <div className="max-w-3xl space-y-6">

      {/* Intro */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-6 w-6 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-base mb-1">Certificado digital para facturación electrónica ARCA</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Para emitir facturas electrónicas necesitás un certificado digital que identifica a tu software ante los servidores de ARCA (ex-AFIP).
              El proceso es gratuito y se realiza 100% online desde el portal de ARCA con tu CUIT y Clave Fiscal nivel 3.
            </p>
          </div>
        </div>
      </div>

      {/* Paso 1 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">1</span>
          <h3 className="font-semibold">Verificar Clave Fiscal nivel 3</h3>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>Ingresá al portal de ARCA con tu CUIT y Clave Fiscal. Necesitás <strong className="text-foreground">nivel 3 como mínimo</strong> para administrar los webservices.</p>
          <p>Si tenés nivel 2 o menos, debés acercarte a una oficina de ARCA con tu DNI para elevar el nivel.</p>
          <a
            href="https://auth.afip.gob.ar/contribuyente_/login.xhtml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium mt-1"
          >
            <Globe className="h-3.5 w-3.5" />
            Ir al portal de ARCA
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Paso 2 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">2</span>
          <h3 className="font-semibold">Generar la clave privada y el CSR (Certificate Signing Request)</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>Desde tu computadora (no desde el portal), ejecutá los siguientes comandos con <strong className="text-foreground">OpenSSL</strong> instalado:</p>

          <div className="rounded-md bg-black/40 border border-border p-4 font-mono text-xs space-y-1">
            <p className="text-muted-foreground"># 1. Generar la clave privada (2048 bits)</p>
            <p className="text-emerald-400">openssl genrsa -out private_key.pem 2048</p>
            <p className="text-muted-foreground mt-2"># 2. Generar el CSR (reemplazá los datos con los tuyos)</p>
            <p className="text-emerald-400">openssl req -new -key private_key.pem -out cert_request.csr \</p>
            <p className="text-emerald-400 pl-4">{'-subj "/C=AR/O=TU_RAZON_SOCIAL/CN=TU_CUIT/serialNumber=CUIT TU_CUIT"'}</p>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-400 flex items-start gap-2">
            <Key className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Guardá el archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">private_key.pem</code> en un lugar seguro. Nunca lo compartas ni lo subas al portal. Solo el CSR va a ARCA.</span>
          </div>

          <p>Si no tenés OpenSSL, podés instalarlo en Windows desde <strong className="text-foreground">winget install ShiningLight.OpenSSL</strong> o descargarlo desde slproweb.com/products/Win32OpenSSL.html</p>
        </div>
      </div>

      {/* Paso 3 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">3</span>
          <h3 className="font-semibold">Subir el CSR a ARCA y obtener el certificado</h3>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>Con tu Clave Fiscal en el portal de ARCA:</p>
          <ol className="space-y-2 ml-4 list-decimal marker:text-foreground">
            <li>Ir a <strong className="text-foreground">Administrador de Relaciones de Clave Fiscal</strong></li>
            <li>Seleccionar tu CUIT en el panel izquierdo</li>
            <li>Click en <strong className="text-foreground">"Nueva Relación"</strong></li>
            <li>Buscar y seleccionar el servicio <strong className="text-foreground">"WSFE — Facturación Electrónica"</strong></li>
            <li>En la misma sección, ir a <strong className="text-foreground">"Administración de Certificados Digitales"</strong></li>
            <li>Click en <strong className="text-foreground">"Agregar Alias"</strong> → ponerle un nombre (ej: "MiSistema")</li>
            <li>Subir el archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">cert_request.csr</code> generado en el paso anterior</li>
            <li>ARCA te devuelve un archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">certificado.crt</code> — descargarlo</li>
          </ol>
        </div>
      </div>

      {/* Paso 4 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">4</span>
          <h3 className="font-semibold">Dar de alta el punto de venta</h3>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p>En el portal de ARCA, ir a <strong className="text-foreground">"Administración de Puntos de Venta y Domicilios"</strong>:</p>
          <ol className="space-y-2 ml-4 list-decimal marker:text-foreground">
            <li>Click en <strong className="text-foreground">"Alta de Punto de Venta"</strong></li>
            <li>Elegir un número (ej: <code className="font-mono text-xs bg-black/30 px-1 rounded">2</code>) — el 1 suele estar reservado para RECE online</li>
            <li>Seleccionar el sistema: <strong className="text-foreground">"Facturación Electrónica — WebService"</strong></li>
            <li>Asignar un domicilio y confirmar</li>
          </ol>
          <p className="mt-1">El número elegido es el que debés ingresar en la sección <strong className="text-foreground">Configuración ARCA</strong> de esta app.</p>
        </div>
      </div>

      {/* Paso 5 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-sm flex-shrink-0">5</span>
          <h3 className="font-semibold">Cargar los datos en esta app</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>Ir a la pestaña <strong className="text-foreground">Configuración ARCA</strong> y completar:</p>
          <div className="grid gap-2">
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">CUIT</span>
              <span>Tu CUIT sin guiones (ej: 20123456789)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">Punto de venta</span>
              <span>El número dado de alta en el paso anterior</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">Certificado PEM</span>
              <span>El contenido del archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">certificado.crt</code> que devolvió ARCA (texto completo, incluido el encabezado <code className="font-mono text-xs bg-black/30 px-1 rounded">-----BEGIN CERTIFICATE-----</code>)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded text-foreground mt-0.5">Clave privada</span>
              <span>El contenido del archivo <code className="font-mono text-xs bg-black/30 px-1 rounded">private_key.pem</code> generado en el paso 2</span>
            </div>
          </div>
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-blue-300 flex items-start gap-2 mt-2">
            <Terminal className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Empezá siempre en <strong>ambiente Homologación</strong> (testing) para probar que todo funciona antes de pasar a Producción. Los CAE de homologación no son válidos fiscalmente.</span>
          </div>
        </div>
      </div>

      {/* Links útiles */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><ExternalLink className="h-4 w-4 text-muted-foreground" />Links oficiales</h3>
        <div className="space-y-2 text-sm">
          {[
            { label: "Portal ARCA (Clave Fiscal)", href: "https://auth.afip.gob.ar/contribuyente_/login.xhtml" },
            { label: "Manual WSFE v1 — ARCA", href: "https://www.afip.gob.ar/ws/documentacion/manual_desarrollador_wsfev1.pdf" },
            { label: "OpenSSL para Windows", href: "https://slproweb.com/products/Win32OpenSSL.html" },
            { label: "Guía de Factura Electrónica ARCA", href: "https://www.afip.gob.ar/fe/ayuda/documentos/manual-factura-electronica.pdf" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              {label}
            </a>
          ))}
        </div>
      </div>

    </div>
  </TabsContent>

  </Tabs>

      {/* ── Modal nueva factura ── */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Nueva factura electrónica</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Tipo comprobante */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de comprobante</Label>
                <Select value={newForm.tipo_comprobante} onValueChange={v => setNewForm(p => ({ ...p, tipo_comprobante: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Factura B</SelectItem>
                    <SelectItem value="11">Factura C</SelectItem>
                    <SelectItem value="1">Factura A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Concepto</Label>
                <Select value={newForm.concepto} onValueChange={v => setNewForm(p => ({ ...p, concepto: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Productos</SelectItem>
                    <SelectItem value="2">Servicios</SelectItem>
                    <SelectItem value="3">Productos y Servicios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Receptor */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h4 className="font-medium text-sm">Datos del receptor</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Nombre / Razón social</Label>
                  <Input placeholder="Juan García" value={newForm.receptor_nombre} onChange={e => setNewForm(p => ({ ...p, receptor_nombre: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo documento</Label>
                  <Select
                    value={newForm.tipo_doc_receptor}
                    onValueChange={v => setNewForm(p => ({ ...p, tipo_doc_receptor: v, nro_doc_receptor: v === "99" ? "" : p.nro_doc_receptor }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPO_DOC_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    N° documento
                    {newForm.tipo_doc_receptor === "99" && (
                      <span className="text-muted-foreground font-normal ml-1">(no requerido)</span>
                    )}
                  </Label>
                  <Input
                    placeholder={newForm.tipo_doc_receptor === "99" ? "—" : "12345678"}
                    value={newForm.nro_doc_receptor}
                    onChange={e => setNewForm(p => ({ ...p, nro_doc_receptor: e.target.value }))}
                    disabled={newForm.tipo_doc_receptor === "99"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Condición frente al IVA</Label>
                  <Select value={newForm.receptor_condicion_iva} onValueChange={v => setNewForm(p => ({ ...p, receptor_condicion_iva: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDICION_IVA_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Domicilio (opcional)</Label>
                  <Input placeholder="Av. Siempre Viva 742" value={newForm.receptor_domicilio} onChange={e => setNewForm(p => ({ ...p, receptor_domicilio: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm">Ítems</h4>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1 h-7">
                  <Plus className="h-3 w-3" />Agregar ítem
                </Button>
              </div>
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-[1fr_60px_90px_80px_80px_24px] gap-2 text-xs text-muted-foreground px-1">
                  <span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">Precio</span><span className="text-center">IVA</span><span className="text-right">Subtotal</span><span />
                </div>
                {items.map((item, idx) => {
                  const c = calcItem(item)
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_60px_90px_80px_80px_24px] gap-2 items-center">
                      <Input
                        placeholder="Descripción del producto"
                        className="h-8 text-xs"
                        value={item.descripcion || ""}
                        onChange={e => updateItem(idx, "descripcion", e.target.value)}
                      />
                      <Input
                        type="number" min="1" className="h-8 text-xs text-center"
                        value={item.cantidad || ""}
                        onChange={e => updateItem(idx, "cantidad", Number(e.target.value))}
                      />
                      <Input
                        type="number" min="0" step="0.01" className="h-8 text-xs text-right"
                        value={item.precio_unitario || ""}
                        onChange={e => updateItem(idx, "precio_unitario", Number(e.target.value))}
                      />
                      <Select
                        value={String(item.alicuota_iva ?? 21)}
                        onValueChange={v => updateItem(idx, "alicuota_iva", Number(v))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {IVA_OPTS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-right font-mono">${c.subtotal.toFixed(2)}</span>
                      <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Totales */}
              <div className="mt-4 pt-3 border-t border-border flex justify-end">
                <div className="text-sm space-y-1 w-48">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal neto</span><span className="font-mono">${totales.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>IVA</span><span className="font-mono">${totales.iva.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t border-border pt-1">
                    <span>Total</span><span className="font-mono">${totales.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {emitError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex items-start gap-2">
                <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{emitError}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={emitirFactura} disabled={emitting} className="gap-2">
              {emitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              {emitting ? "Solicitando CAE..." : "Emitir factura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
