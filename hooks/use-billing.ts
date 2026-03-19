"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ArcaConfig,
  ConfigFormState,
  Factura,
  FacturaItem,
  NewFormState,
  EMPTY_CONFIG_FORM,
  EMPTY_ITEM,
  LIMIT,
  calcItem,
} from "@/components/billing/types"

export function useBilling() {
  const [activeTab, setActiveTab] = useState("facturas")

  // ── Multi-empresa ──────────────────────────────────────────────────────────
  const [empresas, setEmpresas] = useState<ArcaConfig[]>([])
  const [empresaActivaId, setEmpresaActivaId] = useState<string | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [deletingEmpresa, setDeletingEmpresa] = useState(false)
  // empresa activa derivada
  const config = empresas.find((e) => e.id === empresaActivaId) ?? empresas[0] ?? null

  const [configForm, setConfigForm] = useState<ConfigFormState>(EMPTY_CONFIG_FORM())
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cloningFrom, setCloningFrom] = useState<string | null>(null)

  const cloneEmpresa = (empresaId: string) => {
    const origen = empresas.find((e) => e.id === empresaId)
    if (!origen) return
    setConfigForm({
      id: "",
      punto_venta: "",
      nombre_empresa: "",
      cuit: origen.cuit || "",
      razon_social: origen.razon_social || "",
      domicilio_fiscal: origen.domicilio_fiscal || "",
      condicion_iva: origen.condicion_iva || "responsable_inscripto",
      ambiente: origen.ambiente || "homologacion",
      cert_pem: (origen as any).cert_pem || "",
      clave_pem: (origen as any).clave_pem || (origen as any).private_key_pem || "",
      telefono: "",
      email: "",
      web: "",
      instagram: "",
      facebook: "",
      whatsapp: "",
      iva_default: origen.iva_default ?? 21,
      nota_factura: "",
      datos_pago: "",
      logo_url: "",
      factura_opciones: {
        mostrar_logo: true,
        mostrar_datos_contacto: true,
        mostrar_redes: true,
        mostrar_nota: true,
        mostrar_datos_pago: true,
        mostrar_domicilio: true,
      },
    })
    setCloningFrom(empresaId)
    setActiveTab("config")
  }

  // ── Padron lookup ─────────────────────────────────────────────────────────
  const [padronStatus, setPadronStatus] = useState<"idle" | "loading" | "found" | "error">("idle")
  const [padronMsg, setPadronMsg] = useState<string>("")

  const lookupPadron = useCallback(async (doc: string, tipo: string) => {
    const limpio = doc.replace(/\D/g, "")
    if (!limpio || tipo === "99") return
    setPadronStatus("loading")
    setPadronMsg("")
    try {
      const res = await fetch(`/api/billing/padron?cuit=${limpio}`)
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPadronStatus("error")
        setPadronMsg(data.error || "No se encontro el contribuyente en el padron ARCA")
        return
      }
      const p = data.persona
      const nombre = p.razonSocial || [p.apellido, p.nombre].filter(Boolean).join(", ")
      const domicilio = [p.domicilioFiscal, p.localidad, p.provincia, p.codigoPostal ? `(${p.codigoPostal})` : ""]
        .filter(Boolean)
        .join(", ")
      const tieneIvaRI = p.impuestos.some((i: any) => i.id === 30 && i.estado === "ACTIVO")
      const tieneMonotrib = p.impuestos.some((i: any) => (i.id === 20 || i.id === 21) && i.estado === "ACTIVO")
      const condIva = tieneIvaRI ? "responsable_inscripto" : tieneMonotrib ? "monotributo" : "consumidor_final"

      setNewForm((prev) => ({
        ...prev,
        receptor_nombre: nombre || prev.receptor_nombre,
        receptor_domicilio: domicilio || prev.receptor_domicilio,
        receptor_condicion_iva: condIva,
      }))
      setPadronStatus("found")
      setPadronMsg(nombre || "Contribuyente encontrado")
    } catch {
      setPadronStatus("error")
      setPadronMsg("Error consultando el padron. Verifica la configuracion ARCA.")
    }
  }, [])

  const [configMsg, setConfigMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  // Facturas
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loadingF, setLoadingF] = useState(false)
  const [searchQ, setSearchQ] = useState("")
  const [filterEstado, setFilterEstado] = useState("all")

  // Refetch billing de facturas ya emitidas
  const [refetchingId, setRefetchingId] = useState<string | null>(null)

  async function refetchBilling(facturaId: string) {
    setRefetchingId(facturaId)
    try {
      const r = await fetch(`/api/billing/facturas/${facturaId}/refetch-billing`, { method: "POST" })
      const d = await r.json()
      if (d.ok) {
        setFacturas((prev) => prev.map((f) => (f.id === facturaId ? { ...f, ...d.factura } : f)))
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
  const [showNew, setShowNew] = useState(false)
  const [emitting, setEmitting] = useState(false)
  const [emitError, setEmitError] = useState<string | null>(null)
  const [newForm, setNewForm] = useState<NewFormState>({
    tipo_comprobante: "6",
    concepto: "1",
    tipo_doc_receptor: "99",
    nro_doc_receptor: "",
    receptor_nombre: "",
    receptor_domicilio: "",
    receptor_condicion_iva: "consumidor_final",
    moneda: "PES",
  })
  const [items, setItems] = useState<Partial<FacturaItem>[]>([EMPTY_ITEM(21)])

  // ── Data loading ──────────────────────────────────────────────────────────

  const populateForm = (e: ArcaConfig) => {
    setConfigForm({
      id: e.id || "",
      nombre_empresa: e.nombre_empresa || "",
      cuit: e.cuit || "",
      razon_social: e.razon_social || "",
      domicilio_fiscal: e.domicilio_fiscal || "",
      punto_venta: String(e.punto_venta || "1"),
      condicion_iva: e.condicion_iva || "responsable_inscripto",
      ambiente: e.ambiente || "homologacion",
      cert_pem: (e as any).cert_pem || "",
      clave_pem: (e as any).clave_pem || (e as any).private_key_pem || "",
      telefono: e.telefono || "",
      email: e.email || "",
      web: e.web || "",
      instagram: e.instagram || "",
      facebook: e.facebook || "",
      whatsapp: e.whatsapp || "",
      iva_default: e.iva_default ?? 21,
      nota_factura: e.nota_factura || "",
      datos_pago: e.datos_pago || "",
      logo_url: e.logo_url || "",
      factura_opciones: e.factura_opciones || {
        mostrar_logo: true,
        mostrar_datos_contacto: true,
        mostrar_redes: true,
        mostrar_nota: true,
        mostrar_datos_pago: true,
        mostrar_domicilio: true,
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
    const emp = empresas.find((e) => e.id === id)
    if (emp) populateForm(emp)
    setFacturas([])
    setPage(0)
  }

  const loadFacturas = useCallback(
    async (p = 0) => {
      if (!empresaActivaId) return
      setLoadingF(true)
      try {
        const params = new URLSearchParams({
          page: String(p + 1),
          limit: String(LIMIT),
          empresa_id: empresaActivaId,
          ...(filterEstado !== "all" && { estado: filterEstado }),
          ...(searchQ && { q: searchQ }),
        })
        const r = await fetch(`/api/billing/facturas?${params}`)
        const d = await r.json()
        if (d.ok) {
          setFacturas(d.facturas)
          setTotal(d.total)
        }
      } finally {
        setLoadingF(false)
      }
    },
    [filterEstado, searchQ, empresaActivaId],
  )

  useEffect(() => {
    loadConfig()
  }, [loadConfig])
  useEffect(() => {
    loadFacturas(page)
  }, [loadFacturas, page])

  // ── Config save ───────────────────────────────────────────────────────────

  const saveConfig = async () => {
    setSavingConfig(true)
    setConfigMsg(null)
    try {
      const r = await fetch("/api/billing/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...configForm, id: configForm.id || undefined }),
      })
      const d = await r.json()
      if (d.ok) {
        setConfigMsg({
          type: "ok",
          text: cloningFrom ? "Nuevo punto de venta creado." : "Empresa guardada correctamente.",
        })
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
        const remaining = empresas.filter((e) => e.id !== id)
        setEmpresas(remaining)
        const next = remaining[0] ?? null
        setEmpresaActivaId(next?.id ?? null)
        if (next) {
          populateForm(next)
          localStorage.setItem("billing_empresa_activa", next.id)
        } else setConfigForm(EMPTY_CONFIG_FORM())
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
    setEmitting(true)
    setEmitError(null)
    try {
      const typedItems = items.map(calcItem).filter((i) => i.descripcion && i.cantidad > 0)
      if (!typedItems.length) {
        setEmitError("Agrega al menos un item con descripcion y cantidad.")
        setEmitting(false)
        return
      }

      const r = await fetch("/api/billing/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newForm, items: typedItems, empresa_id: empresaActivaId }),
      })
      const d = await r.json()
      if (d.ok) {
        setShowNew(false)
        setNewForm({
          tipo_comprobante: "6",
          concepto: "1",
          tipo_doc_receptor: "99",
          nro_doc_receptor: "",
          receptor_nombre: "",
          receptor_domicilio: "",
          receptor_condicion_iva: "consumidor_final",
          moneda: "PES",
        })
        setItems([EMPTY_ITEM(configForm.iva_default)])
        setPadronStatus("idle")
        setPadronMsg("")
        loadFacturas(0)
        setPage(0)
      } else {
        setEmitError(d.error || "Error al emitir")
      }
    } finally {
      setEmitting(false)
    }
  }

  // ── SKU/EAN lookup per item ────────────────────────────────────────────────

  const [skuInput, setSkuInput] = useState<string[]>([""])
  const [skuStatus, setSkuStatus] = useState<("idle" | "loading" | "found" | "notfound")[]>(["idle"])

  const lookupProduct = useCallback(async (idx: number, query: string) => {
    if (!query.trim()) return
    setSkuStatus((prev) => {
      const n = [...prev]
      n[idx] = "loading"
      return n
    })
    try {
      const res = await fetch(`/api/billing/product-lookup?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      if (data.products?.length > 0) {
        const p = data.products[0]
        setItems((prev) =>
          prev.map((it, i) =>
            i === idx ? { ...it, descripcion: p.title, precio_unitario: p.price ?? it.precio_unitario } : it,
          ),
        )
        setSkuStatus((prev) => {
          const n = [...prev]
          n[idx] = "found"
          return n
        })
      } else {
        setSkuStatus((prev) => {
          const n = [...prev]
          n[idx] = "notfound"
          return n
        })
      }
    } catch {
      setSkuStatus((prev) => {
        const n = [...prev]
        n[idx] = "notfound"
        return n
      })
    }
  }, [])

  // Sincronizar tamano de arrays de lookup con items
  useEffect(() => {
    setSkuInput((prev) => {
      const arr = [...prev]
      while (arr.length < items.length) arr.push("")
      return arr.slice(0, items.length)
    })
    setSkuStatus((prev) => {
      const arr = [...prev]
      while (arr.length < items.length) arr.push("idle")
      return arr.slice(0, items.length)
    })
  }, [items.length])

  // ── Items helpers ─────────────────────────────────────────────────────────

  const updateItem = (idx: number, field: keyof FacturaItem, value: any) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
    if (field === "descripcion") {
      setSkuStatus((prev) => {
        const n = [...prev]
        n[idx] = "idle"
        return n
      })
    }
  }

  const addItem = () => setItems((prev) => [...prev, EMPTY_ITEM(configForm.iva_default)])
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const calcedItems = items.map(calcItem)
  const totales = calcedItems.reduce(
    (acc, i) => ({
      subtotal: acc.subtotal + i.subtotal,
      iva: acc.iva + i.iva,
      total: acc.total + i.subtotal + i.iva,
    }),
    { subtotal: 0, iva: 0, total: 0 },
  )

  const totalPages = Math.ceil(total / LIMIT)

  // ── Logo upload handler ───────────────────────────────────────────────────

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const r = await fetch("/api/billing/logo", { method: "POST", body: fd })
      const d = await r.json()
      if (d.ok) setConfigForm((p) => ({ ...p, logo_url: d.url }))
      else alert(d.error)
    } finally {
      setUploadingLogo(false)
    }
  }

  // ── Open new invoice dialog ───────────────────────────────────────────────

  const openNewInvoice = () => {
    if (!config) {
      setActiveTab("config")
    } else {
      setItems([EMPTY_ITEM(configForm.iva_default)])
      setSkuInput([""])
      setSkuStatus(["idle"])
      setPadronStatus("idle")
      setPadronMsg("")
      setShowNew(true)
    }
  }

  const onNewDialogOpenChange = (open: boolean) => {
    if (open) {
      setItems([EMPTY_ITEM(configForm.iva_default)])
      setSkuInput([""])
      setSkuStatus(["idle"])
      setPadronStatus("idle")
      setPadronMsg("")
    }
    setShowNew(open)
  }

  return {
    // Tab
    activeTab,
    setActiveTab,
    // Multi-empresa
    empresas,
    empresaActivaId,
    setEmpresaActivaId,
    loadingConfig,
    config,
    switchEmpresa,
    cloneEmpresa,
    populateForm,
    // Config form
    configForm,
    setConfigForm,
    savingConfig,
    saveConfig,
    deletingEmpresa,
    deleteEmpresa,
    confirmDelete,
    setConfirmDelete,
    cloningFrom,
    setCloningFrom,
    configMsg,
    setConfigMsg,
    uploadingLogo,
    uploadLogo,
    // Facturas
    facturas,
    total,
    page,
    setPage,
    loadingF,
    loadFacturas,
    searchQ,
    setSearchQ,
    filterEstado,
    setFilterEstado,
    totalPages,
    refetchingId,
    refetchBilling,
    // New invoice
    showNew,
    setShowNew,
    openNewInvoice,
    onNewDialogOpenChange,
    emitting,
    emitError,
    emitirFactura,
    newForm,
    setNewForm,
    items,
    setItems,
    addItem,
    removeItem,
    updateItem,
    calcedItems,
    totales,
    // SKU lookup
    skuInput,
    setSkuInput,
    skuStatus,
    setSkuStatus,
    lookupProduct,
    // Padron
    padronStatus,
    setPadronStatus,
    padronMsg,
    setPadronMsg,
    lookupPadron,
  }
}

export type UseBillingReturn = ReturnType<typeof useBilling>
