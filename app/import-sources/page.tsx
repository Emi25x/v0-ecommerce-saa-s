"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Pencil, Trash2, LinkIcon, Download, X } from "lucide-react"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface ImportSource {
  id: string
  name: string
  description: string | null
  url_template: string
  auth_type: string
  credentials: {
    username?: string
    password?: string
  }
  feed_type: string | null
  column_mapping: Record<string, string> | null
  is_active: boolean
  last_import_at: string | null
  created_at: string
}

interface ExistingCustomField {
  name: string
  examples: string[]
}

export default function ImportSourcesPage() {
  const [sources, setSources] = useState<ImportSource[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSource, setEditingSource] = useState<ImportSource | null>(null)
  const [showColumnMapping, setShowColumnMapping] = useState(false)
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [customFields, setCustomFields] = useState<string[]>([])
  const [detectingMapping, setDetectingMapping] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [existingCustomFields, setExistingCustomFields] = useState<ExistingCustomField[]>([])
  const [loadingExistingFields, setLoadingExistingFields] = useState(false)
  const [installingLibral, setInstallingLibral] = useState(false)

  const feedTypes = [
    { value: "catalog", label: "Catálogo", required: ["internal_code", "sku", "title"] },
    { value: "stock", label: "Stock", required: ["sku", "stock"] },
    { value: "stock_price", label: "Stock y Precio", required: ["sku", "stock", "price"] },
    { value: "price", label: "Precio", required: ["sku", "price"] },
  ]

  const predefinedFields = [
    { value: "internal_code", label: "Código Interno" },
    { value: "sku", label: "SKU" },
    { value: "title", label: "Título/Nombre" },
    { value: "price", label: "Precio" },
    { value: "stock", label: "Stock" },
    { value: "image_url", label: "URL de Imagen" },
    { value: "condition", label: "Condición" },
  ]

  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    url_template: "",
    auth_type: "query_params",
    username: "",
    password: "",
    feed_type: "",
    column_mapping: {} as Record<string, string>,
  })

  useEffect(() => {
    fetchSources()
    fetchExistingCustomFields()
  }, [])

  const fetchSources = async () => {
    try {
      const response = await fetch("/api/import-sources")
      const data = await response.json()
      setSources(data)
    } catch (error) {
      console.error("Error fetching sources:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchExistingCustomFields = async () => {
    setLoadingExistingFields(true)
    try {
      const response = await fetch("/api/inventory/custom-fields")
      const data = await response.json()
      setExistingCustomFields(data.customFields || [])
    } catch (error) {
      console.error("Error fetching existing custom fields:", error)
    } finally {
      setLoadingExistingFields(false)
    }
  }

  const getRequiredFields = () => {
    const selectedFeed = feedTypes.find((f) => f.value === formData.feed_type)
    return selectedFeed?.required || []
  }

  const validateRequiredFields = () => {
    const requiredFields = getRequiredFields()
    if (requiredFields.length === 0 || !showColumnMapping) return true

    const mappedFields = Object.keys(formData.column_mapping)
    const missingFields = requiredFields.filter((field) => !mappedFields.includes(field))

    return missingFields.length === 0 ? true : missingFields
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (showColumnMapping) {
      const validation = validateRequiredFields()
      if (validation !== true) {
        const missingFieldsLabels = (validation as string[])
          .map((field) => predefinedFields.find((f) => f.value === field)?.label || field)
          .join(", ")

        toast({
          title: "Campos obligatorios faltantes",
          description: `Para el tipo de feed "${feedTypes.find((f) => f.value === formData.feed_type)?.label}", debes mapear: ${missingFieldsLabels}`,
          variant: "destructive",
        })
        return
      }
    }

    const payload = {
      name: formData.name,
      description: formData.description,
      url_template: formData.url_template,
      auth_type: formData.auth_type,
      credentials: {
        ...(formData.username && { username: formData.username }),
        ...(formData.password && { password: formData.password }),
      },
      feed_type: formData.feed_type,
      column_mapping: formData.column_mapping,
    }

    setSubmitting(true)
    try {
      const url = editingSource ? `/api/import-sources/${editingSource.id}` : "/api/import-sources"

      const response = await fetch(url, {
        method: editingSource ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al guardar la fuente")
      }

      toast({
        title: editingSource ? "Fuente actualizada" : "Fuente creada",
        description: `La fuente "${formData.name}" se ${editingSource ? "actualizó" : "creó"} correctamente.`,
      })

      await fetchSources()
      setDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error("Error saving source:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al guardar la fuente",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const detectMapping = async () => {
    if (!formData.url_template) {
      toast({
        title: "URL requerida",
        description: "Por favor completa la URL primero",
        variant: "destructive",
      })
      return
    }

    setDetectingMapping(true)
    try {
      const response = await fetch("/api/import-sources/detect-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: formData.url_template,
          username: formData.username || undefined,
          password: formData.password || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al detectar mapeo")
      }

      const data = await response.json()

      if (data.detectedMapping) {
        const newMapping: Record<string, string> = {}
        Object.entries(data.detectedMapping).forEach(([csvColumn, field]) => {
          newMapping[field as string] = csvColumn
        })
        setFormData({
          ...formData,
          column_mapping: newMapping,
        })
      }

      setCsvColumns(data.detectedColumns)
      setShowColumnMapping(true)

      toast({
        title: "Mapeo detectado",
        description: `Se encontraron ${Object.keys(data.detectedMapping || {}).length} coincidencias con ${data.mlProductsCount} productos de Mercado Libre.`,
      })
    } catch (error) {
      console.error("Error detecting mapping:", error)
      toast({
        title: "Error al detectar mapeo",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      })
    } finally {
      setDetectingMapping(false)
    }
  }

  const loadCsvColumns = async () => {
    if (!formData.url_template) {
      toast({
        title: "URL requerida",
        description: "Por favor completa la URL primero",
        variant: "destructive",
      })
      return
    }

    setLoadingColumns(true)
    try {
      const response = await fetch("/api/import-sources/preview-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url_template: formData.url_template,
          credentials: {
            username: formData.username || undefined,
            password: formData.password || undefined,
          },
          feed_type: formData.feed_type,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al cargar columnas")
      }

      const data = await response.json()
      setCsvColumns(data.headers)

      const autoMapping = autoMapColumns(data.headers)
      setFormData((prevFormData) => ({
        ...prevFormData,
        column_mapping: autoMapping,
      }))

      setShowColumnMapping(true)

      await fetchExistingCustomFields()

      toast({
        title: "Columnas cargadas",
        description: `Se encontraron ${data.headers.length} columnas. Se aplicó mapeo automático para ${Object.keys(autoMapping).length} campos.`,
      })
    } catch (error) {
      console.error("Error loading CSV columns:", error)
      toast({
        title: "Error al cargar columnas",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      })
    } finally {
      setLoadingColumns(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta fuente?")) return

    try {
      const response = await fetch(`/api/import-sources/${id}`, { method: "DELETE" })

      if (!response.ok) {
        throw new Error("Error al eliminar la fuente")
      }

      toast({
        title: "Fuente eliminada",
        description: "La fuente se eliminó correctamente.",
      })

      await fetchSources()
    } catch (error) {
      console.error("Error deleting source:", error)
      toast({
        title: "Error",
        description: "No se pudo eliminar la fuente",
        variant: "destructive",
      })
    }
  }

  const handleEdit = (source: ImportSource) => {
    setEditingSource(source)
    setFormData({
      name: source.name,
      description: source.description || "",
      url_template: source.url_template,
      auth_type: source.auth_type,
      username: source.credentials.username || "",
      password: source.credentials.password || "",
      feed_type: source.feed_type || "",
      column_mapping: source.column_mapping || {},
    })

    setDialogOpen(true)
  }

  const autoMapColumns = (columns: string[]) => {
    const mapping: Record<string, string> = {}
    const newCustomFields: string[] = []

    const fieldMappings: Record<string, string[]> = {
      internal_code: [
        "codigo_interno",
        "codigo interno",
        "cod_interno",
        "cod interno",
        "internal",
        "interno",
        "codigointerno",
        "codinterno",
        "internal_code",
        "internalcode",
      ],
      sku: ["sku", "codigo", "code", "id", "item", "articulo", "art", "cod", "ref", "referencia", "reference"],
      title: [
        "title",
        "titulo",
        "nombre",
        "name",
        "producto",
        "product",
        "descripcion",
        "description",
        "desc",
        "denominacion",
      ],
      price: ["price", "precio", "cost", "costo", "pvp", "importe", "valor", "value", "monto", "amount"],
      stock: ["stock", "cantidad", "quantity", "qty", "disponible", "existencia", "inventario", "cant", "disp"],
      image_url: ["image", "imagen", "img", "photo", "foto", "url", "picture", "pic", "thumbnail"],
      condition: ["condition", "condicion", "estado", "state", "cond"],
    }

    console.log("[v0] Columnas del CSV:", columns)
    console.log(
      "[v0] Campos existentes en el sistema:",
      existingCustomFields.map((f) => f.name),
    )

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .trim()
        .replace(/[_\s-]/g, "")

    columns.forEach((column) => {
      const columnLower = column.toLowerCase().trim()
      const columnNormalized = normalize(column)

      let matched = false
      for (const [field, keywords] of Object.entries(fieldMappings)) {
        const keywordMatched = keywords.some((keyword) => {
          const keywordNormalized = normalize(keyword)
          return (
            columnLower === keyword ||
            columnNormalized === keywordNormalized ||
            columnLower.includes(keyword) ||
            keyword.includes(columnLower) ||
            columnNormalized.includes(keywordNormalized) ||
            keywordNormalized.includes(columnNormalized)
          )
        })

        if (keywordMatched) {
          mapping[field] = column
          console.log(`[v0] ✓ Mapeado a campo predefinido: ${column} → ${field}`)
          matched = true
          break
        }
      }

      if (matched) return

      const existingFieldMatch = existingCustomFields.find((existingField) => {
        const existingNormalized = normalize(existingField.name)

        if (columnNormalized === existingNormalized) return true

        if (columnNormalized.includes(existingNormalized) || existingNormalized.includes(columnNormalized)) {
          return true
        }

        const similarity = calculateSimilarity(columnNormalized, existingNormalized)
        return similarity > 0.7
      })

      if (existingFieldMatch) {
        mapping[existingFieldMatch.name] = column
        console.log(`[v0] ✓ Mapeado a campo existente: ${column} → ${existingFieldMatch.name}`)
        return
      }

      const fieldName = columnLower.replace(/\s+/g, "_")
      mapping[fieldName] = column
      newCustomFields.push(fieldName)
      console.log(`[v0] ✓ Creado nuevo campo personalizado: ${column} → ${fieldName}`)
    })

    setCustomFields(newCustomFields)

    console.log("[v0] Mapeo automático generado:", mapping)
    console.log("[v0] Campos personalizados nuevos:", newCustomFields)

    return mapping
  }

  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    let matches = 0
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++
    }

    return matches / longer.length
  }

  const addCustomField = (fieldName: string) => {
    if (fieldName && !customFields.includes(fieldName)) {
      setCustomFields([...customFields, fieldName])
    }
  }

  const removeCustomField = (fieldName: string) => {
    setCustomFields(customFields.filter((f) => f !== fieldName))
    const newMapping = { ...formData.column_mapping }

    Object.keys(newMapping).forEach((key) => {
      if (newMapping[key] === fieldName) {
        delete newMapping[key]
      }
    })

    setFormData({ ...formData, column_mapping: newMapping })
  }

  const resetForm = () => {
    setEditingSource(null)
    setShowColumnMapping(false)
    setCsvColumns([])
    setCustomFields([])
    setFormData({
      name: "",
      description: "",
      url_template: "",
      auth_type: "query_params",
      username: "",
      password: "",
      feed_type: "",
      column_mapping: {},
    })
  }

  const handleEditExistingMapping = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!editingSource || !editingSource.column_mapping) return

    const existingMapping = editingSource.column_mapping

    const columns = Array.from(new Set(Object.values(existingMapping)))
    setCsvColumns(columns)

    const customFieldsFromMapping = Object.keys(existingMapping).filter(
      (field) => !predefinedFields.some((f) => f.value === field),
    )
    setCustomFields(customFieldsFromMapping)

    console.log("[v0] Cargando mapeo existente para edición")
    console.log("[v0] Columnas del CSV:", columns)
    console.log("[v0] Campos personalizados:", customFieldsFromMapping)
    console.log("[v0] Mapeo:", existingMapping)

    setShowColumnMapping(true)
  }

  const mapWithExistingFields = () => {
    const mapping: Record<string, string> = { ...formData.column_mapping }
    let mappedCount = 0

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .trim()
        .replace(/[_\s-]/g, "")

    csvColumns.forEach((column) => {
      const columnNormalized = normalize(column)

      // Buscar coincidencia con campos existentes
      const existingFieldMatch = existingCustomFields.find((existingField) => {
        const existingNormalized = normalize(existingField.name)

        // Coincidencia exacta
        if (columnNormalized === existingNormalized) return true

        // Coincidencia parcial
        if (columnNormalized.includes(existingNormalized) || existingNormalized.includes(columnNormalized)) {
          return true
        }

        // Similitud por caracteres
        const similarity = calculateSimilarity(columnNormalized, existingNormalized)
        return similarity > 0.7
      })

      if (existingFieldMatch) {
        mapping[existingFieldMatch.name] = column
        mappedCount++
        console.log(`[v0] ✓ Mapeado con campo existente: ${column} → ${existingFieldMatch.name}`)
      }
    })

    setFormData((prevFormData) => ({
      ...prevFormData,
      column_mapping: mapping,
    }))

    toast({
      title: "Mapeo aplicado",
      description: `Se mapearon ${mappedCount} columnas con campos existentes.`,
    })
  }

  const loadColumnsAndMapWithExisting = async () => {
    if (!formData.url_template) {
      toast({
        title: "URL requerida",
        description: "Por favor completa la URL primero",
        variant: "destructive",
      })
      return
    }

    setLoadingColumns(true)
    try {
      const response = await fetch("/api/import-sources/preview-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url_template: formData.url_template,
          credentials: {
            username: formData.username || undefined,
            password: formData.password || undefined,
          },
          feed_type: formData.feed_type,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al cargar columnas")
      }

      const data = await response.json()
      setCsvColumns(data.headers)

      await fetchExistingCustomFields()

      const mapping: Record<string, string> = {}
      let mappedCount = 0

      const normalize = (str: string) =>
        str
          .toLowerCase()
          .trim()
          .replace(/[_\s-]/g, "")

      data.headers.forEach((column: string) => {
        const columnNormalized = normalize(column)

        const existingFieldMatch = existingCustomFields.find((existingField) => {
          const existingNormalized = normalize(existingField.name)

          if (columnNormalized === existingNormalized) return true

          if (columnNormalized.includes(existingNormalized) || existingNormalized.includes(columnNormalized)) {
            return true
          }

          const similarity = calculateSimilarity(columnNormalized, existingNormalized)
          return similarity > 0.7
        })

        if (existingFieldMatch) {
          mapping[existingFieldMatch.name] = column
          mappedCount++
          console.log(`[v0] ✓ Mapeado con campo existente: ${column} → ${existingFieldMatch.name}`)
        }
      })

      setFormData((prevFormData) => ({
        ...prevFormData,
        column_mapping: mapping,
      }))

      setShowColumnMapping(true)

      toast({
        title: "Columnas cargadas y mapeadas",
        description: `Se encontraron ${data.headers.length} columnas y se mapearon ${mappedCount} con campos existentes.`,
      })
    } catch (error) {
      console.error("Error loading CSV columns:", error)
      toast({
        title: "Error al cargar columnas",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      })
    } finally {
      setLoadingColumns(false)
    }
  }

  const installLibral = async () => {
    setInstallingLibral(true)
    try {
      const response = await fetch("/api/setup/libral", {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al instalar Libral")
      }

      const data = await response.json()

      toast({
        title: "Libral instalado",
        description: data.message || "La integración con Libral se instaló correctamente.",
      })

      await fetchSources()
    } catch (error) {
      console.error("Error installing Libral:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al instalar Libral",
        variant: "destructive",
      })
    } finally {
      setInstallingLibral(false)
    }
  }

  const isLibralInstalled = sources.some((source) => source.name.toLowerCase().includes("libral"))

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-3xl">Fuentes de Importación</h1>
            <p className="text-muted-foreground">Configura las fuentes desde donde importar productos</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/inventory">
                <LinkIcon className="mr-2 h-4 w-4" />
                Base de Productos
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/destinations">
                <LinkIcon className="mr-2 h-4 w-4" />
                Destinos
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/products">
                <LinkIcon className="mr-2 h-4 w-4" />
                Publicaciones ML
              </Link>
            </Button>
          </div>
        </div>

        {/* Add Source Button */}
        <div className="flex gap-2">
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) resetForm()
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Agregar Fuente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingSource ? "Editar Fuente" : "Nueva Fuente de Importación"}</DialogTitle>
                <DialogDescription>
                  Configura una fuente desde donde importar productos automáticamente
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                {!showColumnMapping ? (
                  <>
                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg">Paso 1: Configuración Básica</h3>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="name">Nombre de la Fuente *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ej: Arnoia"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="feed_type">Tipo de Feed *</Label>
                          <Select
                            value={formData.feed_type}
                            onValueChange={(value) => setFormData({ ...formData, feed_type: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tipo..." />
                            </SelectTrigger>
                            <SelectContent>
                              {feedTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-muted-foreground text-xs">
                            Define qué campos son obligatorios para esta fuente
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Descripción</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Descripción de la fuente"
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="url_template">URL de la Fuente *</Label>
                        <Input
                          id="url_template"
                          value={formData.url_template}
                          onChange={(e) => setFormData({ ...formData, url_template: e.target.value })}
                          placeholder="https://elastic-rest.arnoia.com/feeds/getFeeds"
                          required
                        />
                        <p className="text-muted-foreground text-xs">
                          URL completa con parámetros o URL base sin parámetros
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="username">Usuario</Label>
                          <Input
                            id="username"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            placeholder="customerCode (opcional)"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password">Contraseña</Label>
                          <Input
                            id="password"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            placeholder="•••••••• (opcional)"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" variant="secondary" disabled={submitting}>
                        {submitting ? "Guardando..." : "Guardar"}
                      </Button>
                      {editingSource &&
                        editingSource.column_mapping &&
                        Object.keys(editingSource.column_mapping).length > 0 && (
                          <Button type="button" variant="secondary" onClick={handleEditExistingMapping}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar Mapeo Existente
                          </Button>
                        )}
                      <Button type="button" variant="secondary" onClick={detectMapping} disabled={detectingMapping}>
                        <Download className="mr-2 h-4 w-4" />
                        {detectingMapping ? "Detectando..." : "Detectar Mapeo Automáticamente"}
                      </Button>
                      {existingCustomFields.length > 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={loadColumnsAndMapWithExisting}
                          disabled={loadingColumns}
                        >
                          <LinkIcon className="mr-2 h-4 w-4" />
                          {loadingColumns ? "Cargando..." : "Mapear con Campos Existentes"}
                        </Button>
                      )}
                      <Button type="button" onClick={loadCsvColumns} disabled={loadingColumns}>
                        <Download className="mr-2 h-4 w-4" />
                        {loadingColumns ? "Cargando..." : "Cargar Columnas Manualmente"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg">Paso 2: Mapeo de Columnas</h3>
                      <p className="text-muted-foreground text-sm">
                        Relaciona cada columna del CSV con un campo de producto. Puedes agregar campos personalizados si
                        lo necesitas.
                      </p>

                      {existingCustomFields.length > 0 && (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                          <p className="mb-2 font-medium text-sm">
                            ✅ Campos personalizados existentes en el sistema ({existingCustomFields.length}):
                          </p>
                          <div className="max-h-40 space-y-2 overflow-y-auto">
                            {existingCustomFields.map((field) => (
                              <div key={field.name} className="flex items-start gap-2 text-sm">
                                <Badge variant="outline" className="font-mono">
                                  {field.name}
                                </Badge>
                                {field.examples.length > 0 && (
                                  <span className="text-muted-foreground text-xs">Ej: {field.examples.join(", ")}</span>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-muted-foreground text-xs">
                            💡 Tip: Si tu CSV tiene columnas con nombres similares (ej: "Altura" vs "Alto"), puedes
                            mapearlas al mismo campo existente para mantener los datos relacionados.
                          </p>
                        </div>
                      )}

                      {formData.feed_type && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                          <p className="font-medium text-sm">⚠️ Campos obligatorios para este tipo de feed:</p>
                          <p className="text-muted-foreground text-sm">
                            {getRequiredFields()
                              .map((field) => predefinedFields.find((f) => f.value === field)?.label || field)
                              .join(", ")}
                          </p>
                        </div>
                      )}

                      <div className="space-3 rounded-lg border p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="font-medium text-sm">Columnas encontradas en el CSV: {csvColumns.length}</h4>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nuevo campo..."
                              className="w-40"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addCustomField(e.currentTarget.value)
                                  e.currentTarget.value = ""
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                const input = e.currentTarget.previousElementSibling as HTMLInputElement
                                addCustomField(input.value)
                                input.value = ""
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {customFields.length > 0 && (
                          <div className="mb-4 flex flex-wrap gap-2">
                            <span className="text-muted-foreground text-sm">Campos personalizados:</span>
                            {customFields.map((field) => (
                              <Badge key={field} variant="secondary" className="gap-1">
                                {field}
                                <button
                                  type="button"
                                  onClick={() => removeCustomField(field)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="max-h-96 space-y-3 overflow-y-auto">
                          {csvColumns.map((column, index) => {
                            const mappedField =
                              Object.entries(formData.column_mapping).find(([_, csvCol]) => csvCol === column)?.[0] ||
                              ""

                            const isRequired = getRequiredFields().includes(mappedField)

                            return (
                              <div key={`${column}-${index}`} className="grid grid-cols-2 items-center gap-4">
                                <div className="font-mono text-sm">
                                  <Badge variant="outline">{column}</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground text-sm">→</span>
                                  <Select
                                    value={mappedField}
                                    onValueChange={(value) => {
                                      console.log("[v0] Cambiando mapeo para columna:", column, "→", value)
                                      console.log("[v0] Mapeo actual antes del cambio:", formData.column_mapping)

                                      setFormData((prevFormData) => {
                                        const newMapping = { ...prevFormData.column_mapping }

                                        Object.keys(newMapping).forEach((key) => {
                                          if (newMapping[key] === column) {
                                            delete newMapping[key]
                                          }
                                        })

                                        if (value !== "_skip") {
                                          newMapping[value] = column
                                        }

                                        console.log("[v0] Nuevo mapeo después del cambio:", newMapping)

                                        return { ...prevFormData, column_mapping: newMapping }
                                      })
                                    }}
                                  >
                                    <SelectTrigger className={isRequired ? "border-amber-500" : ""}>
                                      <SelectValue placeholder="Seleccionar campo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="_skip">
                                        <span className="text-muted-foreground">No importar</span>
                                      </SelectItem>
                                      {predefinedFields.map((field) => {
                                        const isFieldRequired = getRequiredFields().includes(field.value)
                                        return (
                                          <SelectItem key={field.value} value={field.value}>
                                            {field.label}
                                            {isFieldRequired && <span className="ml-2 text-amber-600">*</span>}
                                          </SelectItem>
                                        )
                                      })}
                                      {existingCustomFields.length > 0 && (
                                        <>
                                          <SelectItem value="_separator_existing" disabled>
                                            <span className="font-semibold text-green-600">— Campos Existentes —</span>
                                          </SelectItem>
                                          {existingCustomFields.map((field) => (
                                            <SelectItem key={field.name} value={field.name}>
                                              <span className="text-green-600">✓</span> {field.name} (existente)
                                            </SelectItem>
                                          ))}
                                        </>
                                      )}
                                      {customFields.length > 0 && (
                                        <>
                                          <SelectItem value="_separator_new" disabled>
                                            <span className="font-semibold text-blue-600">— Campos Nuevos —</span>
                                          </SelectItem>
                                          {customFields.map((field) => (
                                            <SelectItem key={field} value={field}>
                                              {field} (nuevo)
                                            </SelectItem>
                                          ))}
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  {isRequired && (
                                    <Badge variant="secondary" className="text-amber-600">
                                      Obligatorio
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                        <p className="font-medium text-sm">💡 Tip: Campos obligatorios</p>
                        <p className="text-muted-foreground text-sm">
                          {formData.feed_type ? (
                            <>
                              Para el tipo de feed "{feedTypes.find((f) => f.value === formData.feed_type)?.label}",
                              debes mapear:{" "}
                              {getRequiredFields()
                                .map((field) => predefinedFields.find((f) => f.value === field)?.label || field)
                                .join(", ")}
                              .
                            </>
                          ) : (
                            "Selecciona un tipo de feed para ver los campos obligatorios."
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950">
                        <p className="font-medium text-sm">📝 Plantillas de Descripción</p>
                        <p className="text-muted-foreground text-sm">
                          Las plantillas de descripción se configuran en{" "}
                          <Link href="/destinations" className="font-medium underline">
                            Destinos de Publicación
                          </Link>{" "}
                          (Mercado Libre, Shopify, etc.)
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowColumnMapping(false)}>
                        ← Volver a Configuración
                      </Button>
                      <Button type="button" onClick={loadCsvColumns} disabled={loadingColumns}>
                        <Download className="mr-2 h-4 w-4" />
                        {loadingColumns ? "Recargando..." : "Recargar Columnas del CSV"}
                      </Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? "Guardando..." : editingSource ? "Actualizar" : "Crear"} Fuente
                      </Button>
                    </div>
                  </>
                )}
              </form>
            </DialogContent>
          </Dialog>

          {!isLibralInstalled && (
            <Button variant="secondary" onClick={installLibral} disabled={installingLibral}>
              <Download className="mr-2 h-4 w-4" />
              {installingLibral ? "Instalando Libral..." : "Instalar Libral (ERP)"}
            </Button>
          )}
        </div>

        {/* Sources Table */}
        <Card>
          <CardHeader>
            <CardTitle>Fuentes Configuradas</CardTitle>
            <CardDescription>Gestiona las fuentes desde donde importas productos</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">Cargando fuentes...</div>
            ) : sources.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No hay fuentes configuradas. Agrega una para comenzar.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Última Importación</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{source.name}</div>
                          {source.description && (
                            <div className="text-muted-foreground text-sm">{source.description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-sm">{source.url_template}</TableCell>
                      <TableCell>
                        <Badge variant={source.is_active ? "default" : "secondary"}>
                          {source.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {source.last_import_at ? new Date(source.last_import_at).toLocaleDateString("es-AR") : "Nunca"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(source)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(source.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
