"use client"

import { useState, useEffect, useCallback } from "react"
import { Calculator, Loader2, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CalcResult {
  final_price: number
  margin_pct: number
  markup_pct: number
  total_fees_pct: number
  breakdown: {
    step: string
    label: string
    amount: number
    type: "add" | "sub" | "base"
  }[]
  warnings: string[]
}

interface PriceList {
  id: string
  name: string
  channel: string
  currency: string
  pricing_base: string
}

const ars = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`

export default function CalculatorPage() {
  const [lists, setLists] = useState<PriceList[]>([])
  const [listId, setListId] = useState("")
  const [cost, setCost] = useState("")
  const [pvp, setPvp] = useState("")
  const [sku, setSku] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CalcResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/pricing/lists")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setLists(d.lists ?? [])
          if (d.lists?.length) setListId(d.lists[0].id)
        }
      })
      .catch(() => {})
  }, [])

  const calculate = useCallback(async () => {
    if (!listId || (!cost && !pvp)) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/pricing/calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list_id: listId,
          cost_ars: cost ? Number(cost) : undefined,
          pvp_ars: pvp ? Number(pvp) : undefined,
          sku: sku || undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [listId, cost, pvp, sku])

  const currentList = lists.find((l) => l.id === listId)

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calculadora de precios</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Simulá el precio final y margen para cualquier lista, aplicando todas sus reglas.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-5">
        {/* Lista */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Lista de precios</label>
          <select
            className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.channel} · {l.currency})
              </option>
            ))}
          </select>
          {currentList && (
            <p className="text-xs text-muted-foreground">
              Base: <span className="font-medium capitalize">{currentList.pricing_base}</span>
            </p>
          )}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Costo (ARS)</label>
            <input
              type="number"
              min={0}
              step={1}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="ej: 8500"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Costo de compra neto</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">PVP (ARS)</label>
            <input
              type="number"
              min={0}
              step={1}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="ej: 15000"
              value={pvp}
              onChange={(e) => setPvp(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Precio sugerido de lista</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              SKU <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="ej: ABC-001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Para cargar costo desde DB</p>
          </div>
        </div>

        <Button onClick={calculate} disabled={loading || !listId || (!cost && !pvp && !sku)} className="self-start">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
          Calcular precio
        </Button>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Resultado */}
      {result && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/20">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h2 className="font-semibold">Resultado</h2>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            <div className="px-6 py-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Precio final</p>
              <p className="text-2xl font-bold font-mono">{ars(result.final_price)}</p>
            </div>
            <div className="px-6 py-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Margen neto</p>
              <p
                className={`text-2xl font-bold font-mono ${
                  result.margin_pct < 10
                    ? "text-red-400"
                    : result.margin_pct < 20
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`}
              >
                {result.margin_pct.toFixed(1)}%
              </p>
            </div>
            <div className="px-6 py-5 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total fees</p>
              <p className="text-2xl font-bold font-mono text-muted-foreground">{result.total_fees_pct.toFixed(1)}%</p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="px-6 py-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Desglose</h3>
            <div className="flex flex-col gap-1">
              {result.breakdown.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
                >
                  <span className="text-muted-foreground">{b.label}</span>
                  <span
                    className={`font-mono font-medium ${
                      b.type === "base" ? "text-foreground" : b.type === "add" ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {b.type !== "base" && (b.type === "add" ? "+" : "-")}
                    {ars(Math.abs(b.amount))}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm py-2 mt-1">
                <span className="font-semibold">Precio final</span>
                <span className="font-mono font-bold text-lg">{ars(result.final_price)}</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="px-6 pb-5">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex flex-col gap-1">
                {result.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
