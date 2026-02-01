"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface MLAccount {
  id: string
  nickname: string
  ml_user_id: string
}

interface Template {
  id: string
  account_id: string
  name: string
  description?: string
  title_template?: string
  listing_type_id: string
  condition: string
  currency_id: string
  price_formula?: string
  shipping_mode: string
  free_shipping: boolean
  local_pick_up: boolean
  warranty?: string
  fixed_attributes: any[]
  attribute_mapping: Record<string, string>
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AnalysisResult {
  ml_item: any
  catalog_product: any
  ean_found: string
  suggested_template: any
}

export default function MLTemplatesPage() {
  const [accounts, setAccounts] = useState<MLAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Estado para análisis
  const [itemIdToAnalyze, setItemIdToAnalyze] = useState("")
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  
  // Estado para edición de plantilla
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  
  // Campos de la plantilla
  const [templateForm, setTemplateForm] = useState({
    name: "Plantilla Principal",
    description: "",
    title_template: "{title}",
    listing_type_id: "gold_special",
    condition: "new",
    currency_id: "ARS",
    price_formula: "price * 1.0",
    shipping_mode: "me2",
    free_shipping: false,
    local_pick_up: false,
    warranty: "30 días de garantía",
    is_default: true,
    attribute_mapping: {} as Record<string, string>,
  })

  useEffect(() => {
    fetchAccounts()
  }, [])

  useEffect(() => {
    if (selectedAccount) {
      fetchTemplates()
    }
  }, [selectedAccount])

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()
      if (data.accounts) {
        setAccounts(data.accounts)
        if (data.accounts.length > 0) {
          setSelectedAccount(data.accounts[0].id)
        }
      }
    } catch (error) {
      console.error("Error fetching accounts:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch(`/api/ml/templates?account_id=${selectedAccount}`)
      const data = await response.json()
      if (data.templates) {
        setTemplates(data.templates)
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
    }
  }

  const analyzeItem = async () => {
    if (!itemIdToAnalyze || !selectedAccount) {
      toast({ title: "Error", description: "Ingresa un ID de publicación", variant: "destructive" })
      return
    }

    setAnalyzing(true)
    setAnalysisResult(null)

    try {
      const response = await fetch("/api/ml/templates/analyze-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemIdToAnalyze, account_id: selectedAccount }),
      })

      const data = await response.json()

      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" })
        return
      }

      setAnalysisResult(data)
      
      // Pre-llenar el formulario con la plantilla sugerida
      if (data.suggested_template) {
        setTemplateForm({
          ...templateForm,
          ...data.suggested_template,
          name: `Plantilla basada en ${data.ml_item.title?.substring(0, 30)}...`,
        })
      }

      toast({ title: "Analisis completado", description: `EAN encontrado: ${data.ean_found || "No encontrado"}` })
    } catch (error) {
      console.error("Error analyzing item:", error)
      toast({ title: "Error", description: "Error al analizar la publicacion", variant: "destructive" })
    } finally {
      setAnalyzing(false)
    }
  }

  const saveTemplate = async () => {
    if (!selectedAccount) return

    setSaving(true)
    try {
      const method = editingTemplate ? "PUT" : "POST"
      const body = editingTemplate 
        ? { id: editingTemplate.id, ...templateForm }
        : { account_id: selectedAccount, ...templateForm }

      const response = await fetch("/api/ml/templates", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" })
        return
      }

      toast({ title: "Exito", description: "Plantilla guardada correctamente" })
      fetchTemplates()
      setShowEditor(false)
      setEditingTemplate(null)
    } catch (error) {
      console.error("Error saving template:", error)
      toast({ title: "Error", description: "Error al guardar la plantilla", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta plantilla?")) return

    try {
      const response = await fetch(`/api/ml/templates?id=${id}`, { method: "DELETE" })
      const data = await response.json()

      if (data.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" })
        return
      }

      toast({ title: "Exito", description: "Plantilla eliminada" })
      fetchTemplates()
    } catch (error) {
      console.error("Error deleting template:", error)
    }
  }

  const editTemplate = (template: Template) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      description: template.description || "",
      title_template: template.title_template || "{title}",
      listing_type_id: template.listing_type_id,
      condition: template.condition,
      currency_id: template.currency_id,
      price_formula: template.price_formula || "price * 1.0",
      shipping_mode: template.shipping_mode,
      free_shipping: template.free_shipping,
      local_pick_up: template.local_pick_up,
      warranty: template.warranty || "",
      is_default: template.is_default,
      attribute_mapping: template.attribute_mapping || {},
    })
    setShowEditor(true)
  }

  const newTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm({
      name: "Nueva Plantilla",
      description: "",
      title_template: "{title}",
      listing_type_id: "gold_special",
      condition: "new",
      currency_id: "ARS",
      price_formula: "price * 1.0",
      shipping_mode: "me2",
      free_shipping: false,
      local_pick_up: false,
      warranty: "30 días de garantía",
      is_default: false,
      attribute_mapping: {},
    })
    setShowEditor(true)
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Cargando...</div>
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.867 5.166l-4.24 13.668h3.155l4.24-13.668h-3.155zm-6.84 0L3.787 18.834h3.155l4.24-13.668H8.027z" />
            </svg>
            <h1 className="text-xl font-semibold">Plantillas de Publicacion ML</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Plantillas de Publicacion</h2>
            <p className="text-muted-foreground">
              Configura plantillas para automatizar la publicacion de productos en Mercado Libre
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={newTemplate}>Nueva Plantilla</Button>
          </div>
        </div>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="templates">Plantillas</TabsTrigger>
            <TabsTrigger value="analyze">Analizar Publicacion</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            {templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="mb-4 text-muted-foreground">No hay plantillas configuradas</p>
                  <Button onClick={newTemplate}>Crear primera plantilla</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {template.name}
                            {template.is_default && <Badge>Principal</Badge>}
                          </CardTitle>
                          <CardDescription>{template.description || "Sin descripcion"}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Tipo:</span>{" "}
                          {template.listing_type_id === "gold_special" ? "Premium" : template.listing_type_id}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Condicion:</span>{" "}
                          {template.condition === "new" ? "Nuevo" : template.condition}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Envio:</span>{" "}
                          {template.shipping_mode}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Envio gratis:</span>{" "}
                          {template.free_shipping ? "Si" : "No"}
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Formula de precio:</span>{" "}
                        <code className="rounded bg-muted px-1">{template.price_formula}</code>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => editTemplate(template)}>
                          Editar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteTemplate(template.id)}>
                          Eliminar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analyze" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analizar Publicacion Existente</CardTitle>
                <CardDescription>
                  Ingresa el ID de una publicacion de ML para extraer sus datos y generar una plantilla automatica.
                  El sistema buscara el producto en el catalogo de Arnoia por EAN/ISBN.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Input
                    placeholder="ID de publicacion (ej: MLA1234567890)"
                    value={itemIdToAnalyze}
                    onChange={(e) => setItemIdToAnalyze(e.target.value)}
                    className="max-w-md"
                  />
                  <Button onClick={analyzeItem} disabled={analyzing}>
                    {analyzing ? "Analizando..." : "Analizar"}
                  </Button>
                </div>

                {analysisResult && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <h3 className="font-semibold">Resultado del Analisis</h3>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-sm font-medium">Publicacion de ML</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Titulo:</span> {analysisResult.ml_item.title}</p>
                          <p><span className="text-muted-foreground">Precio:</span> ${analysisResult.ml_item.price}</p>
                          <p><span className="text-muted-foreground">SKU/EAN:</span> {analysisResult.ean_found || "No encontrado"}</p>
                          <p><span className="text-muted-foreground">Tipo:</span> {analysisResult.ml_item.listing_type_id}</p>
                          <p><span className="text-muted-foreground">Condicion:</span> {analysisResult.ml_item.condition}</p>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="mb-2 text-sm font-medium">Producto del Catalogo</h4>
                        {analysisResult.catalog_product ? (
                          <div className="space-y-1 text-sm">
                            <p><span className="text-muted-foreground">Titulo:</span> {analysisResult.catalog_product.title}</p>
                            <p><span className="text-muted-foreground">Precio:</span> ${analysisResult.catalog_product.price}</p>
                            <p><span className="text-muted-foreground">Costo:</span> ${analysisResult.catalog_product.cost_price || "N/A"}</p>
                            <p><span className="text-muted-foreground">Stock:</span> {analysisResult.catalog_product.stock}</p>
                            <p><span className="text-muted-foreground">Autor:</span> {analysisResult.catalog_product.author || "N/A"}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No se encontro producto en el catalogo con EAN: {analysisResult.ean_found}</p>
                        )}
                      </div>
                    </div>

                    {analysisResult.ml_item.attributes && Object.keys(analysisResult.ml_item.attributes).length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-medium">Atributos de ML</h4>
                        <div className="max-h-48 overflow-auto rounded border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Object.entries(analysisResult.ml_item.attributes).slice(0, 20).map(([id, attr]: [string, any]) => (
                                <TableRow key={id}>
                                  <TableCell className="font-mono text-xs">{id}</TableCell>
                                  <TableCell>{attr.name}</TableCell>
                                  <TableCell>{attr.value}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <Button onClick={() => setShowEditor(true)}>
                      Crear plantilla basada en este analisis
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Editor de plantilla */}
        <Dialog open={showEditor} onOpenChange={setShowEditor}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}</DialogTitle>
              <DialogDescription>
                Configura los parametros de la plantilla para publicaciones automaticas
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={templateForm.is_default}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, is_default: checked })}
                  />
                  <Label>Plantilla principal</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descripcion</Label>
                <Textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  placeholder="Descripcion opcional de la plantilla"
                />
              </div>

              <div className="space-y-2">
                <Label>Plantilla de titulo</Label>
                <Input
                  value={templateForm.title_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, title_template: e.target.value })}
                  placeholder="{title} - {author}"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{title}"}, {"{author}"}, {"{brand}"}, {"{ean}"}, {"{year_edition}"}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Tipo de publicacion</Label>
                  <Select
                    value={templateForm.listing_type_id}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, listing_type_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gold_special">Premium (gold_special)</SelectItem>
                      <SelectItem value="gold_pro">Clasica (gold_pro)</SelectItem>
                      <SelectItem value="gold">Oro</SelectItem>
                      <SelectItem value="silver">Plata</SelectItem>
                      <SelectItem value="bronze">Bronce</SelectItem>
                      <SelectItem value="free">Gratuita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Condicion</Label>
                  <Select
                    value={templateForm.condition}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, condition: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nuevo</SelectItem>
                      <SelectItem value="used">Usado</SelectItem>
                      <SelectItem value="refurbished">Reacondicionado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Select
                    value={templateForm.currency_id}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, currency_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARS">ARS (Peso argentino)</SelectItem>
                      <SelectItem value="USD">USD (Dolar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Formula de precio</Label>
                <Input
                  value={templateForm.price_formula}
                  onChange={(e) => setTemplateForm({ ...templateForm, price_formula: e.target.value })}
                  placeholder="price * 1.5 o cost_price * 2.0"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: price (precio del catalogo), cost_price (costo)
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Modo de envio</Label>
                  <Select
                    value={templateForm.shipping_mode}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, shipping_mode: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="me2">Mercado Envios 2</SelectItem>
                      <SelectItem value="me1">Mercado Envios 1</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                      <SelectItem value="not_specified">No especificado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={templateForm.free_shipping}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, free_shipping: checked })}
                  />
                  <Label>Envio gratis</Label>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={templateForm.local_pick_up}
                    onCheckedChange={(checked) => setTemplateForm({ ...templateForm, local_pick_up: checked })}
                  />
                  <Label>Retiro en persona</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Garantia</Label>
                <Input
                  value={templateForm.warranty}
                  onChange={(e) => setTemplateForm({ ...templateForm, warranty: e.target.value })}
                  placeholder="30 días de garantía"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowEditor(false)}>
                  Cancelar
                </Button>
                <Button onClick={saveTemplate} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar Plantilla"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
