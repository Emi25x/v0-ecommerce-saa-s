"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Tag, Pencil, Trash2, ChevronRight, Loader2,
  TrendingUp, DollarSign, Percent, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

// ── Types ──────────────────────────────────────────────────────────────────

interface Warehouse {
  id:            string
  name:          string
  code:          string | null
  base_currency: string | null
}

interface PriceList {
  id:             string
  name:           string
  description:    string | null
  channel:        string
  currency:       string
  pricing_base:   string
  is_active:      boolean
  margin_min:     number | null
  markup_default: number | null
  round_to:       number | null
  updated_at:     string
  warehouse_id:   string | null
  warehouse?:     Warehouse | null
}

const EMPTY_FORM = (): Partial<PriceList> => ({
  name:           "",
  description:    "",
  channel:        "ml",
  currency:       "ARS",
  pricing_base:   "cost",
  is_active:      true,
  margin_min:     10,
  markup_default: 35,
  round_to:       null,
  warehouse_id:   null,
})

const CHANNEL_OPTS = [
  { value: "ml",         label: "Mercado Libre" },
  { value: "shopify",    label: "Shopify" },
  { value: "web",        label: "Web" },
  { value: "mayorista",  label: "Mayorista" },
  { value: "minorista",  label: "Minorista" },
]
const CURRENCY_OPTS = [
  { value: "ARS", label: "ARS — Pesos" },
  { value: "USD", label: "USD — Dólares" },
  { value: "BRL", label: "BRL — Reales" },
]
const BASE_OPTS = [
  { value: "cost",   label: "Costo",    desc: "Markup sobre costo de compra" },
  { value: "pvp",    label: "PVP",      desc: "Descuento desde precio de venta" },
  { value: "hybrid", label: "Híbrido",  desc: "Margen mínimo garantizado" },
]
const BASE_COLOR: Record<string, string> = {
  cost:   "border-blue-500/40 bg-blue-500/10 text-blue-400",
  pvp:    "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  hybrid: "border-amber-500/40 bg-amber-500/10 text-amber-400",
}

const relDate = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const m    = Math.floor(diff / 60000)
  if (m < 1)   return "ahora"
  if (m < 60)  return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PricingListsPage() {
  const router      = useRouter()
  const { toast }   = useToast()
  const [lists,      setLists]      = useState<PriceList[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM())
  const [editId,     setEditId]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rLists, rWh] = await Promise.all([
        fetch("/api/pricing/lists").then(r => r.json()),
        fetch("/api/warehouses").then(r => r.json()),
      ])
      if (rLists.ok) setLists(rLists.lists ?? [])
      if (rWh.ok)    setWarehouses(rWh.warehouses ?? rWh.data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setForm(EMPTY_FORM())
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (l: PriceList) => {
    setForm({ ...l })
    setEditId(l.id)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name?.trim()) return
    setSaving(true)
    try {
      const url    = editId ? `/api/pricing/lists/${editId}` : "/api/pricing/lists"
      const method = editId ? "PATCH" : "POST"
      const res    = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: editId ? "Lista actualizada" : "Lista creada" })
      setShowForm(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  const del = async (id: string) => {
    setDeleting(id)
    try {
      const res  = await fetch(`/api/pricing/lists/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: "Lista eliminada" })
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally { setDeleting(null) }
  }

  const set = (k: keyof PriceList, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Listas de precios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configurá reglas de markup, margen y canal para cada lista.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nueva lista
          </Button>
        </div>
      </div>

      {/* Grid de listas */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-40" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 flex flex-col items-center gap-3 text-center">
          <Tag className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-muted-foreground">No hay listas de precios creadas.</p>
          <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1.5" /> Crear primera lista</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map(l => (
            <div
              key={l.id}
              className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:border-muted-foreground/50 transition-colors cursor-pointer"
              onClick={() => router.push(`/pricing/lists/${l.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{l.name}</span>
                    {!l.is_active && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">INACTIVA</span>
                    )}
                  </div>
                  {l.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.description}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => openEdit(l)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => del(l.id)}
                    disabled={deleting === l.id}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    {deleting === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${BASE_COLOR[l.pricing_base] ?? "border-border text-muted-foreground bg-muted/20"}`}>
                  {BASE_OPTS.find(b => b.value === l.pricing_base)?.label ?? l.pricing_base}
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                  {CHANNEL_OPTS.find(c => c.value === l.channel)?.label ?? l.channel}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                  {l.currency}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto pt-1 border-t border-border">
                {l.markup_default != null && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Markup {l.markup_default}%
                  </span>
                )}
                {l.margin_min != null && (
                  <span className="flex items-center gap-1">
                    <Percent className="h-3 w-3" /> Margen mín. {l.margin_min}%
                  </span>
                )}
                <span className="ml-auto">{relDate(l.updated_at)}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">{editId ? "Editar lista" : "Nueva lista de precios"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">

              {/* Nombre */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Nombre *</label>
                <input
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  placeholder="ej: ML Clásica +35%"
                  value={form.name ?? ""}
                  onChange={e => set("name", e.target.value)}
                />
              </div>

              {/* Descripción */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Descripción</label>
                <input
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  placeholder="Opcional"
                  value={form.description ?? ""}
                  onChange={e => set("description", e.target.value)}
                />
              </div>

              {/* Canal / Moneda */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Canal</label>
                  <select
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    value={form.channel ?? "ml"}
                    onChange={e => set("channel", e.target.value)}
                  >
                    {CHANNEL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Moneda</label>
                  <select
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    value={form.currency ?? "ARS"}
                    onChange={e => set("currency", e.target.value)}
                  >
                    {CURRENCY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Base de precio */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Base de precio</label>
                <div className="grid grid-cols-3 gap-2">
                  {BASE_OPTS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => set("pricing_base", o.value)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                        form.pricing_base === o.value
                          ? BASE_COLOR[o.value]
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      <div className="text-sm font-medium">{o.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{o.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Markup / Margen */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Markup default %</label>
                  <input
                    type="number" min={0} max={500} step={0.5}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    value={form.markup_default ?? ""}
                    onChange={e => set("markup_default", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Margen mínimo %</label>
                  <input
                    type="number" min={0} max={100} step={0.5}
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                    value={form.margin_min ?? ""}
                    onChange={e => set("margin_min", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Redondeo */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Redondear a múltiplo de</label>
                <input
                  type="number" min={0} step={1}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="ej: 100 → 15.340 → 15.300"
                  value={form.round_to ?? ""}
                  onChange={e => set("round_to", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>

              {/* Activa */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary w-4 h-4"
                  checked={form.is_active ?? true}
                  onChange={e => set("is_active", e.target.checked)}
                />
                <span className="text-sm">Lista activa</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={save} disabled={saving || !form.name?.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {editId ? "Guardar cambios" : "Crear lista"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
