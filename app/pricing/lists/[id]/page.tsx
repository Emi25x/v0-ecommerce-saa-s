"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ChevronLeft, Plus, Pencil, Trash2, Loader2, RefreshCw,
  Play, AlertTriangle, TrendingUp, Percent, Store, Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

// ── Types ──────────────────────────────────────────────────────────────────

interface PriceList {
  id: string; name: string; channel: string; currency: string
  pricing_base: string; markup_default: number | null; margin_min: number | null
  warehouse_id: string | null
}

interface FeeRule {
  id:                         string
  rule_type:                  string
  rule_name:                  string
  amount:                     number
  amount_type:                "percent" | "fixed"
  applies_to:                 string
  sort_order:                 number
  min_price:                  number | null
  max_price:                  number | null
  commission_pct:             number
  fixed_fee:                  number
  free_shipping_threshold:    number | null
  shipping_cost_above_threshold: number
  shipping_cost_below_threshold: number
  absorb_shipping_mode:       string
  extra_cost_amount:          number | null
  extra_cost_currency:        string | null
  extra_cost_label:           string | null
}

interface MLRules {
  id?:                     string
  channel:                 string
  ml_fee_pct:              number
  ml_fixed_fee:            number
  free_shipping_strategy:  string
  shipping_cost_full:      number
  shipping_cost_classic:   number
}

interface Warehouse {
  id: string; name: string; base_currency: string | null
}

interface ProductPrice {
  id:           string
  sku:          string | null
  ean:          string | null
  title:        string
  cost_ars:     number | null
  pvp_ars:      number | null
  final_price:  number | null
  margin_pct:   number | null
  warnings:     string[]
}

const RULE_TYPE_OPTS = [
  { value: "commission",  label: "Comisión canal" },
  { value: "fulfillment", label: "Fulfillment" },
  { value: "iva",         label: "IVA" },
  { value: "shipping",    label: "Envío" },
  { value: "custom",      label: "Personalizado" },
]
const APPLIES_OPTS = [
  { value: "all", label: "Todos los productos" },
  { value: "sku", label: "SKU específico" },
  { value: "ean", label: "EAN específico" },
]
const FREE_SHIPPING_OPTS = [
  { value: "always_free",      label: "Siempre gratis (se absorbe en precio)" },
  { value: "include_in_price", label: "Incluir costo en precio" },
  { value: "buyer_pays",       label: "Comprador paga" },
]

const EMPTY_RULE = (): Partial<FeeRule> => ({
  rule_type: "commission", rule_name: "", amount: 0,
  amount_type: "percent", applies_to: "all", sort_order: 10,
  min_price: null, max_price: null, commission_pct: 0, fixed_fee: 0,
  free_shipping_threshold: null, shipping_cost_above_threshold: 0,
  shipping_cost_below_threshold: 0, absorb_shipping_mode: "none",
  extra_cost_amount: null, extra_cost_currency: null, extra_cost_label: null,
})

const EMPTY_ML = (): MLRules => ({
  channel: "mercadolibre", ml_fee_pct: 11.5, ml_fixed_fee: 0,
  free_shipping_strategy: "always_free", shipping_cost_full: 350, shipping_cost_classic: 0,
})

function ars(n: number | null) {
  if (n == null) return "—"
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ListDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const router    = useRouter()
  const { toast } = useToast()

  const [list,          setList]          = useState<PriceList | null>(null)
  const [rules,         setRules]         = useState<FeeRule[]>([])
  const [mlRules,       setMlRules]       = useState<MLRules | null>(null)
  const [mlForm,        setMlForm]        = useState<MLRules>(EMPTY_ML())
  const [showMlForm,    setShowMlForm]    = useState(false)
  const [savingMl,      setSavingMl]      = useState(false)
  const [prices,        setPrices]        = useState<ProductPrice[]>([])
  const [warehouses,    setWarehouses]    = useState<Warehouse[]>([])
  const [loading,       setLoading]       = useState(true)
  const [recalcLoading, setRecalcLoading] = useState(false)
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState(EMPTY_RULE())
  const [editRuleId,    setEditRuleId]    = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [savingWarehouse, setSavingWarehouse] = useState(false)
  const [pricesPage,    setPricesPage]    = useState(0)
  const PRICES_PER_PAGE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rList, rRules, rPrices, rWarehouses] = await Promise.all([
        fetch(`/api/pricing/lists/${id}`).then(r => r.json()),
        fetch(`/api/pricing/lists/${id}/rules`).then(r => r.json()),
        fetch(`/api/pricing/results?list_id=${id}&limit=200`).then(r => r.json()),
        fetch("/api/warehouses").then(r => r.json()),
      ])
      if (rList.ok) {
        setList(rList.list)
        const ml = rList.list?.ml_rules
        if (ml && ml.length > 0) { setMlRules(ml[0]); setMlForm(ml[0]) }
        else { setMlRules(null); setMlForm(EMPTY_ML()) }
      }
      if (rRules.ok)      setRules(rRules.rules ?? [])
      if (rPrices.ok)     setPrices(rPrices.results ?? [])
      if (rWarehouses.ok) setWarehouses(rWarehouses.warehouses ?? [])
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const recalculate = async () => {
    setRecalcLoading(true)
    try {
      const res  = await fetch("/api/pricing/recalculate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ list_id: id }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: `Recalculados ${data.count} precios` })
      load()
    } catch (e: any) {
      toast({ title: "Error al recalcular", description: e.message, variant: "destructive" })
    } finally { setRecalcLoading(false) }
  }

  const saveWarehouse = async (warehouseId: string | null) => {
    setSavingWarehouse(true)
    try {
      const res  = await fetch(`/api/pricing/lists/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ warehouse_id: warehouseId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: "Depósito asignado" })
      setList(l => l ? { ...l, warehouse_id: warehouseId } : l)
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally { setSavingWarehouse(false) }
  }

  const saveRule = async () => {
    setSaving(true)
    try {
      const url    = editRuleId ? `/api/pricing/lists/${id}/rules/${editRuleId}` : `/api/pricing/lists/${id}/rules`
      const method = editRuleId ? "PATCH" : "POST"
      const res    = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: editRuleId ? "Regla actualizada" : "Regla creada" })
      setShowForm(false); load()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  const saveMlRules = async () => {
    setSavingMl(true)
    try {
      const res  = await fetch(`/api/pricing/lists/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ ml_rules: mlForm }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: "Reglas ML guardadas" })
      setMlRules(mlForm); setShowMlForm(false)
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally { setSavingMl(false) }
  }

  const removeMlRules = async () => {
    setSavingMl(true)
    try {
      await fetch(`/api/pricing/lists/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ ml_rules: null }),
      })
      setMlRules(null); setMlForm(EMPTY_ML())
    } finally { setSavingMl(false) }
  }

  const delRule = async (ruleId: string) => {
    try { await fetch(`/api/pricing/lists/${id}/rules/${ruleId}`, { method: "DELETE" }); load() } catch { }
  }

  const setF  = (k: keyof FeeRule, v: any)  => setForm(f => ({ ...f, [k]: v }))
  const setML = (k: keyof MLRules, v: any)  => setMlForm(f => ({ ...f, [k]: v }))

  const openNewRule  = () => { setForm(EMPTY_RULE()); setEditRuleId(null); setShowForm(true) }
  const openEditRule = (r: FeeRule) => { setForm({ ...r }); setEditRuleId(r.id); setShowForm(true) }

  const pagePrices = prices.slice(pricesPage * PRICES_PER_PAGE, (pricesPage + 1) * PRICES_PER_PAGE)
  const totalPages = Math.ceil(prices.length / PRICES_PER_PAGE)
  const selectedWarehouse = warehouses.find(w => w.id === list?.warehouse_id)

  if (loading && !list) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/pricing/lists")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{list?.name ?? "Lista"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {list?.channel} · {list?.currency} · Base: {list?.pricing_base}
            {selectedWarehouse && ` · Depósito: ${selectedWarehouse.name}`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </Button>
        <Button size="sm" onClick={recalculate} disabled={recalcLoading}>
          {recalcLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
          Recalcular
        </Button>
      </div>

      {/* Depósito asignado */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Depósito de origen</h2>
          </div>
          {savingWarehouse && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-3">
          <select
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm flex-1"
            value={list?.warehouse_id ?? ""}
            onChange={e => saveWarehouse(e.target.value || null)}
            disabled={savingWarehouse}
          >
            <option value="">Sin depósito asignado</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}{w.base_currency ? ` (${w.base_currency})` : ""}
              </option>
            ))}
          </select>
          {selectedWarehouse?.base_currency && (
            <span className="text-xs text-muted-foreground">
              Moneda base: <span className="font-semibold text-foreground">{selectedWarehouse.base_currency}</span>
              {list?.currency && selectedWarehouse.base_currency !== list.currency &&
                ` → ${list.currency} (tipo de cambio en Reglas)`
              }
            </span>
          )}
        </div>
      </section>

      {/* MercadoLibre Rules */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Reglas MercadoLibre</h2>
            {mlRules && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">
                Activo · {mlRules.ml_fee_pct}% comisión
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mlRules && (
              <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={removeMlRules} disabled={savingMl}>
                Quitar
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setMlForm(mlRules ?? EMPTY_ML()); setShowMlForm(true) }}>
              <Pencil className="h-3 w-3 mr-1" />
              {mlRules ? "Editar" : "Configurar"}
            </Button>
          </div>
        </div>

        {!mlRules ? (
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-sm">
            <Truck className="h-6 w-6 opacity-40" />
            Sin reglas ML configuradas. Esta lista no tiene comisiones de canal.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 divide-x divide-border">
            {[
              { label: "Comisión ML",      value: `${mlRules.ml_fee_pct}%` },
              { label: "Cargo fijo ML",    value: mlRules.ml_fixed_fee > 0 ? `$${mlRules.ml_fixed_fee}` : "Ninguno" },
              { label: "Estrategia envío", value: FREE_SHIPPING_OPTS.find(o => o.value === mlRules.free_shipping_strategy)?.label ?? mlRules.free_shipping_strategy },
              { label: "Costo envío Full", value: `$${mlRules.shipping_cost_full}` },
              { label: "Envío Clásico",    value: `$${mlRules.shipping_cost_classic}` },
              { label: "Canal",            value: mlRules.channel },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3">
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reglas de fee */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm">Reglas de fee por tramo de precio</h2>
          <Button size="sm" variant="outline" onClick={openNewRule}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar regla
          </Button>
        </div>
        {rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground text-sm">
            <Percent className="h-6 w-6 opacity-50" />
            Sin reglas. Agregá comisión, envío, IVA, etc.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">Tramo</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nombre</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Comisión</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cargo fijo</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Envío</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Extra</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.min_price != null ? ars(r.min_price) : "—"}
                      {" – "}
                      {r.max_price != null ? ars(r.max_price) : "∞"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{r.rule_name || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{r.commission_pct}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{r.fixed_fee > 0 ? ars(r.fixed_fee) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {r.absorb_shipping_mode !== "none"
                      ? `${ars(r.shipping_cost_below_threshold)} / ${ars(r.shipping_cost_above_threshold)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {r.extra_cost_amount != null && r.extra_cost_amount > 0
                      ? <span title={r.extra_cost_label ?? ""}>{ars(r.extra_cost_amount)}</span>
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEditRule(r)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => delRule(r.id)} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Precios calculados */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm">
            Precios calculados
            <span className="ml-2 text-xs font-normal text-muted-foreground">{prices.length} productos</span>
          </h2>
        </div>
        {prices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
            <TrendingUp className="h-6 w-6 opacity-50" />
            Sin precios. Presioná "Recalcular" para generar.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">SKU / EAN</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Producto</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Costo</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">PVP base</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Precio final</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Margen</th>
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {pagePrices.map(p => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{p.sku ?? p.ean ?? "—"}</td>
                      <td className="px-4 py-2.5 max-w-[220px]"><span className="truncate block text-xs">{p.title}</span></td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{ars(p.cost_ars)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{ars(p.pvp_ars)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">{ars(p.final_price)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${
                        p.margin_pct == null ? "text-muted-foreground"
                          : p.margin_pct < 10 ? "text-red-400"
                          : p.margin_pct < 20 ? "text-amber-400"
                          : "text-emerald-400"
                      }`}>
                        {p.margin_pct != null ? `${p.margin_pct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.warnings?.length > 0 && (
                          <div title={p.warnings.join(", ")}><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /></div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
                <span>Página {pricesPage + 1} de {totalPages}</span>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={pricesPage === 0} onClick={() => setPricesPage(p => p - 1)}>Ant.</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={pricesPage >= totalPages - 1} onClick={() => setPricesPage(p => p + 1)}>Sig.</Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Modal ML rules */}
      {showMlForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">Reglas MercadoLibre</h2>
              <button onClick={() => setShowMlForm(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Comisión ML (%)</label>
                  <input type="number" min={0} max={100} step={0.5} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={mlForm.ml_fee_pct} onChange={e => setML("ml_fee_pct", Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cargo fijo ML (ARS)</label>
                  <input type="number" min={0} step={1} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={mlForm.ml_fixed_fee} onChange={e => setML("ml_fixed_fee", Number(e.target.value))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estrategia envío gratis</label>
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={mlForm.free_shipping_strategy} onChange={e => setML("free_shipping_strategy", e.target.value)}>
                  {FREE_SHIPPING_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo envío Full (ARS)</label>
                  <input type="number" min={0} step={10} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={mlForm.shipping_cost_full} onChange={e => setML("shipping_cost_full", Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo envío Clásico (ARS)</label>
                  <input type="number" min={0} step={10} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={mlForm.shipping_cost_classic} onChange={e => setML("shipping_cost_classic", Number(e.target.value))} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowMlForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveMlRules} disabled={savingMl}>
                {savingMl && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Guardar reglas ML
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal regla fee */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">{editRuleId ? "Editar regla" : "Nueva regla de fee"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">

              {/* Nombre y tipo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</label>
                  <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.rule_type} onChange={e => setF("rule_type", e.target.value)}>
                    {RULE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nombre</label>
                  <input className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="ej: Tramo $0-$5000"
                    value={form.rule_name ?? ""} onChange={e => setF("rule_name", e.target.value)} />
                </div>
              </div>

              {/* Tramo de precio */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Precio mínimo</label>
                  <input type="number" min={0} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="sin límite"
                    value={form.min_price ?? ""} onChange={e => setF("min_price", e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Precio máximo</label>
                  <input type="number" min={0} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="sin límite"
                    value={form.max_price ?? ""} onChange={e => setF("max_price", e.target.value ? Number(e.target.value) : null)} />
                </div>
              </div>

              {/* Comisión y cargo fijo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Comisión (%)</label>
                  <input type="number" min={0} max={100} step={0.5} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={form.commission_pct ?? 0} onChange={e => setF("commission_pct", Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cargo fijo (ARS)</label>
                  <input type="number" min={0} step={1} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={form.fixed_fee ?? 0} onChange={e => setF("fixed_fee", Number(e.target.value))} />
                </div>
              </div>

              {/* Envío */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Umbral envío gratis</label>
                  <input type="number" min={0} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="sin umbral"
                    value={form.free_shipping_threshold ?? ""} onChange={e => setF("free_shipping_threshold", e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Absorber envío</label>
                  <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.absorb_shipping_mode ?? "none"} onChange={e => setF("absorb_shipping_mode", e.target.value)}>
                    <option value="none">No absorber</option>
                    <option value="partial">Parcial</option>
                    <option value="full">Total</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo envío ≥ umbral</label>
                  <input type="number" min={0} step={10} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={form.shipping_cost_above_threshold ?? 0} onChange={e => setF("shipping_cost_above_threshold", Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo envío {'<'} umbral</label>
                  <input type="number" min={0} step={10} className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={form.shipping_cost_below_threshold ?? 0} onChange={e => setF("shipping_cost_below_threshold", Number(e.target.value))} />
                </div>
              </div>

              {/* Extra cost */}
              <div className="rounded-lg border border-border bg-muted/10 p-3 flex flex-col gap-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo extra (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Etiqueta</label>
                    <input className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="ej: Seguro, IVA..."
                      value={form.extra_cost_label ?? ""} onChange={e => setF("extra_cost_label", e.target.value || null)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Monto (ARS)</label>
                    <input type="number" min={0} step={1} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="0"
                      value={form.extra_cost_amount ?? ""} onChange={e => setF("extra_cost_amount", e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveRule} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                {editRuleId ? "Guardar" : "Crear regla"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
