"use client"

import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

interface Adaptation {
  id: string
  opportunity_id: string | null
  product_id: string | null
  adaptation_type: string
  title: string
  description: string | null
  priority: string
  status: string
  estimated_impact: string | null
  assigned_to: string | null
  due_date: string | null
  created_at: string
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   "bg-red-500/15 text-red-400 border-red-500/20",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  low:    "bg-muted text-muted-foreground border-border",
}

const STATUS_COLOR: Record<string, string> = {
  suggested:   "bg-sky-500/15 text-sky-400",
  in_progress: "bg-blue-500/15 text-blue-400",
  completed:   "bg-emerald-500/15 text-emerald-400",
  rejected:    "bg-red-500/15 text-red-400",
}

const TYPE_LABEL: Record<string, string> = {
  translation:   "Traducción",
  format_change: "Cambio formato",
  target_market: "Nuevo mercado",
  update:        "Actualización",
  bundle:        "Bundle",
  digital:       "Edición digital",
}

export default function AdaptacionesPage() {
  const [rows, setRows]       = useState<Adaptation[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus]   = useState("")
  const [priority, setPriority] = useState("")
  const [selected, setSelected] = useState<Adaptation | null>(null)
  const [showNew, setShowNew]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({
    title: "", adaptation_type: "translation",
    priority: "medium", description: "",
    estimated_impact: "", assigned_to: "", due_date: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (status)   params.set("status", status)
      if (priority) params.set("priority", priority)
      const res  = await fetch(`/api/radar/adaptations?${params}`)
      const data = await res.json()
      if (data.ok) { setRows(data.rows); setTotal(data.total ?? data.rows.length) }
    } finally { setLoading(false) }
  }, [status, priority])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch(`/api/radar/adaptations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    setRows(r => r.map(x => x.id === id ? { ...x, status: newStatus } : x))
    if (selected?.id === id) setSelected(s => s ? { ...s, status: newStatus } : s)
  }

  const handleCreate = async () => {
    if (!form.title) return
    setSaving(true)
    try {
      const res = await fetch("/api/radar/adaptations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:            form.title,
          adaptation_type:  form.adaptation_type,
          priority:         form.priority,
          description:      form.description   || null,
          estimated_impact: form.estimated_impact || null,
          assigned_to:      form.assigned_to   || null,
          due_date:         form.due_date       || null,
        }),
      })
      const data = await res.json()
      if (data.ok) { setShowNew(false); load() }
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta adaptación?")) return
    await fetch(`/api/radar/adaptations/${id}`, { method: "DELETE" })
    setRows(r => r.filter(x => x.id !== id))
    setSelected(null)
  }

  // Summary counts
  const counts = {
    suggested:   rows.filter(r => r.status === "suggested").length,
    in_progress: rows.filter(r => r.status === "in_progress").length,
    completed:   rows.filter(r => r.status === "completed").length,
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Adaptaciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Sugerencias de adaptación editorial detectadas por el Radar</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nueva
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Sugeridas", count: counts.suggested, color: "border-sky-500/20 text-sky-400" },
          { label: "En progreso", count: counts.in_progress, color: "border-blue-500/20 text-blue-400" },
          { label: "Completadas", count: counts.completed, color: "border-emerald-500/20 text-emerald-400" },
        ].map(c => (
          <div key={c.label} className={`rounded-full border px-3 py-1 text-xs font-medium ${c.color}`}>
            {c.count} {c.label}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={status || "all"} onValueChange={v => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="suggested">Sugerida</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
            <SelectItem value="rejected">Rechazada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priority || "all"} onValueChange={v => setPriority(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted-foreground text-sm">Sin adaptaciones registradas.</p>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Prioridad</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Impacto est.</th>
                <th className="px-4 py-3 text-left">Asignado</th>
                <th className="px-4 py-3 text-left">Vencimiento</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(row)}>
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[200px]">{row.title}</p>
                    {row.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{row.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {TYPE_LABEL[row.adaptation_type] ?? row.adaptation_type}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[row.priority] ?? "bg-muted"}`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[row.status] ?? "bg-muted"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.estimated_impact ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.assigned_to ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.due_date ? new Date(row.due_date).toLocaleDateString("es-AR") : "—"}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Select value={row.status} onValueChange={v => handleStatusChange(row.id, v)}>
                      <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suggested">Sugerida</SelectItem>
                        <SelectItem value="in_progress">En progreso</SelectItem>
                        <SelectItem value="completed">Completada</SelectItem>
                        <SelectItem value="rejected">Rechazada</SelectItem>
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
            <DialogHeader><DialogTitle>{selected.title}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${PRIORITY_COLOR[selected.priority] ?? "bg-muted"}`}>
                  {selected.priority}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status] ?? "bg-muted"}`}>
                  {selected.status}
                </span>
              </div>
              {selected.description && (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">{selected.description}</div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Tipo: </span>{TYPE_LABEL[selected.adaptation_type] ?? selected.adaptation_type}</div>
                {selected.estimated_impact && <div><span className="text-muted-foreground">Impacto: </span>{selected.estimated_impact}</div>}
                {selected.assigned_to     && <div><span className="text-muted-foreground">Asignado: </span>{selected.assigned_to}</div>}
                {selected.due_date        && <div><span className="text-muted-foreground">Vence: </span>{new Date(selected.due_date).toLocaleDateString("es-AR")}</div>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(selected.id)}>Eliminar</Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* New dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva adaptación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Título *</Label>
              <Input className="h-8 text-sm" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={form.adaptation_type} onValueChange={v => setForm(f => ({ ...f, adaptation_type: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prioridad</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="low">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Textarea className="text-sm min-h-[70px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Asignado a</Label>
                <Input className="h-8 text-sm" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha límite</Label>
                <Input className="h-8 text-sm" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Impacto estimado</Label>
              <Input className="h-8 text-sm" placeholder="+20% ventas, nuevo segmento…" value={form.estimated_impact} onChange={e => setForm(f => ({ ...f, estimated_impact: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !form.title}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
