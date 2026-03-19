"use client"

import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Plus, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Gap {
  id: string
  category: string
  sub_category: string | null
  description: string | null
  demand_score: number
  supply_score: number
  gap_score: number | null
  example_isbns: string[] | null
  status: string
  created_at: string
}

const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-400",
  in_progress: "bg-blue-500/15 text-blue-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  dismissed: "bg-muted text-muted-foreground",
}

export default function HuecosPage() {
  const [rows, setRows] = useState<Gap[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("open")
  const [selected, setSelected] = useState<Gap | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    category: "",
    sub_category: "",
    description: "",
    demand_score: "50",
    supply_score: "20",
    example_isbns: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (status) params.set("status", status)
      const res = await fetch(`/api/radar/gaps?${params}`)
      const data = await res.json()
      if (data.ok) {
        setRows(data.rows)
        setTotal(data.total ?? data.rows.length)
      }
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch(`/api/radar/gaps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status: newStatus } : x)))
    if (selected?.id === id) setSelected((s) => (s ? { ...s, status: newStatus } : s))
  }

  const handleCreate = async () => {
    if (!form.category) return
    setSaving(true)
    try {
      const isbns = form.example_isbns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch("/api/radar/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          sub_category: form.sub_category || null,
          description: form.description || null,
          demand_score: parseFloat(form.demand_score) || 0,
          supply_score: parseFloat(form.supply_score) || 0,
          example_isbns: isbns.length ? isbns : null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowNew(false)
        load()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este hueco?")) return
    await fetch(`/api/radar/gaps/${id}`, { method: "DELETE" })
    setRows((r) => r.filter((x) => x.id !== id))
    setSelected(null)
  }

  const maxGap = Math.max(...rows.map((r) => Number(r.gap_score ?? 0)), 1)

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Huecos de mercado</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString("es-AR")} huecos detectados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nuevo
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="open">Abiertos</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="resolved">Resueltos</SelectItem>
            <SelectItem value="dismissed">Descartados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted-foreground text-sm">Sin huecos en este estado.</p>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Categoría</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Demanda</th>
                <th className="px-4 py-3 text-right">Oferta</th>
                <th className="px-4 py-3 text-left w-48">Gap score</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(row)}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.category}</p>
                    {row.sub_category && <p className="text-xs text-muted-foreground">{row.sub_category}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[row.status] ?? "bg-muted"}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{Number(row.demand_score).toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{Number(row.supply_score).toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${Math.min(100, (Number(row.gap_score ?? 0) / maxGap) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-400 w-10 text-right">
                        {Number(row.gap_score ?? 0).toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Select value={row.status} onValueChange={(v) => handleStatusChange(row.id, v)}>
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Abierto</SelectItem>
                        <SelectItem value="in_progress">En progreso</SelectItem>
                        <SelectItem value="resolved">Resuelto</SelectItem>
                        <SelectItem value="dismissed">Descartado</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{selected.category}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {selected.sub_category && <p className="text-xs text-muted-foreground">{selected.sub_category}</p>}
              {selected.description && (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">{selected.description}</div>
              )}
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Demanda", value: Number(selected.demand_score).toFixed(1), color: "text-blue-400" },
                  { label: "Oferta", value: Number(selected.supply_score).toFixed(1), color: "text-muted-foreground" },
                  {
                    label: "Gap",
                    value: Number(selected.gap_score ?? 0).toFixed(1),
                    color: "text-amber-400 font-bold",
                  },
                ].map((m) => (
                  <div key={m.label} className="rounded-md border border-border bg-muted/20 p-3">
                    <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                  </div>
                ))}
              </div>
              {selected.example_isbns?.length && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ISBNs de ejemplo:</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {selected.example_isbns.map((i) => (
                      <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-mono">
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(selected.id)}>
                Eliminar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* New gap dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo hueco de mercado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Categoría *</Label>
              <Input
                className="h-8 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subcategoría</Label>
              <Input
                className="h-8 text-sm"
                value={form.sub_category}
                onChange={(e) => setForm((f) => ({ ...f, sub_category: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Score demanda (0-100)</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min={0}
                  max={100}
                  value={form.demand_score}
                  onChange={(e) => setForm((f) => ({ ...f, demand_score: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Score oferta (0-100)</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min={0}
                  max={100}
                  value={form.supply_score}
                  onChange={(e) => setForm((f) => ({ ...f, supply_score: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Textarea
                className="text-sm min-h-[70px]"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ISBNs de ejemplo (separados por coma)</Label>
              <Input
                className="h-8 text-sm font-mono"
                value={form.example_isbns}
                onChange={(e) => setForm((f) => ({ ...f, example_isbns: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !form.category}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
