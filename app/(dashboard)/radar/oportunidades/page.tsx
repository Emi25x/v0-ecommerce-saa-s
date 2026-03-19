"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Search, Plus, RefreshCw, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface Opportunity {
  id: string
  isbn: string | null
  title: string
  author: string | null
  publisher: string | null
  category: string | null
  opportunity_type: string
  score: number
  confidence: string | null
  status: string
  in_catalog: boolean
  ml_sales_rank: number | null
  ml_price_avg: number | null
  ml_listings_count: number | null
  notes: string | null
  tags: string[] | null
  created_at: string
}

const TYPE_COLOR: Record<string, string> = {
  trending: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  classic: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  gap: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  new_release: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  adaptation: "bg-rose-500/15 text-rose-400 border-rose-500/20",
}
const TYPE_LABEL: Record<string, string> = {
  trending: "Tendencia",
  classic: "Clásico",
  gap: "Hueco",
  new_release: "Novedad",
  adaptation: "Adaptación",
}
const STATUS_COLOR: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-400",
  reviewing: "bg-amber-500/15 text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-red-500/15 text-red-400",
  archived: "bg-muted text-muted-foreground",
}
const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-muted-foreground",
}

const PAGE_SIZE = 50

export default function OportunidadesPage() {
  const searchParams = useSearchParams()
  const [rows, setRows] = useState<Opportunity[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState(searchParams.get("status") ?? "")
  const [type, setType] = useState("")
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: "",
    isbn: "",
    author: "",
    publisher: "",
    category: "",
    opportunity_type: "trending",
    score: "0",
    confidence: "medium",
    notes: "",
  })

  const load = useCallback(
    async (p = 0) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
        if (q) params.set("q", q)
        if (status) params.set("status", status)
        if (type) params.set("type", type)
        const res = await fetch(`/api/radar/opportunities?${params}`)
        const data = await res.json()
        if (data.ok) {
          setRows(data.rows)
          setTotal(data.total)
        }
      } finally {
        setLoading(false)
      }
    },
    [q, status, type],
  )

  useEffect(() => {
    setPage(0)
    load(0)
  }, [q, status, type]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (page > 0) load(page)
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch(`/api/radar/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status: newStatus } : x)))
    if (selected?.id === id) setSelected((s) => (s ? { ...s, status: newStatus } : s))
  }

  const handleCreate = async () => {
    if (!form.title || !form.opportunity_type) return
    setSaving(true)
    try {
      const res = await fetch("/api/radar/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, score: parseFloat(form.score) || 0 }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowNew(false)
        load(0)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta oportunidad?")) return
    await fetch(`/api/radar/opportunities/${id}`, { method: "DELETE" })
    setRows((r) => r.filter((x) => x.id !== id))
    setSelected(null)
    setTotal((t) => t - 1)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Oportunidades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString("es-AR")} registradas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nueva
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-8 text-sm"
            placeholder="Título, autor, ISBN…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setQ("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="new">Nuevo</SelectItem>
            <SelectItem value="reviewing">En revisión</SelectItem>
            <SelectItem value="approved">Aprobado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
            <SelectItem value="archived">Archivado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="trending">Tendencia</SelectItem>
            <SelectItem value="classic">Clásico</SelectItem>
            <SelectItem value="gap">Hueco</SelectItem>
            <SelectItem value="new_release">Novedad</SelectItem>
            <SelectItem value="adaptation">Adaptación</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Título</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-left">Confianza</th>
              <th className="px-4 py-3 text-left">Categoría</th>
              <th className="px-4 py-3 text-right">Precio ML</th>
              <th className="px-4 py-3 text-left">En catálogo</th>
              <th className="px-4 py-3 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading &&
              rows.length === 0 &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-muted/30 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  Sin resultados.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(row)}>
                <td className="px-4 py-3 max-w-[220px]">
                  <p className="font-medium truncate">{row.title}</p>
                  {row.author && <p className="text-xs text-muted-foreground truncate">{row.author}</p>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLOR[row.opportunity_type] ?? "bg-muted"}`}
                  >
                    {TYPE_LABEL[row.opportunity_type] ?? row.opportunity_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[row.status] ?? "bg-muted"}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">{Number(row.score).toFixed(1)}</td>
                <td
                  className={`px-4 py-3 text-xs font-medium ${CONFIDENCE_COLOR[row.confidence ?? ""] ?? "text-muted-foreground"}`}
                >
                  {row.confidence ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">
                  {row.category ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  {row.ml_price_avg ? `$${Number(row.ml_price_avg).toLocaleString("es-AR")}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {row.in_catalog ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                      Sí
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      No
                    </span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <Select value={row.status} onValueChange={(v) => handleStatusChange(row.id, v)}>
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nuevo</SelectItem>
                      <SelectItem value="reviewing">En revisión</SelectItem>
                      <SelectItem value="approved">Aprobado</SelectItem>
                      <SelectItem value="rejected">Rechazado</SelectItem>
                      <SelectItem value="archived">Archivado</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total.toLocaleString("es-AR")} resultados</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">
              Pág. {page + 1} de {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">{selected.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLOR[selected.opportunity_type] ?? "bg-muted"}`}
                >
                  {TYPE_LABEL[selected.opportunity_type] ?? selected.opportunity_type}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status] ?? "bg-muted"}`}
                >
                  {selected.status}
                </span>
                {selected.confidence && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full bg-muted ${CONFIDENCE_COLOR[selected.confidence] ?? ""}`}
                  >
                    {selected.confidence}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {selected.isbn && (
                  <div>
                    <span className="text-muted-foreground">ISBN: </span>
                    {selected.isbn}
                  </div>
                )}
                {selected.author && (
                  <div>
                    <span className="text-muted-foreground">Autor: </span>
                    {selected.author}
                  </div>
                )}
                {selected.publisher && (
                  <div>
                    <span className="text-muted-foreground">Editorial: </span>
                    {selected.publisher}
                  </div>
                )}
                {selected.category && (
                  <div>
                    <span className="text-muted-foreground">Categoría: </span>
                    {selected.category}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Score: </span>
                  <strong>{Number(selected.score).toFixed(2)}</strong>
                </div>
                {selected.ml_price_avg && (
                  <div>
                    <span className="text-muted-foreground">Precio ML: </span>$
                    {Number(selected.ml_price_avg).toLocaleString("es-AR")}
                  </div>
                )}
                {selected.ml_listings_count != null && (
                  <div>
                    <span className="text-muted-foreground">Listings ML: </span>
                    {selected.ml_listings_count}
                  </div>
                )}
                {selected.ml_sales_rank && (
                  <div>
                    <span className="text-muted-foreground">Rank ML: </span>#{selected.ml_sales_rank}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">En catálogo: </span>
                  {selected.in_catalog ? "Sí" : "No"}
                </div>
              </div>
              {selected.notes && (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">{selected.notes}</div>
              )}
              {selected.tags && selected.tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {selected.tags.map((t) => (
                    <span key={t} className="text-[10px] bg-muted px-2 py-0.5 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 mt-2">
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

      {/* New opportunity dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva oportunidad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Título *</Label>
                <Input
                  className="h-8 text-sm"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ISBN</Label>
                <Input
                  className="h-8 text-sm"
                  value={form.isbn}
                  onChange={(e) => setForm((f) => ({ ...f, isbn: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo *</Label>
                <Select
                  value={form.opportunity_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, opportunity_type: v }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trending">Tendencia</SelectItem>
                    <SelectItem value="classic">Clásico</SelectItem>
                    <SelectItem value="gap">Hueco</SelectItem>
                    <SelectItem value="new_release">Novedad</SelectItem>
                    <SelectItem value="adaptation">Adaptación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Autor</Label>
                <Input
                  className="h-8 text-sm"
                  value={form.author}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Score (0-100)</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min={0}
                  max={100}
                  value={form.score}
                  onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Confianza</Label>
                <Select value={form.confidence} onValueChange={(v) => setForm((f) => ({ ...f, confidence: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="low">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoría</Label>
                <Input
                  className="h-8 text-sm"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Notas</Label>
                <Textarea
                  className="text-sm min-h-[80px]"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !form.title}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
