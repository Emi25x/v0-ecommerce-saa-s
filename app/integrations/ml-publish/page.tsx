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
  const [previews, setPreviews] = useState<PublishPreview[]>([])
  const [publishing, setPublishing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch products not published in ML (with cost_price)
      const productsRes = await fetch("/api/ml/publish/available")
      const productsData = await productsRes.json()
      setProducts(productsData.products || [])

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

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.ean.includes(searchTerm)
    const matchesStock = (p.stock || 0) >= minStock
    const matchesPrice = p.cost_price >= minPrice && p.cost_price <= maxPrice
    return matchesSearch && matchesStock && matchesPrice
  })

  const generatePreviews = async () => {
    console.log("[v0] generatePreviews - selectedProducts:", selectedProducts.size)
    console.log("[v0] generatePreviews - template:", selectedTemplate, "account:", selectedAccount)
    
    if (selectedProducts.size === 0) {
      toast({ title: "Error", description: "Selecciona al menos un producto", variant: "destructive" })
      return
    }

    setPublishing(true)
    const newPreviews: PublishPreview[] = []

    for (const productId of selectedProducts) {
      const product = products.find(p => p.id === productId)
      if (!product) continue

      console.log("[v0] Generating preview for product:", product.title, "cost:", product.cost_price)

      try {
        const response = await fetch("/api/ml/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            template_id: selectedTemplate,
            account_id: selectedAccount,
            preview_only: true
          })
        })

        const data = await response.json()
        console.log("[v0] Preview response:", data)

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
            preview_only: false
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
            <CardContent className="grid gap-4 md:grid-cols-2">
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
                      {filteredProducts.length} de {products.length} productos
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={selectAll}
                    className="bg-transparent"
                  >
                    {selectedProducts.size === filteredProducts.length && filteredProducts.length > 0 
                      ? "Deseleccionar todos" 
                      : `Seleccionar ${filteredProducts.length > 50 ? 50 : filteredProducts.length}`}
                  </Button>
                </div>
                
                {/* Filtros */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Buscar</Label>
                    <Input
                      placeholder="Titulo o EAN..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
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

              {filteredProducts.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Mostrando 50 de {filteredProducts.length} productos
                </p>
              )}

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {selectedProducts.size} productos seleccionados
                </p>
                <Button
                  onClick={generatePreviews}
                  disabled={selectedProducts.size === 0 || publishing}
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  Vista previa ({selectedProducts.size})
                </Button>
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
