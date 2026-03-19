"use client"

import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Source {
  id: string
  name: string
  kind: string
  url: string | null
  active: boolean
  last_synced_at: string | null
  sync_interval_hours: number
  config_json: Record<string, any> | null
  created_at: string
}

const KIND_COLOR: Record<string, string> = {
  bestseller_list: "bg-blue-500/15 text-blue-400",
  ml_ranking: "bg-yellow-500/15 text-yellow-400",
  isbn_db: "bg-purple-500/15 text-purple-400",
  rss: "bg-emerald-500/15 text-emerald-400",
  manual: "bg-muted text-muted-foreground",
  api: "bg-rose-500/15 text-rose-400",
}

const KIND_LABEL: Record<string, string> = {
  bestseller_list: "Lista bestsellers",
  ml_ranking: "Ranking ML",
  isbn_db: "DB ISBN",
  rss: "RSS",
  manual: "Manual",
  api: "API externa",
}

function relDate(iso: string | null) {
  if (!iso) return "Nunca"
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return "hace menos de 1h"
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

export default function RadarConfigPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "",
    kind: "rss",
    url: "",
    sync_interval_hours: "24",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/radar/sources")
      const data = await res.json()
      if (data.ok) setSources(data.rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleToggle = async (id: string, active: boolean) => {
    await fetch(`/api/radar/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    })
    setSources((s) => s.map((x) => (x.id === id ? { ...x, active } : x)))
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta fuente?")) return
    await fetch(`/api/radar/sources/${id}`, { method: "DELETE" })
    setSources((s) => s.filter((x) => x.id !== id))
  }

  const handleCreate = async () => {
    if (!form.name || !form.kind) return
    setSaving(true)
    try {
      const res = await fetch("/api/radar/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          kind: form.kind,
          url: form.url || null,
          sync_interval_hours: parseInt(form.sync_interval_hours) || 24,
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

  const activeSources = sources.filter((s) => s.active).length
  const inactiveSources = sources.filter((s) => !s.active).length

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuración del Radar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Fuentes externas de señales editoriales</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nueva fuente
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-3 flex-wrap">
        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium text-emerald-400">
          {activeSources} activas
        </div>
        <div className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          {inactiveSources} inactivas
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted-foreground text-sm mb-3">Sin fuentes configuradas.</p>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Agregar primera fuente
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {sources.map((src) => (
            <Card key={src.id} className={`p-4 flex items-center gap-4 ${!src.active ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{src.name}</p>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${KIND_COLOR[src.kind] ?? "bg-muted"}`}
                  >
                    {KIND_LABEL[src.kind] ?? src.kind}
                  </span>
                  {!src.active && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      inactiva
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  {src.url && <span className="truncate max-w-[280px] font-mono">{src.url}</span>}
                  <span>Sync: cada {src.sync_interval_hours}h</span>
                  <span>Ultimo: {relDate(src.last_synced_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggle(src.id, !src.active)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={src.active ? "Desactivar" : "Activar"}
                >
                  {src.active ? (
                    <ToggleRight className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(src.id)}
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Parametros section */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold">Parámetros de detección</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {[
            { label: "Umbral mínimo de score para oportunidad", value: "70" },
            { label: "Días hacia atrás para señales (ventana)", value: "30" },
            { label: "Mínimo listings ML para gap válido", value: "5" },
            { label: "Gap score mínimo para alertar", value: "50" },
          ].map((p) => (
            <div key={p.label} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{p.label}</Label>
              <Input className="h-8 text-sm font-mono" defaultValue={p.value} readOnly />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Los parámetros de scoring se configuran desde el panel de administración.
        </p>
      </Card>

      {/* New source dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva fuente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input
                className="h-8 text-sm"
                placeholder="Ej: NYT Bestsellers"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL / Endpoint</Label>
              <Input
                className="h-8 text-sm font-mono"
                placeholder="https://…"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Intervalo de sync (horas)</Label>
              <Input
                className="h-8 text-sm"
                type="number"
                min={1}
                max={720}
                value={form.sync_interval_hours}
                onChange={(e) => setForm((f) => ({ ...f, sync_interval_hours: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !form.name}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
