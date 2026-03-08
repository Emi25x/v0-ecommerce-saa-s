"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ChevronLeft, Plus, Pencil, Trash2, Loader2, RefreshCw,
  Play, AlertTriangle, TrendingUp, Percent,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

// ── Types ──────────────────────────────────────────────────────────────────

interface PriceList {
  id: string; name: string; channel: string; currency: string
  pricing_base: string; markup_default: number | null; margin_min: number | null
}

interface FeeRule {
  id:          string
  rule_type:   string
  rule_name:   string
  amount:      number
  amount_type: "percent" | "fixed"
  applies_to:  string
  sort_order:  number
}

interface ProductPrice {
  id:              string
  sku:             string | null
  ean:             string | null
  title:           string
  cost_ars:        number | null
  pvp_ars:         number | null
  final_price:     number | null
  margin_pct:      number | null
  warnings:        string[]
}

const RULE_TYPE_OPTS = [
  { value: "commission",   label: "Comisión canal" },
  { value: "fulfillment",  label: "Fulfillment" },
  { value: "iva",          label: "IVA" },
  { value: "shipping",     label: "Envío" },
  { value: "custom",       label: "Personalizado" },
]

const APPLIES_OPTS = [
  { value: "all",  label: "Todos los productos" },
  { value: "sku",  label: "SKU específico" },
  { value: "ean",  label: "EAN específico" },
]

const EMPTY_RULE = (): Partial<FeeRule> => ({
  rule_type: "commission", rule_name: "", amount: 0,
  amount_type: "percent", applies_to: "all", sort_order: 10,
})

function pct(n: number | null) {
  if (n == null) return "—"
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
}
function ars(n: number | null) {
  if (n == null) return "—"
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ListDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const router    = useRouter()
  const { toast } = useToast()

  const [list,        setList]        = useState<PriceList | null>(null)
  const [rules,       setRules]       = useState<FeeRule[]>([])
  const [prices,      setPrices]      = useState<ProductPrice[]>([])
  const [loading,     setLoading]     = useState(true)
  const [recalcLoading, setRecalcLoading] = useState(false)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState(EMPTY_RULE())
  const [editRuleId,  setEditRuleId]  = useState<string | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [pricesPage,  setPricesPage]  = useState(0)
  const PRICES_PER_PAGE = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rList, rRules, rPrices] = await Promise.all([
        fetch(`/api/pricing/lists/${id}`).then(r => r.json()),
        fetch(`/api/pricing/lists/${id}/rules`).then(r => r.json()),
        fetch(`/api/pricing/results?list_id=${id}&limit=200`).then(r => r.json()),
      ])
      if (rList.ok)    setList(rList.list)
      if (rRules.ok)   setRules(rRules.rules ?? [])
      if (rPrices.ok)  setPrices(rPrices.results ?? [])
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
      setShowForm(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  const delRule = async (ruleId: string) => {
    try {
      await fetch(`/api/pricing/lists/${id}/rules/${ruleId}`, { method: "DELETE" })
      load()
    } catch { }
  }

  const set = (k: keyof FeeRule, v: any) => setForm(f => ({ ...f, [k]: v }))

  const openNewRule = () => { setForm(EMPTY_RULE()); setEditRuleId(null); setShowForm(true) }
  const openEditRule = (r: FeeRule) => { setForm({ ...r }); setEditRuleId(r.id); setShowForm(true) }

  const pagePrices = prices.slice(pricesPage * PRICES_PER_PAGE, (pricesPage + 1) * PRICES_PER_PAGE)
  const totalPages = Math.ceil(prices.length / PRICES_PER_PAGE)

  if (loading && !list) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </Button>
        <Button size="sm" onClick={recalculate} disabled={recalcLoading}>
          {recalcLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            : <Play className="h-3.5 w-3.5 mr-1.5" />
          }
          Recalcular
        </Button>
      </div>

      {/* Reglas de fee */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm">Reglas de costo / fee</h2>
          <Button size="sm" variant="outline" onClick={openNewRule}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar regla
          </Button>
        </div>
        {rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground text-sm">
            <Percent className="h-6 w-6 opacity-50" />
            Sin reglas. Agregá comisión, IVA, fulfillment, etc.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nombre</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Monto</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Aplica a</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-2.5">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {RULE_TYPE_OPTS.find(o => o.value === r.rule_type)?.label ?? r.rule_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{r.rule_name || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {r.amount_type === "percent" ? `${r.amount}%` : ars(r.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {APPLIES_OPTS.find(o => o.value === r.applies_to)?.label ?? r.applies_to}
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
            Sin precios aún. Presioná "Recalcular" para generar.
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
                      <td className="px-5 py-2.5">
                        <div className="font-mono text-xs text-muted-foreground">
                          {p.sku ?? p.ean ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 max-w-[220px]">
                        <span className="truncate block text-xs">{p.title}</span>
                      </td>
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
                          <div title={p.warnings.join(", ")}>
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          </div>
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

      {/* Modal regla */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">{editRuleId ? "Editar regla" : "Nueva regla"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Tipo</label>
                  <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.rule_type} onChange={e => set("rule_type", e.target.value)}>
                    {RULE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Nombre</label>
                  <input className="bg-background border border-border rounded-lg px-3 py-2 text-sm" placeholder="ej: Comisión ML" value={form.rule_name ?? ""} onChange={e => set("rule_name", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Monto</label>
                  <input type="number" min={0} step={0.1} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.amount ?? 0} onChange={e => set("amount", Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Tipo de monto</label>
                  <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.amount_type} onChange={e => set("amount_type", e.target.value)}>
                    <option value="percent">Porcentaje (%)</option>
                    <option value="fixed">Fijo (ARS)</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Aplica a</label>
                <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.applies_to} onChange={e => set("applies_to", e.target.value)}>
                  {APPLIES_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Orden de aplicación</label>
                <input type="number" min={1} className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={form.sort_order ?? 10} onChange={e => set("sort_order", Number(e.target.value))} />
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
