"use client"

import { useState, useCallback } from "react"
import {
  Calculator, ChevronDown, ChevronUp, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Loader2, ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import type { BreakdownStep } from "@/lib/pricing/engine"

// ── Types ──────────────────────────────────────────────────────────────────

interface CalcResult {
  calculated_price:     number | null
  calculated_margin:    number | null
  pricing_base_used:    string | null
  price_cost:           number | null
  price_pvp:            number | null
  cost_converted:       number | null
  fx_rate:              number
  fx_markup_pct:        number
  commission_pct:       number
  commission_amount:    number | null
  ml_fee_pct:           number
  ml_fee_amount:        number | null
  ml_shipping_cost:     number
  free_shipping_strategy: string | null
  extra_cost_amount:    number
  extra_cost_label:     string | null
  shipping_cost_amount: number
  warnings:             string[]
  margin_below_min:     boolean
  breakdown:            BreakdownStep[]
}

interface PriceList {
  id: string; name: string; channel: string; currency: string; pricing_base: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null, currency = "ARS") {
  if (n == null) return "—"
  return n.toLocaleString("es-AR", {
    style: "currency", currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

const stepTypeColor: Record<string, string> = {
  input:   "text-foreground",
  cost:    "text-blue-400",
  fee:     "text-red-400",
  margin:  "text-amber-400",
  result:  "text-emerald-400 font-bold",
  warning: "text-amber-300",
}

const stepTypeBg: Record<string, string> = {
  input:   "",
  cost:    "bg-blue-500/5",
  fee:     "bg-red-500/5",
  margin:  "bg-amber-500/5",
  result:  "bg-emerald-500/10",
  warning: "bg-amber-500/10",
}

const stepIcon: Record<string, JSX.Element | null> = {
  input:   null,
  cost:    <ArrowRight className="h-3 w-3 text-blue-400/60 flex-shrink-0" />,
  fee:     <Minus      className="h-3 w-3 text-red-400    flex-shrink-0" />,
  margin:  <TrendingUp className="h-3 w-3 text-amber-400  flex-shrink-0" />,
  result:  <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />,
  warning: <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />,
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const { toast } = useToast()

  const [costArs,       setCostArs]       = useState("")
  const [fleteArs,      setFleteArs]      = useState("")
  const [pvpArs,        setPvpArs]        = useState("")
  const [listId,        setListId]        = useState("")
  const [lists,         setLists]         = useState<PriceList[]>([])
  const [listsLoaded,   setListsLoaded]   = useState(false)
  const [result,        setResult]        = useState<CalcResult | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(true)

  const loadLists = useCallback(async () => {
    if (listsLoaded) return
    try {
      const res  = await fetch("/api/pricing/lists")
      const data = await res.json()
      if (data.ok) {
        setLists(data.lists ?? [])
        setListsLoaded(true)
        if (!listId && data.lists?.length) setListId(data.lists[0].id)
      }
    } catch { }
  }, [listsLoaded, listId])

  const calculate = async () => {
    if (!listId) { toast({ title: "Seleccioná una lista de precios", variant: "destructive" }); return }
    if (!costArs && !pvpArs) { toast({ title: "Ingresá al menos costo o PVP", variant: "destructive" }); return }
    setLoading(true)
    try {
      const res  = await fetch("/api/pricing/calculator", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          list_id:              listId,
          supplier_cost:        costArs  ? Number(costArs)  : null,
          import_shipping_cost: fleteArs ? Number(fleteArs) : 0,
          pvp_editorial:        pvpArs   ? Number(pvpArs)   : null,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setResult(data.result ?? data)
    } catch (e: any) {
      toast({ title: "Error al calcular", description: e.message, variant: "destructive" })
    } finally { setLoading(false) }
  }

  const selectedList = lists.find(l => l.id === listId)

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Calculator className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold">Calculadora de precios</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Simulá el precio y margen para un producto en cualquier lista</p>
        </div>
      </div>

      {/* Inputs */}
      <section className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Datos del producto</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Costo proveedor</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <input
                type="number" min={0} placeholder="0"
                className="bg-background border border-border rounded-lg pl-6 pr-3 py-2 text-sm w-full"
                value={costArs} onChange={e => setCostArs(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Flete importación</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <input
                type="number" min={0} placeholder="0"
                className="bg-background border border-border rounded-lg pl-6 pr-3 py-2 text-sm w-full"
                value={fleteArs} onChange={e => setFleteArs(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PVP editorial</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <input
                type="number" min={0} placeholder="0"
                className="bg-background border border-border rounded-lg pl-6 pr-3 py-2 text-sm w-full"
                value={pvpArs} onChange={e => setPvpArs(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lista de precios</label>
          <select
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
            value={listId}
            onFocus={loadLists}
            onChange={e => setListId(e.target.value)}
          >
            <option value="">Seleccioná una lista…</option>
            {lists.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.currency})</option>
            ))}
          </select>
          {selectedList && (
            <p className="text-xs text-muted-foreground">
              Canal: <span className="font-medium">{selectedList.channel}</span>
              {" · "}Base: <span className="font-medium capitalize">{selectedList.pricing_base}</span>
            </p>
          )}
        </div>

        <Button onClick={calculate} disabled={loading} className="self-start">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
            : <Calculator className="h-4 w-4 mr-2" />
          }
          Calcular precio
        </Button>
      </section>

      {/* Result */}
      {result && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">

          {/* Summary KPIs */}
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground mb-1">Precio final</p>
              <p className="text-2xl font-bold tabular-nums">
                {fmt(result.calculated_price, selectedList?.currency)}
              </p>
              {result.pricing_base_used && (
                <p className="text-xs text-muted-foreground mt-0.5">vía {result.pricing_base_used}</p>
              )}
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground mb-1">Margen neto</p>
              <p className={`text-2xl font-bold tabular-nums ${
                result.margin_below_min         ? "text-red-400"
                : result.calculated_margin != null && result.calculated_margin < 20 ? "text-amber-400"
                : "text-emerald-400"
              }`}>
                {result.calculated_margin != null ? `${result.calculated_margin.toFixed(1)}%` : "—"}
              </p>
              {result.margin_below_min && (
                <p className="text-xs text-red-400 flex items-center gap-1 mt-0.5">
                  <TrendingDown className="h-3 w-3" /> Bajo mínimo
                </p>
              )}
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground mb-1">Comparación</p>
              <div className="flex flex-col gap-1 mt-1">
                {result.price_cost != null && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Costo: </span>
                    <span className="font-mono font-semibold">{fmt(result.price_cost, selectedList?.currency)}</span>
                  </p>
                )}
                {result.price_pvp != null && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">PVP: </span>
                    <span className="font-mono font-semibold">{fmt(result.price_pvp, selectedList?.currency)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ML summary bar */}
          {(result.ml_fee_pct > 0 || result.ml_shipping_cost > 0) && (
            <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-blue-500/5 text-xs flex-wrap">
              <span className="font-medium text-blue-400">MercadoLibre</span>
              {result.ml_fee_amount != null && (
                <span className="text-muted-foreground">
                  Comisión {result.ml_fee_pct}%:{" "}
                  <span className="font-mono text-red-400 font-medium">{fmt(result.ml_fee_amount)}</span>
                </span>
              )}
              {result.ml_shipping_cost > 0 && (
                <span className="text-muted-foreground">
                  Envío Full:{" "}
                  <span className="font-mono text-red-400 font-medium">{fmt(result.ml_shipping_cost)}</span>
                  {result.free_shipping_strategy === "buyer_pays" && " (comprador paga)"}
                </span>
              )}
              {result.extra_cost_amount > 0 && (
                <span className="text-muted-foreground">
                  {result.extra_cost_label ?? "Extra"}:{" "}
                  <span className="font-mono text-red-400 font-medium">{fmt(result.extra_cost_amount)}</span>
                </span>
              )}
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-border">
              {result.warnings.map(w => (
                <span key={w} className="inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                  <AlertTriangle className="h-3 w-3" />{w}
                </span>
              ))}
            </div>
          )}

          {/* Breakdown toggle */}
          <button
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-medium text-muted-foreground hover:bg-muted/20 transition-colors border-b border-border"
            onClick={() => setShowBreakdown(s => !s)}
          >
            <span>Desglose completo paso a paso</span>
            {showBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showBreakdown && result.breakdown && result.breakdown.length > 0 && (
            <div className="divide-y divide-border/60">
              {result.breakdown.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-5 py-2.5 ${stepTypeBg[step.type] ?? ""} ${step.type === "result" ? "border-t-2 border-emerald-500/30" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {stepIcon[step.type]}
                    <span className={`text-sm ${stepTypeColor[step.type] ?? "text-foreground"}`}>
                      {step.label}
                    </span>
                    {step.note && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">({step.note})</span>
                    )}
                  </div>
                  <span className={`text-sm font-mono tabular-nums ml-4 flex-shrink-0 ${stepTypeColor[step.type] ?? "text-foreground"}`}>
                    {step.value != null
                      ? step.type === "margin"
                          ? `${step.value.toFixed(1)}%`
                          : fmt(step.value, step.currency ?? selectedList?.currency ?? "ARS")
                      : step.type === "warning" ? "" : "—"
                    }
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
