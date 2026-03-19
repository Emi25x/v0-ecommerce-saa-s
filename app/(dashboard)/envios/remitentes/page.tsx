"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Star, Trash2, Pencil, Check, X } from "lucide-react"

interface Remitente {
  id: string
  nombre: string
  direccion: string
  localidad: string
  provincia: string
  cp: string
  telefono: string | null
  email: string | null
  es_default: boolean
}

const EMPTY: Omit<Remitente, "id" | "es_default"> = {
  nombre: "",
  direccion: "",
  localidad: "",
  provincia: "",
  cp: "",
  telefono: "",
  email: "",
}

export default function RemitentesPage() {
  const [remitentes, setRemitentes] = useState<Remitente[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY, es_default: false })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch("/api/envios/remitentes")
    if (res.ok) {
      const { data } = await res.json()
      setRemitentes(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function save() {
    setSaving(true)
    const url = editId ? `/api/envios/remitentes/${editId}` : "/api/envios/remitentes"
    const method = editId ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      setShowForm(false)
      setEditId(null)
      setForm({ ...EMPTY, es_default: false })
      load()
    }
  }

  async function setDefault(id: string) {
    await fetch(`/api/envios/remitentes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ es_default: true }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este remitente?")) return
    await fetch(`/api/envios/remitentes/${id}`, { method: "DELETE" })
    load()
  }

  function startEdit(r: Remitente) {
    setEditId(r.id)
    setForm({
      nombre: r.nombre,
      direccion: r.direccion,
      localidad: r.localidad,
      provincia: r.provincia,
      cp: r.cp,
      telefono: r.telefono ?? "",
      email: r.email ?? "",
      es_default: r.es_default,
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm({ ...EMPTY, es_default: false })
  }

  const formOk = form.nombre && form.direccion && form.localidad && form.provincia && form.cp

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/envios">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Remitentes</h1>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo remitente
          </Button>
        )}
      </div>

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editId ? "Editar remitente" : "Nuevo remitente"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["nombre", "direccion", "localidad", "provincia", "cp", "telefono", "email"] as const).map((f) => (
                <div
                  key={f}
                  className={`flex flex-col gap-1 ${f === "nombre" || f === "direccion" ? "sm:col-span-2" : ""}`}
                >
                  <Label className="capitalize text-xs">{f === "cp" ? "Código postal" : f}</Label>
                  <Input
                    value={(form as any)[f]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))}
                    placeholder={f === "email" ? "correo@ejemplo.com" : ""}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="es_default"
                checked={form.es_default}
                onChange={(e) => setForm((prev) => ({ ...prev, es_default: e.target.checked }))}
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor="es_default" className="cursor-pointer text-sm">
                Usar como remitente por defecto
              </Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={saving || !formOk} className="flex-1">
                <Check className="mr-2 h-4 w-4" />
                {saving ? "Guardando…" : editId ? "Actualizar" : "Guardar"}
              </Button>
              <Button variant="outline" onClick={cancelForm}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : remitentes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay remitentes. Creá uno para pre-cargar el origen al generar envíos.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {remitentes.map((r) => (
            <Card key={r.id} className={r.es_default ? "border-primary" : ""}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.nombre}</span>
                      {r.es_default && (
                        <Badge variant="default" className="text-xs">
                          <Star className="mr-1 h-3 w-3" />
                          Por defecto
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {r.direccion}, {r.localidad}, {r.provincia} ({r.cp})
                    </p>
                    {(r.telefono || r.email) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[r.telefono, r.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!r.es_default && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDefault(r.id)}
                        title="Marcar como por defecto"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => remove(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
