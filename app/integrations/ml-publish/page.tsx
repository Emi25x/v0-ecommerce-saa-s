"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Upload, Eye, Loader2, CheckCircle, XCircle } from "lucide-react"
import Link from "next/link"

interface Product {
  id: string
  ean: string
  title: string
  cost_price: number
  price: number
  stock: number
  brand: string
  image_url: string
  language?: string
  is_published?: boolean
}

interface Stats {
  total_in_db: number
  published_count: number
  available_count: number
}

interface Template {
  id: string
  name: string
  margin_percent: number
  listing_type_id: string
}

interface Account {
  id: string
  nickname: string
  ml_user_id: string
}

interface PublishPreview {
  product: Product
  calculated_price: number
  multiplier: number
  margin: number
  status: "pending" | "publishing" | "success" | "error"
  error?: string
  ml_item_id?: string
}

export default function MLPublishPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [minStock, setMinStock] = useState<number>(0)
  const [minPrice, setMinPrice] = useState<number>(0)
  const [maxPrice, setMaxPrice] = useState<number>(1000)
  const [languageFilter, setLanguageFilter] = useState<string>("SPA")
  const [publishMode, setPublishMode] = useState<"linked" | "catalog" | "traditional">("linked")
  const [previews, setPreviews] = useState<PublishPreview[]>([])
  const [publishing, setPublishing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showOnlyUnpublished, setShowOnlyUnpublished] = useState(true)
  const [stats, setStats] = useState<Stats>({ total_in_db: 0, published_count: 0, available_count: 0 })
  const [publishProgress, setPublishProgress] = useState({ current: 0, total: 0, success: 0, errors: 0 })
  const [filterBrand, setFilterBrand] = useState<string>("")
  const [filterLanguage, setFilterLanguage] = useState<string>("")

  useEffect(() => {
    fetchData()
  }, [showOnlyUnpublished])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch products paginados (100 por página para UI)
      const productsRes = await fetch(`/api/ml/publish/available?show_all=${!showOnlyUnpublished}&page_size=100`)
      const productsData = await productsRes.json()
      setProducts(productsData.products || [])
      setStats({
        total_in_db: productsData.total_in_db || 0,
        published_count: productsData.published_count || 0,
        available_count: productsData.unpublished_count || productsData.total || 0
      })

      // Fetch templates
      const templatesRes = await fetch("/api/ml/templates")
      const templatesData = await templatesRes.json()
      setTemplates(templatesData.templates || [])
      if (templatesData.templates?.length > 0) {
        setSelectedTemplate(templatesData.templates[0].id)
      }

      // Fetch accounts
      const accountsRes = await fetch("/api/mercadolibre/accounts")
      const accountsData = await accountsRes.json()
      setAccounts(accountsData.accounts || [])
      if (accountsData.accounts?.length > 0) {
        setSelectedAccount(accountsData.accounts[0].id)
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al cargar datos", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const toggleProduct = (id: string) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedProducts(newSelected)
  }

  const selectAll = () => {
    const visibleProducts = filteredProducts.slice(0, 50)
    const allVisibleSelected = visibleProducts.every(p => selectedProducts.has(p.id))
    
    if (allVisibleSelected) {
      // Deseleccionar todos los visibles
      const newSelected = new Set(selectedProducts)
      visibleProducts.forEach(p => newSelected.delete(p.id))
      setSelectedProducts(newSelected)
    } else {
      // Seleccionar todos los visibles
      const newSelected = new Set(selectedProducts)
      visibleProducts.forEach(p => newSelected.add(p.id))
      setSelectedProducts(newSelected)
    }
  }
  
  // Seleccionar TODOS los productos filtrados (traer todos los IDs del servidor)
  const selectAllFiltered = async () => {
    // Si ya hay seleccionados, deseleccionar todos
    if (selectedProducts.size > 0) {
      setSelectedProducts(new Set<string>())
      return
    }
    
    // Traer todos los IDs del servidor (query liviana)
    setLoading(true)
    try {
      const res = await fetch(`/api/ml/publish/available?show_all=${!showOnlyUnpublished}&only_ids=true`)
      const data = await res.json()
      
      if (data.ids && data.ids.length > 0) {
        // Aplicar los filtros locales (brand, language, search) sobre los IDs
        // Necesitamos los productos completos para filtrar, así que usamos los cargados
        // y para los que no están cargados, los seleccionamos igual
        const allIds = new Set<string>(data.ids)
        
        // Si hay filtros activos, solo seleccionar los que pasan el filtro
        if (searchTerm || filterBrand || filterLanguage) {
          // Solo podemos filtrar los que tenemos en memoria
          const filteredIds = filteredProducts.map(p => p.id)
          setSelectedProducts(new Set(filteredIds))
          toast({
            title: "Selección parcial",
            description: `Seleccionados ${filteredIds.length} productos que coinciden con los filtros actuales`
          })
        } else {
          // Sin filtros, seleccionar todos
          setSelectedProducts(allIds)
          toast({
            title: "Todos seleccionados",
            description: `${allIds.size.toLocaleString()} productos seleccionados`
          })
        }
      }
    } catch {
      toast({ title: "Error", description: "Error al seleccionar todos", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }
  
  // Publicar directamente sin vista previa (con delay para no saturar API)
  const publishDirectly = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "Selecciona al menos un producto", variant: "destructive" })
      return
    }
    
    if (!selectedTemplate || !selectedAccount) {
      toast({ title: "Error", description: "Selecciona plantilla y cuenta primero", variant: "destructive" })
      return
    }
    
    if (!confirm(`¿Publicar ${selectedProducts.size} productos directamente?\n\nSe publicarán con delay de 1 segundo entre cada uno para evitar saturar la API de ML.`)) {
      return
    }
    
    setPublishing(true)
    const productIds = Array.from(selectedProducts)
    setPublishProgress({ current: 0, total: productIds.length, success: 0, errors: 0 })
    
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i]
      setPublishProgress(prev => ({ ...prev, current: i + 1 }))
      
      try {
        const response = await fetch("/api/ml/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            template_id: selectedTemplate,
            account_id: selectedAccount,
            preview_only: false,
            publish_mode: publishMode
          })
        })
        
        const data = await response.json()
        if (data.success) {
          successCount++
          setPublishProgress(prev => ({ ...prev, success: successCount }))
        } else {
          errorCount++
          setPublishProgress(prev => ({ ...prev, errors: errorCount }))
        }
      } catch {
        errorCount++
        setPublishProgress(prev => ({ ...prev, errors: errorCount }))
      }
      
      // Delay de 1 segundo entre publicaciones para no saturar la API
      if (i < productIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    setPublishing(false)
    setSelectedProducts(new Set())
    setPublishProgress({ current: 0, total: 0, success: 0, errors: 0 })
    
    toast({
      title: "Publicación completada",
      description: `${successCount} publicados exitosamente, ${errorCount} con errores`
    })
    
    // Recargar productos disponibles
    fetchData()
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.ean.includes(searchTerm)
    const matchesStock = (p.stock || 0) >= minStock
    const matchesPrice = p.cost_price >= minPrice && p.cost_price <= maxPrice
    const matchesLanguage = languageFilter === "ALL" || (p.language || "").toUpperCase() === languageFilter
    const matchesBrand = filterBrand === "" || p.brand.toLowerCase().includes(filterBrand.toLowerCase())
    return matchesSearch && matchesStock && matchesPrice && matchesLanguage && matchesBrand
  })

  const generatePreviews = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "Selecciona al menos un producto", variant: "destructive" })
      return
    }

    setPublishing(true)
    const newPreviews: PublishPreview[] = []

    for (const productId of selectedProducts) {
      const product = products.find(p => p.id === productId)
      if (!product) continue

      try {
        const response = await fetch("/api/ml/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            template_id: selectedTemplate,
            account_id: selectedAccount,
            preview_only: true,
            publish_mode: publishMode
          })
        })

        const data = await response.json()

        if (data.success) {
          newPreviews.push({
            product,
            calculated_price: data.preview.price,
            multiplier: Math.round(data.preview.price / product.cost_price),
            margin: data.preview.margin,
            status: "pending"
          })
        } else {
          newPreviews.push({
            product,
            calculated_price: 0,
            multiplier: 0,
            margin: 0,
            status: "error",
            error: data.error
          })
        }
      } catch (error) {
        newPreviews.push({
          product,
          calculated_price: 0,
          multiplier: 0,
          margin: 0,
          status: "error",
          error: "Error al calcular precio"
        })
      }
    }

    setPreviews(newPreviews)
    setShowPreview(true)
    setPublishing(false)
  }

  const publishProducts = async () => {
    setPublishing(true)

    const updatedPreviews = [...previews]

    for (let i = 0; i < updatedPreviews.length; i++) {
      if (updatedPreviews[i].status === "error") continue

      updatedPreviews[i].status = "publishing"
      setPreviews([...updatedPreviews])

      try {
        const response = await fetch("/api/ml/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: updatedPreviews[i].product.id,
            template_id: selectedTemplate,
            account_id: selectedAccount,
            preview_only: false,
            publish_mode: publishMode
          })
        })

        const data = await response.json()

        if (data.success) {
          updatedPreviews[i].status = "success"
          updatedPreviews[i].ml_item_id = data.ml_item_id
        } else {
          updatedPreviews[i].status = "error"
          updatedPreviews[i].error = data.error
        }
      } catch (error) {
        updatedPreviews[i].status = "error"
        updatedPreviews[i].error = "Error de conexión"
      }

      setPreviews([...updatedPreviews])
    }

    setPublishing(false)

    const successCount = updatedPreviews.filter(p => p.status === "success").length
    toast({
      title: "Publicación completada",
      description: `${successCount} de ${updatedPreviews.length} productos publicados`
    })
  }

  const selectedTemplate_obj = templates.find(t => t.id === selectedTemplate)

  if (loading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/integrations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Publicar en Mercado Libre</h1>
          <p className="text-muted-foreground">Selecciona productos para publicar con precio calculado automaticamente</p>
        </div>
      </div>

      {!showPreview ? (
        <>
          {/* Configuracion */}
          <Card>
            <CardHeader>
              <CardTitle>Configuracion</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Plantilla</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plantilla" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.margin_percent || 20}% margen)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cuenta de ML</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nickname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modo de publicacion</Label>
                <Select value={publishMode} onValueChange={(v) => setPublishMode(v as "linked" | "catalog" | "traditional")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linked">
                      Vinculada (recomendado)
                    </SelectItem>
                    <SelectItem value="catalog">
                      Solo Catalogo
                    </SelectItem>
                    <SelectItem value="traditional">
                      Solo Tradicional
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {publishMode === "linked" 
                    ? "Crea tradicional + catalogo vinculadas. Stock compartido automatico por ML." 
                    : publishMode === "catalog"
                    ? "Solo publicacion en catalogo. Mayor visibilidad pero sin alternativa."
                    : "Solo publicacion tradicional sin vincular al catalogo."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Lista de productos */}
          <Card>
            <CardHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Productos disponibles</CardTitle>
                    <CardDescription>
                      {stats.total_in_db.toLocaleString()} productos en BD | {stats.published_count.toLocaleString()} publicados | {stats.available_count.toLocaleString()} sin publicar
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Solo sin publicar</Label>
                    <Checkbox
                      checked={showOnlyUnpublished}
                      onCheckedChange={(checked) => setShowOnlyUnpublished(!!checked)}
                    />
                  </div>
                </div>
                
                {/* Filtros */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Buscar</Label>
                    <Input
                      placeholder="Titulo o EAN..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Idioma</Label>
                    <Select value={languageFilter} onValueChange={setLanguageFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SPA">Espanol</SelectItem>
                        <SelectItem value="ENG">Ingles</SelectItem>
                        <SelectItem value="POR">Portugues</SelectItem>
                        <SelectItem value="FRA">Frances</SelectItem>
                        <SelectItem value="ITA">Italiano</SelectItem>
                        <SelectItem value="ALL">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Marca</Label>
                    <Input
                      placeholder="Marca..."
                      value={filterBrand}
                      onChange={(e) => setFilterBrand(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Stock minimo</Label>
                    <Input
                      type="number"
                      min={0}
                      value={minStock}
                      onChange={(e) => setMinStock(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Precio min (EUR)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={minPrice}
                      onChange={(e) => setMinPrice(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Precio max (EUR)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={filteredProducts.slice(0, 50).every(p => selectedProducts.has(p.id)) && filteredProducts.length > 0}
                          onCheckedChange={selectAll}
                        />
                      </TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>EAN</TableHead>
                      <TableHead className="text-right">Costo EUR</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.slice(0, 50).map(product => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedProducts.has(product.id)}
                            onCheckedChange={() => toggleProduct(product.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {product.image_url && (
                              <img
                                src={product.image_url || "/placeholder.svg"}
                                alt=""
                                className="h-10 w-10 rounded object-cover"
                              />
                            )}
                            <div>
                              <p className="font-medium line-clamp-1">{product.title}</p>
                              <p className="text-xs text-muted-foreground">{product.brand}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{product.ean}</TableCell>
                        <TableCell className="text-right">EUR {product.cost_price?.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{product.stock || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Barra de progreso durante publicación */}
              {publishing && publishProgress.total > 0 && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Publicando productos...</p>
                    <p className="text-sm text-muted-foreground">
                      {publishProgress.current} / {publishProgress.total}
                    </p>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                      style={{ width: `${(publishProgress.current / publishProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-600">{publishProgress.success} exitosos</span>
                    <span className="text-red-600">{publishProgress.errors} errores</span>
                    <span className="text-muted-foreground">
                      ~{Math.ceil((publishProgress.total - publishProgress.current))} segundos restantes
                    </span>
                  </div>
                </div>
              )}

              {/* Resumen y contador */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Filtrados: <span className="text-primary">{filteredProducts.length.toLocaleString()}</span> productos
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedProducts.size.toLocaleString()} seleccionados
                    {filteredProducts.length > 50 && ` (mostrando 50 en tabla)`}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllFiltered}
                    disabled={filteredProducts.length === 0 || publishing}
                  >
                    {filteredProducts.every(p => selectedProducts.has(p.id)) && filteredProducts.length > 0
                      ? `Deseleccionar todos (${filteredProducts.length.toLocaleString()})`
                      : `Seleccionar todos (${filteredProducts.length.toLocaleString()})`
                    }
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={generatePreviews}
                    disabled={selectedProducts.size === 0 || publishing}
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Eye className="h-4 w-4 mr-2" />
                    )}
                    Vista previa
                  </Button>
                  
                  <Button
                    onClick={publishDirectly}
                    disabled={selectedProducts.size === 0 || publishing || !selectedTemplate || !selectedAccount}
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Publicar ({selectedProducts.size.toLocaleString()})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Vista previa y publicacion */
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Vista previa de publicacion</CardTitle>
                <CardDescription>
                  Revisa los precios calculados antes de publicar
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Volver a seleccion
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Costo EUR</TableHead>
                    <TableHead className="text-right">Precio ML</TableHead>
                    <TableHead className="text-right">Multiplicador</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previews.map((preview, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <p className="font-medium line-clamp-1">{preview.product.title}</p>
                        <p className="text-xs text-muted-foreground">{preview.product.ean}</p>
                      </TableCell>
                      <TableCell className="text-right">EUR {preview.product.cost_price?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${preview.calculated_price?.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">{preview.multiplier?.toLocaleString("es-AR")}x</TableCell>
                      <TableCell className="text-right">{preview.margin?.toFixed(1)}%</TableCell>
                      <TableCell className="text-center">
                        {preview.status === "pending" && <Badge variant="outline">Pendiente</Badge>}
                        {preview.status === "publishing" && (
                          <Badge variant="secondary">
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Publicando
                          </Badge>
                        )}
                        {preview.status === "success" && (
                          <Badge className="bg-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Publicado
                          </Badge>
                        )}
                        {preview.status === "error" && (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Error
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {selectedTemplate_obj && (
              <p className="text-sm text-muted-foreground mb-4">
                Usando plantilla "{selectedTemplate_obj.name}" con {selectedTemplate_obj.margin_percent || 20}% de margen
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={publishProducts}
                disabled={publishing || previews.every(p => p.status === "success" || p.status === "error")}
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Publicar {previews.filter(p => p.status === "pending").length} productos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
