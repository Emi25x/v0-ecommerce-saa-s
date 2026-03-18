"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Save, X } from "lucide-react"
import Link from "next/link"

interface Destination {
  id: string
  name: string
  type: string
  description: string
  description_template: string
  field_mapping: Record<string, string>
  default_values: Record<string, any>
  is_active: boolean
  created_at: string
}

export default function DestinationsPage() {
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingDestination, setEditingDestination] = useState<Destination | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    type: "custom",
    description: "",
    description_template: "",
    field_mapping: "{}",
    default_values: "{}",
  })

  useEffect(() => {
    loadDestinations()
  }, [])

  const loadDestinations = async () => {
    try {
      const response = await fetch("/api/destinations")
      if (response.ok) {
        const data = await response.json()
        setDestinations(data)
      }
    } catch (error) {
      console.error("Error loading destinations:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingDestination ? `/api/destinations/${editingDestination.id}` : "/api/destinations"

      const method = editingDestination ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          field_mapping: JSON.parse(formData.field_mapping),
          default_values: JSON.parse(formData.default_values),
        }),
      })

      if (response.ok) {
        await loadDestinations()
        setIsDialogOpen(false)
        resetForm()
      }
    } catch (error) {
      console.error("Error saving destination:", error)
    }
  }

  const handleEdit = (destination: Destination) => {
    setEditingDestination(destination)
    setFormData({
      name: destination.name,
      type: destination.type,
      description: destination.description,
      description_template: destination.description_template,
      field_mapping: JSON.stringify(destination.field_mapping, null, 2),
      default_values: JSON.stringify(destination.default_values, null, 2),
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este destino?")) return

    try {
      const response = await fetch(`/api/destinations/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        await loadDestinations()
      }
    } catch (error) {
      console.error("Error deleting destination:", error)
    }
  }

  const resetForm = () => {
    setEditingDestination(null)
    setFormData({
      name: "",
      type: "custom",
      description: "",
      description_template: "",
      field_mapping: "{}",
      default_values: "{}",
    })
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    resetForm()
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Destinos de Publicación</h1>
            <p className="mt-2 text-muted-foreground">
              Configura plantillas y mapeos para publicar en diferentes plataformas
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/inventory">
              <Button variant="outline">Base de Productos</Button>
            </Link>
            <Link href="/import-sources">
              <Button variant="outline">Fuentes de Importación</Button>
            </Link>
            <Link href="/products">
              <Button variant="outline">Publicaciones ML</Button>
            </Link>
          </div>
        </div>

        <div className="mb-6 flex justify-end">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Destino
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingDestination ? "Editar Destino" : "Agregar Destino"}</DialogTitle>
                <DialogDescription>Configura la plantilla y mapeo de campos para este destino</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Mercado Libre"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mercadolibre">Mercado Libre</SelectItem>
                        <SelectItem value="shopify">Shopify</SelectItem>
                        <SelectItem value="custom">Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descripción del destino"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description_template">
                    Plantilla de Descripción
                    <span className="ml-2 text-sm text-muted-foreground">
                      Usa placeholders como {"{marca}"}, {"{color}"}, {"{peso}"}
                    </span>
                  </Label>
                  <Textarea
                    id="description_template"
                    value={formData.description_template}
                    onChange={(e) => setFormData({ ...formData, description_template: e.target.value })}
                    placeholder="Producto de alta calidad&#10;&#10;Características:&#10;- Marca: {marca}&#10;- Color: {color}&#10;- Peso: {peso}"
                    rows={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="field_mapping">
                    Mapeo de Campos (JSON)
                    <span className="ml-2 text-sm text-muted-foreground">Campo producto → Campo destino</span>
                  </Label>
                  <Textarea
                    id="field_mapping"
                    value={formData.field_mapping}
                    onChange={(e) => setFormData({ ...formData, field_mapping: e.target.value })}
                    placeholder='{"title": "title", "price": "price", "stock": "available_quantity"}'
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_values">
                    Valores por Defecto (JSON)
                    <span className="ml-2 text-sm text-muted-foreground">Para campos obligatorios sin datos</span>
                  </Label>
                  <Textarea
                    id="default_values"
                    value={formData.default_values}
                    onChange={(e) => setFormData({ ...formData, default_values: e.target.value })}
                    placeholder='{"condition": "new", "listing_type_id": "gold_special"}'
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleDialogClose}>
                    <X className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button type="submit">
                    <Save className="mr-2 h-4 w-4" />
                    Guardar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Cargando destinos...</p>
          </div>
        ) : destinations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No hay destinos configurados. Agrega tu primer destino para comenzar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {destinations.map((destination) => (
              <Card key={destination.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{destination.name}</CardTitle>
                      <CardDescription className="mt-1">{destination.description}</CardDescription>
                    </div>
                    <Badge variant={destination.is_active ? "default" : "secondary"}>
                      {destination.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Tipo:</p>
                      <Badge variant="outline">{destination.type}</Badge>
                    </div>

                    <div>
                      <p className="text-sm font-medium mb-2">Plantilla de Descripción:</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                        {destination.description_template.substring(0, 100)}
                        {destination.description_template.length > 100 ? "..." : ""}
                      </pre>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(destination)} className="flex-1">
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(destination.id)}
                        className="flex-1"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
