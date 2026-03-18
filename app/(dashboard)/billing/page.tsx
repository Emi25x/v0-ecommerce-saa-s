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
  HelpCircle, ExternalLink, ChevronDown, ChevronUp, ShieldCheck, Key, Globe, Terminal,
  Barcode, Loader2, X, Tag,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArcaConfig {
  id: string
  cuit: string
  razon_social: string
  nombre_empresa: string | null
  domicilio_fiscal: string
  punto_venta: number
  condicion_iva: string
  ambiente: string
  wsaa_expires_at: string | null
  logo_url?: string | null
  telefono?: string | null
  email?: string | null
  web?: string | null
  instagram?: string | null
  facebook?: string | null
  whatsapp?: string | null
  nota_factura?: string | null
  datos_pago?: string | null
  factura_opciones?: any
  iva_default?: number
  cert_pem?: string | null
  clave_pem?: string | null
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
  orden_id: string | null
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

const EMPTY_ITEM = (ivaDefault: 0 | 10.5 | 21 | 27 = 21): Partial<FacturaItem> => ({
  descripcion: "", cantidad: 1, precio_unitario: 0, alicuota_iva: ivaDefault, subtotal: 0, iva: 0,
})

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState("facturas")

  // ── Multi-empresa ──────────────────────────────────────────────────────────
  const [empresas, setEmpresas]               = useState<ArcaConfig[]>([])
  const [empresaActivaId, setEmpresaActivaId] = useState<string | null>(null)
  const [loadingConfig, setLoadingConfig]     = useState(true)
  const [savingConfig, setSavingConfig]       = useState(false)
  const [deletingEmpresa, setDeletingEmpresa] = useState(false)
  // empresa activa derivada
  const config = empresas.find(e => e.id === empresaActivaId) ?? empresas[0] ?? null

  const EMPTY_CONFIG_FORM = () => ({
    id: "",
    // ARCA
    cuit: "", razon_social: "", nombre_empresa: "", domicilio_fiscal: "", punto_venta: "1",
    condicion_iva: "responsable_inscripto", ambiente: "homologacion",
    cert_pem: "", clave_pem: "",
    // Contacto y redes
    telefono: "", email: "", web: "", instagram: "", facebook: "", whatsapp: "",
    // Contenido de la factura
    iva_default: 21,
    nota_factura: "", datos_pago: "",
    // Logo
    logo_url: "",
    // Visibilidad
    factura_opciones: {
      mostrar_logo:            true,
      mostrar_datos_contacto:  true,
      mostrar_redes:           true,
      mostrar_nota:            true,
      mostrar_datos_pago:      true,
      mostrar_domicilio:       true,
    },
  })

  const [configForm, setConfigForm]       = useState(EMPTY_CONFIG_FORM())
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cloningFrom,  setCloningFrom]    = useState<string | null>(null)   // id empresa origen del PV

  const cloneEmpresa = (empresaId: string) => {
    const origen = empresas.find(e => e.id === empresaId)
    if (!origen) return
    setConfigForm({
      id:               "",          // nueva
      punto_venta:      "",          // el usuario lo define
      nombre_empresa:   "",          // el usuario lo define
      // Datos ARCA compartidos
      cuit:             origen.cuit || "",
      razon_social:     origen.razon_social || "",
      domicilio_fiscal: origen.domicilio_fiscal || "",
      condicion_iva:    origen.condicion_iva || "responsable_inscripto",
      ambiente:         origen.ambiente || "homologacion",
      cert_pem:         (origen as any).cert_pem || "",
      clave_pem:        (origen as any).clave_pem || (origen as any).private_key_pem || "",
      // Visual en blanco (propio del PV)
      telefono: "", email: "", web: "", instagram: "", facebook: "", whatsapp: "",
      iva_default:  origen.iva_default ?? 21,
      nota_factura: "", datos_pago: "",
      logo_url:     "",
      factura_opciones: {
        mostrar_logo: true, mostrar_datos_contacto: true, mostrar_redes: true,
        mostrar_nota: true, mostrar_datos_pago: true, mostrar_domicilio: true,
      },
    })
    setCloningFrom(empresaId)
    setActiveTab("config")
  }

  // ── Padrón lookup ─────────────────────────────────────────────────────────
  const [padronStatus, setPadronStatus] = useState<"idle"|"loading"|"found"|"error">("idle")
  const [padronMsg,    setPadronMsg]    = useState<string>("")

  const lookupPadron = useCallback(async (doc: string, tipo: string) => {
    const limpio = doc.replace(/\D/g, "")
    if (!limpio || tipo === "99") return
    setPadronStatus("loading")
    setPadronMsg("")
    try {
      const res  = await fetch(`/api/billing/padron?cuit=${limpio}`)
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPadronStatus("error")
        setPadronMsg(data.error || "No se encontró el contribuyente en el padrón ARCA")
        return
      }
      const p = data.persona
      // Nombre/razón social
      const nombre = p.razonSocial || [p.apellido, p.nombre].filter(Boolean).join(", ")
      // Domicilio completo
      const domicilio = [p.domicilioFiscal, p.localidad, p.provincia, p.codigoPostal ? `(${p.codigoPostal})` : ""].filter(Boolean).join(", ")
      // Condición IVA — mapear desde los impuestos activos
      const tieneIvaRI  = p.impuestos.some((i: any) => i.id === 30  && i.estado === "ACTIVO")
      const tieneMonotrib = p.impuestos.some((i: any) => (i.id === 20 || i.id === 21) && i.estado === "ACTIVO")
      const condIva = tieneIvaRI ? "responsable_inscripto" : tieneMonotrib ? "monotributo" : "consumidor_final"

      setNewForm(prev => ({
        ...prev,
        receptor_nombre:       nombre || prev.receptor_nombre,
        receptor_domicilio:    domicilio || prev.receptor_domicilio,
        receptor_condicion_iva: condIva,
      }))
      setPadronStatus("found")
      setPadronMsg(nombre || "Contribuyente encontrado")
    } catch {
      setPadronStatus("error")
      setPadronMsg("Error consultando el padrón. Verificá la configuración ARCA.")
    }
  }, [])
  const [configMsg, setConfigMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  // Facturas
  const [facturas, setFacturas]   = useState<Factura[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loadingF, setLoadingF]   = useState(false)
  const [searchQ, setSearchQ]     = useState("")
  const [filterEstado, setFilterEstado] = useState("all")
  const LIMIT = 20

  // Refetch billing de facturas ya emitidas
  const [refetchingId, setRefetchingId] = useState<string | null>(null)

  async function refetchBilling(facturaId: string) {
    setRefetchingId(facturaId)
    try {
      const r = await fetch(`/api/billing/facturas/${facturaId}/refetch-billing`, { method: "POST" })
      const d = await r.json()
      if (d.ok) {
        // Actualizar la factura en la lista local
        setFacturas(prev => prev.map(f => f.id === facturaId ? { ...f, ...d.factura } : f))
      } else {
        alert(`Error al actualizar datos fiscales: ${d.error}`)
      }
    } catch {
      alert("Error de red al actualizar datos fiscales")
    } finally {
      setRefetchingId(null)
    }
  }

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
  const [items, setItems]         = useState<Partial<FacturaItem>[]>([EMPTY_ITEM(21)])

  // ── Data loading ──────────────────────────────────────────────────────────

  const populateForm = (e: ArcaConfig) => {
    setConfigForm({
      id:               e.id || "",
      nombre_empresa:   e.nombre_empresa || "",
      cuit:             e.cuit || "",
      razon_social:     e.razon_social || "",
      domicilio_fiscal: e.domicilio_fiscal || "",
      punto_venta:      String(e.punto_venta || "1"),
      condicion_iva:    e.condicion_iva || "responsable_inscripto",
      ambiente:         e.ambiente || "homologacion",
      cert_pem:         (e as any).cert_pem || "",
      clave_pem:        (e as any).clave_pem || (e as any).private_key_pem || "",
      telefono:         e.telefono || "",
      email:            e.email || "",
      web:              e.web || "",
      instagram:        e.instagram || "",
      facebook:         e.facebook || "",
      whatsapp:         e.whatsapp || "",
      iva_default:      e.iva_default ?? 21,
      nota_factura:     e.nota_factura || "",
      datos_pago:       e.datos_pago || "",
      logo_url:         e.logo_url || "",
      factura_opciones: e.factura_opciones || {
        mostrar_logo: true, mostrar_datos_contacto: true, mostrar_redes: true,
        mostrar_nota: true, mostrar_datos_pago: true, mostrar_domicilio: true,
      },
    })
  }

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const r = await fetch("/api/billing/config")
      const d = await r.json()
      if (d.empresas?.length) {
        setEmpresas(d.empresas)
        // restaurar empresa activa desde localStorage si existe
        const saved = typeof window !== "undefined" ? localStorage.getItem("billing_empresa_activa") : null
        const matchSaved = saved ? d.empresas.find((e: ArcaConfig) => e.id === saved) : null
        const activa = matchSaved || d.empresas[0]
        setEmpresaActivaId(activa.id)
        populateForm(activa)
      }
    } finally {
      setLoadingConfig(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchEmpresa = (id: string) => {
    setEmpresaActivaId(id)
    if (typeof window !== "undefined") localStorage.setItem("billing_empresa_activa", id)
    const emp = empresas.find(e => e.id === id)
    if (emp) populateForm(emp)
    setFacturas([]); setPage(0)
  }

  const loadFacturas = useCallback(async (p = 0) => {
    if (!empresaActivaId) return
    setLoadingF(true)
    try {
      const params = new URLSearchParams({
        page: String(p + 1), limit: String(LIMIT),
        empresa_id: empresaActivaId,
        ...(filterEstado !== "all" && { estado: filterEstado }),
        ...(searchQ && { q: searchQ }),
      })
      const r = await fetch(`/api/billing/facturas?${params}`)
      const d = await r.json()
      if (d.ok) { setFacturas(d.facturas); setTotal(d.total) }
    } finally {
      setLoadingF(false)
    }
  }, [filterEstado, searchQ, empresaActivaId])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { loadFacturas(page) }, [loadFacturas, page])

  // ── Config save ───────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setSavingConfig(true); setConfigMsg(null)
    try {
      const r = await fetch("/api/billing/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...configForm, id: configForm.id || undefined }),
      })
      const d = await r.json()
      if (d.ok) {
        setConfigMsg({ type: "ok", text: cloningFrom ? "Nuevo punto de venta creado." : "Empresa guardada correctamente." })
        setCloningFrom(null)
        const r2 = await fetch("/api/billing/config")
        const d2 = await r2.json()
        if (d2.empresas?.length) {
          setEmpresas(d2.empresas)
          const newId = d.empresa?.id || configForm.id || d2.empresas[0].id
          setEmpresaActivaId(newId)
          if (typeof window !== "undefined") localStorage.setItem("billing_empresa_activa", newId)
        }
      } else {
        setConfigMsg({ type: "err", text: d.error || "Error al guardar" })
      }
    } finally {
      setSavingConfig(false)
    }
  }

  const deleteEmpresa = async (id: string) => {
    if (!id) return
    setDeletingEmpresa(true)
    try {
      const r = await fetch(`/api/billing/config?id=${id}`, { method: "DELETE" })
      const d = await r.json()
      if (d.ok) {
        const remaining = empresas.filter(e => e.id !== id)
        setEmpresas(remaining)
        const next = remaining[0] ?? null
        setEmpresaActivaId(next?.id ?? null)
        if (next) { populateForm(next); localStorage.setItem("billing_empresa_activa", next.id) }
        else setConfigForm(EMPTY_CONFIG_FORM())
        setConfirmDelete(false)
      } else {
        setConfigMsg({ type: "err", text: d.error || "Error al eliminar" })
      }
    } finally {
      setDeletingEmpresa(false)
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
        body: JSON.stringify({ ...newForm, items: typedItems, empresa_id: empresaActivaId }),
      })
      const d = await r.json()
      if (d.ok) {
        setShowNew(false)
        setNewForm({ tipo_comprobante: "6", concepto: "1", tipo_doc_receptor: "99", nro_doc_receptor: "", receptor_nombre: "", receptor_domicilio: "", receptor_condicion_iva: "consumidor_final", moneda: "PES" })
        setItems([EMPTY_ITEM(configForm.iva_default as 0 | 10.5 | 21 | 27)])
        setPadronStatus("idle"); setPadronMsg("")
        loadFacturas(0); setPage(0)
      } else {
        setEmitError(d.error || "Error al emitir")
      }
    } finally {
      setEmitting(false)
    }
  }

  // ── SKU/EAN lookup per item ────────────────────────────────────────────────

  // skuInput[idx] = texto del campo SKU/EAN del ítem
  // skuStatus[idx] = "idle" | "loading" | "found" | "notfound"
  const [skuInput,  setSkuInput]  = useState<string[]>([""])
  const [skuStatus, setSkuStatus] = useState<("idle"|"loading"|"found"|"notfound")[]>(["idle"])

  const lookupProduct = useCallback(async (idx: number, query: string) => {
    if (!query.trim()) return
    setSkuStatus(prev => { const n = [...prev]; n[idx] = "loading"; return n })
    try {
      const res = await fetch(`/api/billing/product-lookup?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      if (data.products?.length > 0) {
        const p = data.products[0]
        setItems(prev => prev.map((it, i) => i === idx
          ? { ...it, descripcion: p.title, precio_unitario: p.price ?? it.precio_unitario }
          : it
        ))
        setSkuStatus(prev => { const n = [...prev]; n[idx] = "found"; return n })
      } else {
        setSkuStatus(prev => { const n = [...prev]; n[idx] = "notfound"; return n })
      }
    } catch {
      setSkuStatus(prev => { const n = [...prev]; n[idx] = "notfound"; return n })
    }
  }, [])

  // Sincronizar tamaño de arrays de lookup con items
  useEffect(() => {
    setSkuInput(prev => {
      const arr = [...prev]
      while (arr.length < items.length) arr.push("")
      return arr.slice(0, items.length)
    })
    setSkuStatus(prev => {
      const arr = [...prev]
      while (arr.length < items.length) arr.push("idle")
      return arr.slice(0, items.length)
    })
  }, [items.length])

  // ── Items helpers ─────────────────────────────────────────────────────────

  const updateItem = (idx: number, field: keyof FacturaItem, value: any) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
    // Resetear estado lookup si cambia la descripción manualmente
    if (field === "descripcion") {
      setSkuStatus(prev => { const n = [...prev]; n[idx] = "idle"; return n })
    }
  }

  const addItem = () => setItems(prev => [...prev, EMPTY_ITEM(configForm.iva_default as 0 | 10.5 | 21 | 27)])
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
          onClick={() => {
            if (!config) { setActiveTab("config") }
            else {
              setItems([EMPTY_ITEM(configForm.iva_default as 0 | 10.5 | 21 | 27)])
              setSkuInput([""]); setSkuStatus(["idle"])
              setPadronStatus("idle"); setPadronMsg("")
              setShowNew(true)
            }
          }}
          className="gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Nueva factura
        </Button>
      </div>

      {/* Selector de empresa */}
      {!loadingConfig && (
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            // Agrupar por CUIT para detectar multi-PV bajo mismo CUIT
            const cuitCount: Record<string, number> = {}
            empresas.forEach(e => { cuitCount[e.cuit] = (cuitCount[e.cuit] || 0) + 1 })

            return empresas.map(emp => {
              const isActive   = emp.id === empresaActivaId
              const nombre     = emp.nombre_empresa || emp.razon_social
              const multiPV    = cuitCount[emp.cuit] > 1   // mismo CUIT, varios PV

              return (
                <div key={emp.id} className="flex items-stretch">
                  <button
                    onClick={() => switchEmpresa(emp.id)}
                    className={`flex items-center gap-2.5 rounded-l-lg border px-3.5 py-2 text-sm font-medium transition-all ${
                      multiPV ? "rounded-l-lg rounded-r-none border-r-0" : "rounded-lg"
                    } ${
                      isActive
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,0.3)]"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{nombre}</span>
                    {multiPV && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-sm bg-muted/60 text-muted-foreground">
                        PV {String(emp.punto_venta).padStart(4, "0")}
                      </span>
                    )}
                    {isActive && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm ${
                        emp.ambiente === "produccion"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {emp.ambiente === "produccion" ? "PROD" : "HOMO"}
                      </span>
                    )}
                  </button>
                  {/* Botón "+" para clonar como nuevo PV — siempre visible */}
                  <button
                    onClick={() => cloneEmpresa(emp.id)}
                    title={`Nuevo punto de venta para ${emp.razon_social}`}
                    className={`flex items-center justify-center w-7 border border-l-0 rounded-r-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ${
                      isActive ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-card"
                    }`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )
            })
          })()}
          <button
            onClick={() => {
              setConfigForm(EMPTY_CONFIG_FORM())
              setCloningFrom(null)
              setActiveTab("config")
            }}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva empresa
          </button>
        </div>
      )}

      {/* Stats empresa activa */}
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
          <p className="text-sm font-mono font-semibold">{config?.cuit?.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3") || "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Punto de venta</p>
          {config ? (
            <>
              <p className="text-2xl font-bold font-mono">{String(config.punto_venta).padStart(4, "0")}</p>
              {config.nombre_empresa && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{config.nombre_empresa}</p>
              )}
            </>
          ) : (
            <p className="text-2xl font-bold">—</p>
          )}
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
                    <td className="p-3 flex items-center gap-1">
                      {f.cae && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="Ver factura"
                          onClick={() => window.open(`/api/billing/facturas/${f.id}/pdf`, "_blank")}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {f.orden_id && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="Re-obtener datos fiscales desde ML"
                          disabled={refetchingId === f.id}
                          onClick={() => refetchBilling(f.id)}
                        >
                          {refetchingId === f.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />
                          }
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

            {/* Banner: creando nuevo PV derivado */}
            {cloningFrom && (() => {
              const origen = empresas.find(e => e.id === cloningFrom)
              return origen ? (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-300">Nuevo punto de venta</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Derivando de <span className="font-medium text-foreground">{origen.nombre_empresa || origen.razon_social}</span>.
                      El CUIT y certificado ya fueron copiados. Solo completá el numero de punto de venta y el nombre interno.
                    </p>
                  </div>
                  <button
                    onClick={() => { setCloningFrom(null); setConfigForm(EMPTY_CONFIG_FORM()) }}
                    className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null
            })()}

            {/* ── Empresa selector dentro del tab ── */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <Label>Empresa a configurar</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {empresas.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => { setEmpresaActivaId(emp.id); populateForm(emp) }}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                          configForm.id === emp.id
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {emp.nombre_empresa || emp.razon_social}
                      </button>
                    ))}
                    <button
                      onClick={() => { setConfigForm(EMPTY_CONFIG_FORM()); setCloningFrom(null) }}
                      className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Nueva
                    </button>
                  </div>
                </div>
                {configForm.id && (
                  <div className="flex-shrink-0">
                    {!confirmDelete ? (
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
                        onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-3.5 w-3.5" />Eliminar empresa
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-red-400">¿Eliminar?</span>
                        <Button size="sm" variant="destructive" onClick={() => deleteEmpresa(configForm.id)}
                          disabled={deletingEmpresa} className="h-7 text-xs gap-1">
                          {deletingEmpresa ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                          Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Nombre interno ── */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm"><Tag className="h-4 w-4" />Nombre interno</h3>
              <div className="space-y-1.5">
                <Label>Nombre para identificar la empresa en el sistema</Label>
                <p className="text-xs text-muted-foreground">Solo visible internamente — no aparece en las facturas.</p>
                <Input
                  placeholder="Ej: Mi Tienda ML, Empresa A, Emprendimiento Personal..."
                  value={configForm.nombre_empresa}
                  onChange={e => setConfigForm(p => ({ ...p, nombre_empresa: e.target.value }))}
                />
              </div>
            </div>

            {/* ── Identidad visual ── */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" />Identidad visual</h3>

              {/* Logo upload */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {configForm.logo_url ? (
                    <div className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={configForm.logo_url}
                        alt="Logo"
                        className="h-20 w-40 object-contain rounded-md border border-border bg-muted/30"
                      />
                      <button
                        onClick={() => setConfigForm(p => ({ ...p, logo_url: "" }))}
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-20 w-40 rounded-md border-2 border-dashed border-border bg-muted/20 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                      <Building2 className="h-6 w-6 opacity-40" />
                      <span className="text-xs">Sin logo</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Label>Logo de la empresa</Label>
                  <p className="text-xs text-muted-foreground">PNG o JPG, máx. 2MB. Se mostrará en el encabezado de cada factura.</p>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploadingLogo(true)
                        try {
                          const fd = new FormData()
                          fd.append("file", file)
                          const r = await fetch("/api/billing/logo", { method: "POST", body: fd })
                          const d = await r.json()
                          if (d.ok) setConfigForm(p => ({ ...p, logo_url: d.url }))
                          else alert(d.error)
                        } finally {
                          setUploadingLogo(false)
                        }
                      }}
                    />
                    <span className={`inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:bg-muted/60 transition-colors ${uploadingLogo ? "opacity-60 pointer-events-none" : ""}`}>
                      {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3 rotate-180" />}
                      {uploadingLogo ? "Subiendo..." : "Subir logo"}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* ── Datos del emisor (ARCA) ── */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" />Datos fiscales ARCA</h3>
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

            {/* ── Contacto y redes ── */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Globe className="h-4 w-4" />Contacto y redes sociales</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <Input placeholder="+54 11 1234-5678" value={configForm.telefono} onChange={e => setConfigForm(p => ({ ...p, telefono: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp</Label>
                  <Input placeholder="+54 9 11 1234-5678" value={configForm.whatsapp} onChange={e => setConfigForm(p => ({ ...p, whatsapp: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" placeholder="info@empresa.com" value={configForm.email} onChange={e => setConfigForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Sitio web</Label>
                  <Input placeholder="www.empresa.com" value={configForm.web} onChange={e => setConfigForm(p => ({ ...p, web: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Instagram</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input className="pl-7" placeholder="miempresa" value={configForm.instagram} onChange={e => setConfigForm(p => ({ ...p, instagram: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Facebook</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input className="pl-7" placeholder="miempresa" value={configForm.facebook} onChange={e => setConfigForm(p => ({ ...p, facebook: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Contenido de la factura ── */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" />Contenido de la factura</h3>

              {/* IVA por defecto */}
              <div className="space-y-1.5">
                <Label>Alícuota de IVA por defecto</Label>
                <p className="text-xs text-muted-foreground">Se aplica automáticamente a cada ítem nuevo al crear una factura.</p>
                <Select
                  value={String(configForm.iva_default)}
                  onValueChange={v => setConfigForm(p => ({ ...p, iva_default: Number(v) }))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IVA_OPTS.map(o => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Nota opcional</Label>
                <p className="text-xs text-muted-foreground">Aparece al pie de todas las facturas (ej: "Gracias por su compra", condiciones de devolución, etc.)</p>
                <Textarea
                  placeholder="Gracias por su compra. Ante cualquier consulta contactenos a info@empresa.com"
                  className="resize-none h-20 text-sm"
                  value={configForm.nota_factura}
                  onChange={e => setConfigForm(p => ({ ...p, nota_factura: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Datos para realizar pagos</Label>
                <p className="text-xs text-muted-foreground">CBU, alias, Mercado Pago, etc. Se muestra como sección destacada en la factura.</p>
                <Textarea
                  placeholder={"CBU: 0000000000000000000000\nAlias: EMPRESA.PAGO\nMercado Pago: @miempresa"}
                  className="resize-none h-24 text-sm font-mono"
                  value={configForm.datos_pago}
                  onChange={e => setConfigForm(p => ({ ...p, datos_pago: e.target.value }))}
                />
              </div>
            </div>

            {/* ── Certificado digital ── */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Key className="h-4 w-4" />Certificado digital</h3>
              <p className="text-xs text-muted-foreground">
                El certificado .pem y la clave privada se obtienen al dar de alta el servicio en el portal de ARCA.
                Consultá la pestaña "Cómo tramitar el certificado" para instrucciones detalladas.
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Certificado (.pem)</Label>
                  <Textarea
                    placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                    className="font-mono text-xs h-28 resize-none"
                    value={configForm.cert_pem}
                    onChange={e => setConfigForm(p => ({ ...p, cert_pem: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Clave privada (.pem)</Label>
                  <Textarea
                    placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                    className="font-mono text-xs h-28 resize-none"
                    value={configForm.clave_pem}
                    onChange={e => setConfigForm(p => ({ ...p, clave_pem: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* ── Opciones de visualización ── */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Settings className="h-4 w-4" />Opciones de visualización</h3>
                <p className="text-xs text-muted-foreground mt-1">Elegí qué secciones aparecen en el PDF de cada factura por defecto.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: "mostrar_logo",           label: "Logo de la empresa" },
                  { key: "mostrar_domicilio",       label: "Domicilio fiscal" },
                  { key: "mostrar_datos_contacto",  label: "Teléfono y email" },
                  { key: "mostrar_redes",           label: "Redes sociales" },
                  { key: "mostrar_datos_pago",      label: "Datos de pago" },
                  { key: "mostrar_nota",            label: "Nota al pie" },
                ] as { key: keyof typeof configForm.factura_opciones; label: string }[]).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer group">
                    <button
                      role="checkbox"
                      aria-checked={configForm.factura_opciones[key]}
                      onClick={() => setConfigForm(p => ({
                        ...p,
                        factura_opciones: { ...p.factura_opciones, [key]: !p.factura_opciones[key] }
                      }))}
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        configForm.factura_opciones[key]
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-border bg-transparent group-hover:border-muted-foreground"
                      }`}
                    >
                      {configForm.factura_opciones[key] && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </button>
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
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

      {/* Normativa vigente */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-500/20">
          <ShieldCheck className="h-5 w-5 text-amber-400 flex-shrink-0" />
          <h3 className="font-semibold">Normativa vigente — ¿cuándo identificar al receptor?</h3>
        </div>
        <div className="px-5 py-4 space-y-4 text-sm text-muted-foreground leading-relaxed">

          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <p className="font-semibold text-foreground">Régimen General (Responsable Inscripto / Factura B)</p>
            <p>Según la <strong className="text-amber-400">RG ARCA 5700/2025</strong> (vigente desde el 29 de mayo de 2025), la identificación del Consumidor Final es obligatoria cuando el total del comprobante supera:</p>
            <div className="rounded bg-black/30 p-3 font-mono text-xs space-y-1">
              <p><span className="text-emerald-400">{'>'} $10.000.000</span> → <span className="text-foreground">Identificación OBLIGATORIA (CUIT / CUIL / CDI / DNI)</span></p>
              <p><span className="text-blue-400">≤ $10.000.000</span> → <span className="text-foreground">Sin identificación (DocTipo 99, DocNro 0)</span></p>
            </div>
            <p>Al superar el límite, solo es necesario el número de documento. Ya <strong className="text-foreground">no es obligatorio</strong> incluir nombre ni domicilio.</p>
          </div>

          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <p className="font-semibold text-foreground">Monotributistas (Factura C)</p>
            <p>El límite para no identificar al receptor en Factura C es <strong className="text-foreground">$10.000.000</strong> (mismo criterio desde RG 5700/2025).</p>
            <p>Para usar la herramienta "Facturador" de ARCA el tope es <strong className="text-foreground">$500.000</strong> (no aplica a integraciones por webservice como esta app).</p>
          </div>

          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <p className="font-semibold text-foreground">Responsable Inscripto a Responsable Inscripto (Factura A)</p>
            <p>La Factura A siempre requiere el <strong className="text-foreground">CUIT del receptor</strong> (DocTipo 80) sin excepción. No existe límite de monto ni opción de emitir sin identificar.</p>
          </div>

          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-blue-300 text-xs">
            Los montos se actualizan cada semestre (enero y julio) tomando el Índice de Precios al Consumidor (IPC) del INDEC. Esta app mostrará una advertencia automática cuando el total de la factura supere el umbral vigente.
          </div>
        </div>
      </div>

      {/* Links útiles */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><ExternalLink className="h-4 w-4 text-muted-foreground" />Links oficiales</h3>
        <div className="space-y-2 text-sm">
          {[
            { label: "Portal ARCA (Clave Fiscal)", href: "https://auth.afip.gob.ar/contribuyente_/login.xhtml" },
            { label: "RG ARCA 5700/2025 — Identificación Consumidor Final", href: "https://biblioteca.afip.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5700" },
            { label: "RG ARCA 5616 — CondicionIVAReceptor (obligatoria)", href: "https://biblioteca.afip.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5616" },
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
      <Dialog open={showNew} onOpenChange={(open) => {
        if (open) {
          setItems([EMPTY_ITEM(configForm.iva_default as 0 | 10.5 | 21 | 27)])
          setSkuInput([""]); setSkuStatus(["idle"])
          setPadronStatus("idle"); setPadronMsg("")
        }
        setShowNew(open)
      }}>
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
                    {newForm.tipo_doc_receptor === "99"
                      ? <span className="text-muted-foreground font-normal ml-1">(no requerido)</span>
                      : <span className="text-muted-foreground font-normal ml-1 text-xs">— Enter para buscar en padrón ARCA</span>
                    }
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder={newForm.tipo_doc_receptor === "99" ? "—" : "12345678"}
                      value={newForm.nro_doc_receptor}
                      onChange={e => {
                        setNewForm(p => ({ ...p, nro_doc_receptor: e.target.value }))
                        setPadronStatus("idle")
                        setPadronMsg("")
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          lookupPadron(newForm.nro_doc_receptor, newForm.tipo_doc_receptor)
                        }
                      }}
                      onBlur={() => lookupPadron(newForm.nro_doc_receptor, newForm.tipo_doc_receptor)}
                      disabled={newForm.tipo_doc_receptor === "99"}
                      className={`pr-8 ${padronStatus === "found" ? "border-emerald-500/50" : padronStatus === "error" ? "border-amber-500/50" : ""}`}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      {padronStatus === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {padronStatus === "found"   && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                      {padronStatus === "error"   && <X className="h-3.5 w-3.5 text-amber-400" />}
                    </span>
                  </div>
                  {padronStatus === "found" && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />{padronMsg}
                    </p>
                  )}
                  {padronStatus === "error" && (
                    <p className="text-xs text-amber-400 flex items-center gap-1">
                      <X className="h-3 w-3" />{padronMsg}
                    </p>
                  )}
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
              <div className="space-y-3">
                {/* Header */}
                <div className="grid grid-cols-[110px_1fr_60px_90px_80px_80px_24px] gap-2 text-xs text-muted-foreground px-1">
                  <span className="flex items-center gap-1"><Barcode className="h-3 w-3" />SKU / EAN</span>
                  <span>Descripción</span>
                  <span className="text-center">Cant.</span>
                  <span className="text-right">Precio</span>
                  <span className="text-center">IVA</span>
                  <span className="text-right">Subtotal</span>
                  <span />
                </div>
                {items.map((item, idx) => {
                  const c = calcItem(item)
                  const status = skuStatus[idx] ?? "idle"
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="grid grid-cols-[110px_1fr_60px_90px_80px_80px_24px] gap-2 items-center">
                        {/* SKU / EAN lookup */}
                        <div className="relative">
                          <Input
                            placeholder="SKU o EAN"
                            className={`h-8 text-xs pr-7 font-mono ${
                              status === "found"    ? "border-emerald-500/50 bg-emerald-500/5" :
                              status === "notfound" ? "border-amber-500/50" : ""
                            }`}
                            value={skuInput[idx] ?? ""}
                            onChange={e => {
                              const val = e.target.value
                              setSkuInput(prev => { const n = [...prev]; n[idx] = val; return n })
                              setSkuStatus(prev => { const n = [...prev]; n[idx] = "idle"; return n })
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                lookupProduct(idx, skuInput[idx] ?? "")
                              }
                            }}
                            onBlur={() => {
                              if ((skuInput[idx] ?? "").trim()) lookupProduct(idx, skuInput[idx] ?? "")
                            }}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2">
                            {status === "loading"  && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                            {status === "found"    && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                            {status === "notfound" && <X className="h-3 w-3 text-amber-400" />}
                          </span>
                        </div>
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
                      {status === "notfound" && (skuInput[idx] ?? "").trim() && (
                        <p className="text-xs text-amber-400 pl-[118px]">
                          No se encontró "{skuInput[idx]}" en la base de productos. Podés escribir la descripción manualmente.
                        </p>
                      )}
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

            {/* Advertencia RG 5700/2025 — identificación obligatoria */}
            {(() => {
              const total = totales.total
              const docTipo = newForm.tipo_doc_receptor
              const docNro  = newForm.nro_doc_receptor?.replace(/\D/g, "")
              if (total >= 10_000_000 && (docTipo === "99" || !docNro)) {
                return (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-400 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold">Identificación obligatoria (RG ARCA 5700/2025)</p>
                      <p>El total supera <strong>$10.000.000</strong>. Es obligatorio identificar al receptor con CUIT, CUIL, CDI o DNI. Seleccioná el tipo de documento e ingresá el número.</p>
                    </div>
                  </div>
                )
              }
              if (total >= 208_644 && total < 10_000_000 && docTipo === "99") {
                return (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-400 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p>Podés emitir sin identificar al receptor hasta <strong>$10.000.000</strong> (RG 5700/2025). El monto actual es ${total.toLocaleString("es-AR")}.</p>
                  </div>
                )
              }
              return null
            })()}

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
