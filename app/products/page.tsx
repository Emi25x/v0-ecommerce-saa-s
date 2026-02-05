"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Product {
  id: string
  title: string
  price: string
  inventory: number
  platform: "shopify" | "mercadolibre" | "both"
  status: string
  image?: string
  catalog_listing?: boolean
  listing_type_id?: string
  tags?: string[]
  SELLER_SKU?: string
  related_listing_id?: string
  account_id?: string
  account_nickname?: string
}

interface PagingInfo {
  total: number
  limit: number
  offset: number
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [mlPaging, setMlPaging] = useState<PagingInfo>({ total: 0, limit: 50, offset: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [mlAccounts, setMlAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("all")

  const [filters, setFilters] = useState({
    status: "all",
    catalog_listing: "all",
    listing_type: "all",
    platform: "mercadolibre",
  })
  
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)

  const fetchMlAccounts = async () => {
    try {
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()
      setMlAccounts(data.accounts || [])
    } catch (error) {
      console.error("Failed to fetch ML accounts:", error)
    }
  }

  useEffect(() => {
    fetchMlAccounts()
  }, [])

  useEffect(() => {
    loadProducts()
  }, [currentPage, filters, selectedAccount])

  const syncAllPublicationsInBackground = async () => {
    console.log("[v0] Iniciando sincronización automática en background...")
    let offset = 0
    let hasMore = true
    let totalSynced = 0
    
    while (hasMore && totalSynced < 1000) { // Límite de 1000 items por sesión para evitar rate limit
      try {
        const params = new URLSearchParams({
          limit: "50",
          offset: offset.toString(),
        })
        
        if (selectedAccount && selectedAccount !== "all") {
          params.append("account_id", selectedAccount)
        }
        
        const response = await fetch(`/api/ml/items?${params.toString()}`)
        
        if (!response.ok) {
          if (response.status === 429) {
            console.log("[v0] Rate limit alcanzado, deteniendo sincronización background")
            break
          }
          break
        }
        
        const data = await response.json()
        
        if (!data.products || data.products.length === 0) {
          hasMore = false
          break
        }
        
        totalSynced += data.products.length
        offset += 50
        
        // Verificar si hay más páginas
        if (data.paging && offset >= data.paging.total) {
          hasMore = false
        }
        
        console.log(`[v0] Background sync: ${totalSynced} items procesados`)
        
        // Delay de 2 segundos entre requests para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 2000))
        
      } catch (error) {
        console.error("[v0] Error en background sync:", error)
        break
      }
    }
    
    console.log(`[v0] Background sync completado: ${totalSynced} items sincronizados`)
  }

  const handleSaveToDatabase = async () => {
    setSaving(true)
    setSaveResult("Sincronizando TODAS las publicaciones en background...")
    
    // Iniciar sincronización en background sin esperar
    syncAllPublicationsInBackground().catch(console.error)
    
    setSaveResult("✓ Sincronización iniciada en background. Se procesarán automáticamente.")
    setSaving(false)
    setTimeout(() => setSaveResult(null), 5000)
  }

  const loadProducts = async () => {
    setLoading(true)
    const allProducts: Product[] = []

    try {
      const offset = (currentPage - 1) * 50
      const params = new URLSearchParams({
        limit: "50",
        offset: offset.toString(),
      })

      if (selectedAccount && selectedAccount !== "all") {
        params.append("account_id", selectedAccount)
      }

      if (filters.status && filters.status !== "all") params.append("status", filters.status)
      if (filters.catalog_listing && filters.catalog_listing !== "all")
        params.append("catalog_listing", filters.catalog_listing)
      if (filters.listing_type && filters.listing_type !== "all") params.append("listing_type", filters.listing_type)

      const mlResponse = await fetch(`/api/ml/items?${params.toString()}`)

      if (mlResponse.ok) {
        const mlData = await mlResponse.json()

        if (mlData.paging) {
          setMlPaging(mlData.paging)
        }

        const formattedMLProducts: Product[] = mlData.products.map((p: any) => ({
          id: p.id,
          title: p.title,
          price: p.price?.toString() || "0",
          inventory: p.available_quantity || 0,
          platform: "mercadolibre" as const,
          status: p.status,
          image: p.thumbnail,
          catalog_listing: p.catalog_listing,
          listing_type_id: p.listing_type_id,
          tags: p.tags,
          SELLER_SKU: p.SELLER_SKU,
          account_id: p.account_id,
          account_nickname: p.account_nickname,
        }))

        allProducts.push(...formattedMLProducts)
      }
    } catch (error) {
      console.error("Failed to load products:", error)
    }

    setProducts(allProducts)
    setLoading(false)
  }

  const toggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(productId)) {
      newSelected.delete(productId)
    } else {
      newSelected.add(productId)
    }
    setSelectedProducts(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)))
    }
  }

  const filteredProducts = products.filter((product) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (query.startsWith("mla")) {
        return product.id.toLowerCase().includes(query)
      }
      const matchesTitle = product.title.toLowerCase().includes(query)
      const matchesSKU = product.SELLER_SKU?.toLowerCase().includes(query)
      return matchesTitle || matchesSKU
    }
    return true
  })

  const totalPages = Math.ceil(mlPaging.total / mlPaging.limit)

  return (
    <div className="min-h-screen p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Publicaciones ML</h2>
        <p className="text-muted-foreground">
          {mlPaging.total > 0 ? `${mlPaging.total.toLocaleString()} publicaciones` : "Gestiona tus publicaciones"}
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label>Cuenta:</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas ({mlAccounts.length})</SelectItem>
                {mlAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.nickname || account.ml_user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="closed">Cerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Catálogo</Label>
              <Select
                value={filters.catalog_listing}
                onValueChange={(v) => setFilters({ ...filters, catalog_listing: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Sí</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={filters.listing_type} onValueChange={(v) => setFilters({ ...filters, listing_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="gold_special">Clásica</SelectItem>
                  <SelectItem value="gold_pro">Premium</SelectItem>
                  <SelectItem value="free">Gratuita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Input
            placeholder="Buscar por título, SKU o ID (MLA)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lista de Productos</CardTitle>
              <CardDescription>
                {loading
                  ? "Cargando..."
                  : `Mostrando ${filteredProducts.length} productos (Página ${currentPage} de ${totalPages})`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadProducts} disabled={loading}>
                Actualizar
              </Button>
              <Button 
                onClick={handleSaveToDatabase} 
                disabled={saving || products.length === 0}
                variant="default"
                className="bg-green-600 hover:bg-green-700"
              >
                {saving ? "Guardando..." : "Guardar en BD"}
              </Button>
            </div>
          </div>
          {saveResult && (
            <div className="mt-2 text-sm bg-green-50 border border-green-200 text-green-700 p-2 rounded">
              {saveResult}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[400px] items-center justify-center">Cargando productos...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center">No hay productos disponibles.</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Catálogo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedProducts.has(product.id)}
                          onCheckedChange={() => toggleProductSelection(product.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.image && (
                            <img
                              src={product.image || "/placeholder.svg"}
                              alt={product.title}
                              className="h-10 w-10 rounded object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium">{product.title}</p>
                            <p className="text-xs text-muted-foreground">{product.id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.account_nickname || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>${product.price}</TableCell>
                      <TableCell>
                        <Badge variant={product.inventory > 0 ? "default" : "secondary"}>{product.inventory}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.status === "active" ? "default" : "secondary"}>{product.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {product.catalog_listing && <Badge>Catálogo</Badge>}
                        {product.tags?.includes("catalog_listing_eligible") && (
                          <Badge variant="outline">Elegible</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || loading}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
