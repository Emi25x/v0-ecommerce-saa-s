"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Loader2, ArrowLeftRight, Pencil, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface Rate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  source: string | null
  updated_at: string
}

const CURRENCY_OPTS = ["ARS", "USD", "BRL", "EUR", "UYU"]

const EMPTY = (): Partial<Rate> => ({
  from_currency: "USD",
  to_currency: "ARS",
  rate: 0,
  source: "manual",
})

const relDate = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (d < 1) return "ahora"
  if (d < 60) return `hace ${d}m`
  const h = Math.floor(d / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

export default function ExchangeRatesPage() {
  const { toast } = useToast()
  const [rates, setRates] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY())
  const [editId, setEditId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/pricing/exchange-rates")
      const data = await res.json()
      if (data.ok) setRates(data.rates ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!form.rate || form.rate <= 0) return
    setSaving(true)
    try {
      const method = editId ? "PATCH" : "POST"
      const url = editId ? `/api/pricing/exchange-rates/${editId}` : "/api/pricing/exchange-rates"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      toast({ title: editId ? "Tipo actualizado" : "Tipo de cambio creado" })
      setShowForm(false)
      load()
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const del = async (id: string) => {
    try {
      await fetch(`/api/pricing/exchange-rates/${id}`, { method: "DELETE" })
      load()
    } catch {}
  }

  const openNew = () => {
    setForm(EMPTY())
    setEditId(null)
    setShowForm(true)
  }
  const openEdit = (r: Rate) => {
    setForm({ ...r })
    setEditId(r.id)
    setShowForm(true)
  }
  const set = (k: keyof Rate, v: any) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tipos de cambio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Usados para convertir costos y precios entre monedas en el engine de pricing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo tipo
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <ArrowLeftRight className="h-8 w-8 opacity-40" />
            <p className="text-sm">Sin tipos de cambio. Agregá uno para habilitar conversión de monedas.</p>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Agregar
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Par</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tipo de cambio</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fuente</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actualizado</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 font-mono font-semibold">
                      {r.from_currency}
                      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.to_currency}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-base font-semibold">
                    {r.rate.toLocaleString("es-AR", { maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs capitalize">{r.source ?? "manual"}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{relDate(r.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => del(r.id)}
                        className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">{editId ? "Editar tipo" : "Nuevo tipo de cambio"}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Moneda origen</label>
                  <select
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={form.from_currency}
                    onChange={(e) => set("from_currency", e.target.value)}
                  >
                    {CURRENCY_OPTS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Moneda destino</label>
                  <select
                    className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={form.to_currency}
                    onChange={(e) => set("to_currency", e.target.value)}
                  >
                    {CURRENCY_OPTS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Tipo de cambio — 1 {form.from_currency} = ? {form.to_currency}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="ej: 1250.00"
                  value={form.rate ?? ""}
                  onChange={(e) => set("rate", Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Fuente</label>
                <select
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={form.source ?? "manual"}
                  onChange={(e) => set("source", e.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="bcra">BCRA</option>
                  <option value="blue">Blue</option>
                  <option value="oficial">Oficial</option>
                  <option value="mep">MEP</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={save} disabled={saving || !form.rate}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                {editId ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
