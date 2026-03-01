"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  FileText, Plus, Settings, RefreshCw, Download, Eye,
  CheckCircle, AlertCircle, Clock, Trash2,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

type ArcaConfig = {
  id: string
  cuit: string
  razon_social: string
  domicilio_fiscal: string | null
  punto_venta: number
  condicion_iva: string
  ambiente: string
  wsaa_expires_at: string | null
}

type FacturaItem = {
  descripcion: string
  cantidad: number
  precio_unit: number
  alicuota_iva: 0 | 10.5 | 21 | 27
}

type Factura = {
  id: string
  tipo_comprobante: number
  punto_venta: number
  numero: number
  fecha_emision: string
  receptor_nombre: string
  receptor_nro_doc: string | null
  total: number
  cae: string | null
  cae_vto: string | null
  estado: string
  error_msg: string | null
  items: FacturaItem[]
  subtotal: number
  iva_105: number
  iva_21: number
  iva_27: number
  created_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<number, string> = {
  1: "Factura A", 6: "Factura B", 11: "Factura C",
  2: "NC A", 7: "NC B", 12: "NC C",
  3: "ND A", 8: "ND B", 13: "ND C",
}

function formatNro(ptoVenta: number, numero: number) {
  return `${String(ptoVenta).padStart(4,"0")}-${String(numero).padStart(8,"0")}`
}

function formatDate(d: string) {
  if (!d) return "—"
  const dt = new Date(d)
  return dt.toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"numeric" })
}

function estadoBadge(estado: string) {
  if (estado === "emitida") return (
    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
      <CheckCircle className="h-3 w-3" /> Emitida
    </Badge>
  )
  if (estado === "error") return (
    <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
      <AlertCircle className="h-3 w-3" /> Error
    </Badge>
  )
  return (
    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
      <Clock className="h-3 w-3" /> Pendiente
    </Badge>
  )
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item, index, onChange, onRemove,
}: {
  item: FacturaItem
  index: number
  onChange: (i: number, field: keyof FacturaItem, value: any) => void
  onRemove: (i: number) => void
}) {
  const subtotal = item.cantidad * item.precio_unit
  const ivaAmt   = subtotal * (item.alicuota_iva / 100)

  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-4">
        <Input
          placeholder="Descripción"
          value={item.descripcion}
          onChange={e => onChange(index, "descripcion", e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number" min="1" step="1"
          placeholder="Cant."
          value={item.cantidad}
          onChange={e => onChange(index, "cantidad", Number(e.target.value))}
          className="h-8 text-sm"
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number" min="0" step="0.01"
          placeholder="Precio"
          value={item.precio_unit}
          onChange={e => onChange(index, "precio_unit", Number(e.target.value))}
          className="h-8 text-sm"
        />
      </div>
      <div className="col-span-2">
        <Select
          value={String(item.alicuota_iva)}
          onValueChange={v => onChange(index, "alicuota_iva", Number(v))}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0%</SelectItem>
            <SelectItem value="10.5">10.5%</SelectItem>
            <SelectItem value="21">21%</SelectItem>
            <SelectItem value="27">27%</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-1 text-right text-xs text-muted-foreground pt-2">
        ${(subtotal + ivaAmt).toFixed(2)}
      </div>
      <div className="col-span-1 flex justify-end">
        <Button
          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [config, setConfig]           = useState<ArcaConfig | null>(null)
  const [facturas, setFacturas]       = useState<Factura[]>([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [configLoading, setConfigLoading] = useState(false)
  const [emitLoading, setEmitLoading] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState<string | null>(null)
  const [filterEstado, setFilterEstado] = useState("all")
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  // Config form
  const [cfgForm, setCfgForm] = useState({
    cuit: "", razon_social: "", domicilio_fiscal: "", punto_venta: "1",
    condicion_iva: "responsable_inscripto", ambiente: "homologacion",
    certificado_pem: "", clave_pem: "",
  })

  // Nueva factura form
  const [nfForm, setNfForm] = useState({
    tipo_comprobante: "11",
    receptor_nombre: "", receptor_tipo_doc: "96", receptor_nro_doc: "",
    receptor_domicilio: "", receptor_condicion_iva: "consumidor_final",
  })
  const [nfItems, setNfItems] = useState<FacturaItem[]>([
    { descripcion: "", cantidad: 1, precio_unit: 0, alicuota_iva: 21 },
  ])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/billing/config")
    const d   = await res.json()
    if (d.config) {
      setConfig(d.config)
      setCfgForm(prev => ({
        ...prev,
        cuit:             d.config.cuit ?? "",
        razon_social:     d.config.razon_social ?? "",
        domicilio_fiscal: d.config.domicilio_fiscal ?? "",
        punto_venta:      String(d.config.punto_venta ?? 1),
        condicion_iva:    d.config.condicion_iva ?? "responsable_inscripto",
        ambiente:         d.config.ambiente ?? "homologacion",
      }))
    }
  }, [])

  const fetchFacturas = useCallback(async () => {
    const estado = filterEstado !== "all" ? `&estado=${filterEstado}` : ""
    const res  = await fetch(`/api/billing/facturas?page=1&limit=50${estado}`)
    const d    = await res.json()
    setFacturas(d.facturas ?? [])
    setTotal(d.total ?? 0)
  }, [filterEstado])

  useEffect(() => {
    Promise.all([fetchConfig(), fetchFacturas()]).finally(() => setLoading(false))
  }, [fetchConfig, fetchFacturas])

  useEffect(() => { if (!loading) fetchFacturas() }, [filterEstado])

  // ── Config save ────────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setConfigLoading(true); setError(null); setSuccess(null)
    try {
      const res = await fetch("/api/billing/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfgForm),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setSuccess("Configuración guardada correctamente")
      fetchConfig()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setConfigLoading(false)
    }
  }

  // ── Emit factura ───────────────────────────────────────────────────────────

  const emitFactura = async () => {
    setEmitLoading(true); setError(null); setSuccess(null)
    try {
      const res = await fetch("/api/billing/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...nfForm, items: nfItems }),
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setSuccess(`Factura emitida. CAE: ${d.cae} | Vto: ${d.cae_vto}`)
      setShowNewModal(false)
      setPreviewHtml(d.pdf_html)
      fetchFacturas()
      // Reset form
      setNfForm({ tipo_comprobante: "11", receptor_nombre: "", receptor_tipo_doc: "96", receptor_nro_doc: "", receptor_domicilio: "", receptor_condicion_iva: "consumidor_final" })
      setNfItems([{ descripcion: "", cantidad: 1, precio_unit: 0, alicuota_iva: 21 }])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setEmitLoading(false)
    }
  }

  // ── Items helpers ──────────────────────────────────────────────────────────

  const updateItem = (i: number, field: keyof FacturaItem, value: any) => {
    setNfItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const addItem = () => {
    setNfItems(prev => [...prev, { descripcion: "", cantidad: 1, precio_unit: 0, alicuota_iva: 21 }])
  }

  const removeItem = (i: number) => {
    setNfItems(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Totales preview ────────────────────────────────────────────────────────

  const totalesPreview = nfItems.reduce((acc, it) => {
    const base = it.cantidad * it.precio_unit
    const iva  = base * (it.alicuota_iva / 100)
    return { subtotal: acc.subtotal + base, total: acc.total + base + iva }
  }, { subtotal: 0, total: 0 })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Facturación Electrónica</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Emisión de comprobantes fiscales electrónicos via ARCA/AFIP
            </p>
          </div>
          <Button
            onClick={() => setShowNewModal(true)}
            disabled={!config}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nueva factura
          </Button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* No config warning */}
        {!config && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
            <strong>Configuración ARCA pendiente</strong> — Completá los datos en la pestaña "Configuración" para poder emitir facturas.
          </div>
        )}

        <Tabs defaultValue="facturas">
          <TabsList className="border-b border-border bg-transparent w-full justify-start rounded-none gap-0 h-auto pb-0">
            <TabsTrigger value="facturas" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary pb-2">
              <FileText className="h-4 w-4 mr-2" /> Facturas
            </TabsTrigger>
            <TabsTrigger value="config" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary pb-2">
              <Settings className="h-4 w-4 mr-2" /> Configuración ARCA
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Facturas ─────────────────────────────────────────────── */}
          <TabsContent value="facturas" className="mt-4 space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total emitidas",  value: facturas.filter(f => f.estado === "emitida").length, color: "text-emerald-400" },
                { label: "Total registros", value: total,                                                color: "text-foreground" },
                { label: "Con error",       value: facturas.filter(f => f.estado === "error").length,   color: "text-red-400" },
                { label: "Facturado",
                  value: `$${facturas.filter(f => f.estado === "emitida").reduce((s, f) => s + f.total, 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
                  color: "text-foreground" },
              ].map(s => (
                <div key={s.label} className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Filter */}
            <div className="flex items-center gap-3">
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="emitida">Emitidas</SelectItem>
                  <SelectItem value="pendiente">Pendientes</SelectItem>
                  <SelectItem value="error">Con error</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={fetchFacturas} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Actualizar
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">{total} registros</span>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-card hover:bg-card">
                    <TableHead>Tipo</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Receptor</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>CAE</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        No hay facturas registradas
                      </TableCell>
                    </TableRow>
                  ) : facturas.map(f => (
                    <TableRow key={f.id} className="border-border hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{TIPO_LABELS[f.tipo_comprobante] ?? f.tipo_comprobante}</TableCell>
                      <TableCell className="font-mono text-xs">{formatNro(f.punto_venta, f.numero)}</TableCell>
                      <TableCell className="text-sm">{formatDate(f.fecha_emision)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="max-w-[160px] truncate">{f.receptor_nombre}</div>
                        {f.receptor_nro_doc && <div className="text-xs text-muted-foreground">{f.receptor_nro_doc}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${f.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        {f.cae
                          ? <span className="font-mono text-xs text-muted-foreground">{f.cae}</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{estadoBadge(f.estado)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setSelectedFactura(f)}
                          title="Ver detalle"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Tab: Config ───────────────────────────────────────────────── */}
          <TabsContent value="config" className="mt-4">
            <div className="max-w-2xl space-y-6">
              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <h2 className="font-semibold">Datos del Emisor</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cuit">CUIT <span className="text-red-400">*</span></Label>
                    <Input
                      id="cuit" placeholder="20-12345678-9"
                      value={cfgForm.cuit}
                      onChange={e => setCfgForm(p => ({ ...p, cuit: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="punto_venta">Punto de Venta <span className="text-red-400">*</span></Label>
                    <Input
                      id="punto_venta" type="number" min="1" max="9999"
                      value={cfgForm.punto_venta}
                      onChange={e => setCfgForm(p => ({ ...p, punto_venta: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="razon_social">Razón Social <span className="text-red-400">*</span></Label>
                  <Input
                    id="razon_social" placeholder="Mi Empresa S.R.L."
                    value={cfgForm.razon_social}
                    onChange={e => setCfgForm(p => ({ ...p, razon_social: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="domicilio_fiscal">Domicilio Fiscal</Label>
                  <Input
                    id="domicilio_fiscal" placeholder="Av. Siempreviva 742, Buenos Aires"
                    value={cfgForm.domicilio_fiscal}
                    onChange={e => setCfgForm(p => ({ ...p, domicilio_fiscal: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Condición IVA</Label>
                    <Select
                      value={cfgForm.condicion_iva}
                      onValueChange={v => setCfgForm(p => ({ ...p, condicion_iva: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                        <SelectItem value="monotributo">Monotributo</SelectItem>
                        <SelectItem value="exento">Exento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ambiente</Label>
                    <Select
                      value={cfgForm.ambiente}
                      onValueChange={v => setCfgForm(p => ({ ...p, ambiente: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homologacion">Homologación (pruebas)</SelectItem>
                        <SelectItem value="produccion">Producción</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <div>
                  <h2 className="font-semibold">Certificado Digital ARCA</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generá el certificado en el portal de ARCA (Servicios &rarr; Administración de Certificados Digitales) y pegá el contenido acá. Solo necesitás actualizarlo cuando el certificado venza.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cert">Certificado (.pem)</Label>
                  <textarea
                    id="cert"
                    rows={5}
                    placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                    value={cfgForm.certificado_pem}
                    onChange={e => setCfgForm(p => ({ ...p, certificado_pem: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="key">Clave Privada (.pem)</Label>
                  <textarea
                    id="key"
                    rows={5}
                    placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                    value={cfgForm.clave_pem}
                    onChange={e => setCfgForm(p => ({ ...p, clave_pem: e.target.value }))}
                  />
                </div>

                {config?.wsaa_expires_at && (
                  <div className="text-xs text-muted-foreground">
                    Token WSAA válido hasta: <strong>{formatDate(config.wsaa_expires_at)}</strong>
                  </div>
                )}
              </div>

              <Button onClick={saveConfig} disabled={configLoading} className="gap-2">
                {configLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                Guardar configuración
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Modal: Nueva Factura ──────────────────────────────────────────── */}
      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Factura Electrónica</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Tipo comprobante */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Comprobante</Label>
                <Select
                  value={nfForm.tipo_comprobante}
                  onValueChange={v => setNfForm(p => ({ ...p, tipo_comprobante: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="11">Factura C (Monotributo)</SelectItem>
                    <SelectItem value="6">Factura B (RI a CF)</SelectItem>
                    <SelectItem value="1">Factura A (RI a RI)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Receptor */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold border-b border-border pb-1">Receptor</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre / Razón Social <span className="text-red-400">*</span></Label>
                  <Input
                    placeholder="Juan García"
                    value={nfForm.receptor_nombre}
                    onChange={e => setNfForm(p => ({ ...p, receptor_nombre: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo Documento</Label>
                  <Select
                    value={nfForm.receptor_tipo_doc}
                    onValueChange={v => setNfForm(p => ({ ...p, receptor_tipo_doc: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="96">DNI</SelectItem>
                      <SelectItem value="80">CUIT</SelectItem>
                      <SelectItem value="86">CUIL</SelectItem>
                      <SelectItem value="99">Sin documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>N° Documento</Label>
                  <Input
                    placeholder="12345678"
                    value={nfForm.receptor_nro_doc}
                    onChange={e => setNfForm(p => ({ ...p, receptor_nro_doc: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Condición IVA</Label>
                  <Select
                    value={nfForm.receptor_condicion_iva}
                    onValueChange={v => setNfForm(p => ({ ...p, receptor_condicion_iva: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                      <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                      <SelectItem value="exento">Exento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Domicilio</Label>
                <Input
                  placeholder="Opcional"
                  value={nfForm.receptor_domicilio}
                  onChange={e => setNfForm(p => ({ ...p, receptor_domicilio: e.target.value }))}
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold border-b border-border pb-1">Ítems</h3>
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-0.5">
                <div className="col-span-4">Descripción</div>
                <div className="col-span-2">Cant.</div>
                <div className="col-span-2">Precio unit.</div>
                <div className="col-span-2">IVA</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <div className="space-y-2">
                {nfItems.map((item, i) => (
                  <ItemRow
                    key={i} item={item} index={i}
                    onChange={updateItem} onRemove={removeItem}
                  />
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Agregar ítem
              </Button>
            </div>

            {/* Totales */}
            <div className="flex justify-end">
              <div className="space-y-1 text-sm min-w-[200px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal neto</span>
                  <span>${totalesPreview.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border pt-1">
                  <span>Total</span>
                  <span>${totalesPreview.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setShowNewModal(false)}>Cancelar</Button>
              <Button onClick={emitFactura} disabled={emitLoading || !nfForm.receptor_nombre} className="gap-2">
                {emitLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {emitLoading ? "Emitiendo..." : "Emitir factura"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Preview PDF ────────────────────────────────────────────── */}
      <Dialog open={!!previewHtml} onOpenChange={() => setPreviewHtml(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Vista previa de factura
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-2">
            {previewHtml && (
              <iframe
                srcDoc={previewHtml}
                className="w-full border-0 rounded"
                style={{ height: "60vh" }}
                title="Factura"
              />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              variant="outline" size="sm"
              onClick={() => {
                if (!previewHtml) return
                const blob = new Blob([previewHtml], { type: "text/html" })
                const url  = URL.createObjectURL(blob)
                const a    = document.createElement("a"); a.href = url; a.download = "factura.html"; a.click()
                URL.revokeObjectURL(url)
              }}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Descargar HTML
            </Button>
            <Button size="sm" onClick={() => setPreviewHtml(null)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Detalle Factura ────────────────────────────────────────── */}
      <Dialog open={!!selectedFactura} onOpenChange={() => setSelectedFactura(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedFactura ? `${TIPO_LABELS[selectedFactura.tipo_comprobante]} ${formatNro(selectedFactura.punto_venta, selectedFactura.numero)}` : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedFactura && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Fecha</p><p>{formatDate(selectedFactura.fecha_emision)}</p></div>
                <div><p className="text-xs text-muted-foreground">Estado</p>{estadoBadge(selectedFactura.estado)}</div>
                <div><p className="text-xs text-muted-foreground">Receptor</p><p>{selectedFactura.receptor_nombre}</p></div>
                <div><p className="text-xs text-muted-foreground">Doc</p><p>{selectedFactura.receptor_nro_doc ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">CAE</p><p className="font-mono text-xs">{selectedFactura.cae ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Vto. CAE</p><p>{selectedFactura.cae_vto ? formatDate(selectedFactura.cae_vto) : "—"}</p></div>
              </div>
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${selectedFactura.subtotal.toFixed(2)}</span></div>
                {selectedFactura.iva_105 > 0 && <div className="flex justify-between text-muted-foreground"><span>IVA 10.5%</span><span>${selectedFactura.iva_105.toFixed(2)}</span></div>}
                {selectedFactura.iva_21  > 0 && <div className="flex justify-between text-muted-foreground"><span>IVA 21%</span><span>${selectedFactura.iva_21.toFixed(2)}</span></div>}
                {selectedFactura.iva_27  > 0 && <div className="flex justify-between text-muted-foreground"><span>IVA 27%</span><span>${selectedFactura.iva_27.toFixed(2)}</span></div>}
                <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Total</span><span>${selectedFactura.total.toFixed(2)}</span></div>
              </div>
              {selectedFactura.error_msg && (
                <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{selectedFactura.error_msg}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
