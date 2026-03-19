"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Link as LinkIcon, ExternalLink } from "lucide-react"

interface UnmatchedPublication {
  id: string
  account_id: string
  account_nickname: string
  ml_item_id: string
  title: string
  status: string
  price: number
  current_stock: number
  created_at: string
  updated_at: string
}

interface Product {
  id: string
  sku: string
  title: string
  author?: string
  stock?: number
  price?: number
  image_url?: string
}

interface MLAccount {
  id: string
  nickname: string
}

export default function UnmatchedPublicationsPage() {
  const [loading, setLoading] = useState(true)
  const [publications, setPublications] = useState<UnmatchedPublication[]>([])
  const [accounts, setAccounts] = useState<MLAccount[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })

  // Filtros
  const [accountFilter, setAccountFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchInput, setSearchInput] = useState("")

  // Modal de asociación
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedPublication, setSelectedPublication] = useState<UnmatchedPublication | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [matching, setMatching] = useState(false)

  // Fetch accounts
  useEffect(() => {
    fetchAccounts()
  }, [])

  // Fetch publications cuando cambian filtros
  useEffect(() => {
    fetchPublications()
  }, [pagination.page, accountFilter, searchQuery])

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/ml/accounts")
      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (error) {
      console.error("Error fetching accounts:", error)
    }
  }

  const fetchPublications = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      })

      if (accountFilter && accountFilter !== "all") {
        params.append("account_id", accountFilter)
      }

      if (searchQuery) {
        params.append("q", searchQuery)
      }

      const response = await fetch(`/api/ml/publications/unmatched?${params}`)

      if (!response.ok) {
        console.error(`[v0] Fetch publications failed with status ${response.status}`)
        setPublications([])
        return
      }

      const data = await response.json()

      setPublications(data.items || [])

      // Safe update: solo actualizar si pagination existe y tiene las propiedades esperadas
      if (data.pagination && typeof data.pagination.page === "number") {
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error("[v0] Error fetching publications:", error)
      setPublications([])
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setSearchQuery(searchInput)
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const handleOpenModal = (publication: UnmatchedPublication) => {
    setSelectedPublication(publication)
    setModalOpen(true)
    setProductSearch("")
    setProducts([])
    setSelectedProduct(null)
  }

  const searchProducts = async (query: string) => {
    if (query.length < 2) {
      setProducts([])
      return
    }

    setSearchingProducts(true)
    try {
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=20`)
      const data = await response.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error("Error searching products:", error)
    } finally {
      setSearchingProducts(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (productSearch) {
        searchProducts(productSearch)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  const handleMatch = async () => {
    if (!selectedPublication || !selectedProduct) return

    setMatching(true)
    try {
      const response = await fetch("/api/ml/publications/manual-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedPublication.account_id,
          ml_item_id: selectedPublication.ml_item_id,
          product_id: selectedProduct.id,
          matched_value: selectedProduct.sku,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        alert("Match creado correctamente")
        setModalOpen(false)
        fetchPublications() // Refresh list
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error("Error creating match:", error)
      alert("Error al crear el match")
    } finally {
      setMatching(false)
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Publicaciones sin Vincular</CardTitle>
          <CardDescription>
            Publicaciones de MercadoLibre que no se pudieron asociar automáticamente con productos internos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Buscar por título o ID</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="search"
                  placeholder="Buscar publicaciones..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} size="icon" className="bg-transparent">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="w-full md:w-64">
              <Label htmlFor="account">Cuenta ML</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger id="account" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las cuentas</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.nickname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total: {pagination.total} publicaciones sin vincular</span>
            <span>
              Página {pagination.page} de {pagination.totalPages}
            </span>
          </div>

          {/* Tabla */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : publications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No se encontraron publicaciones sin vincular</div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Item ID</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {publications.map((pub) => (
                      <TableRow key={pub.ml_item_id}>
                        <TableCell>
                          <Badge variant="outline">{pub.account_nickname}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{pub.ml_item_id}</TableCell>
                        <TableCell className="max-w-md truncate">{pub.title}</TableCell>
                        <TableCell>
                          <Badge variant={pub.status === "active" ? "default" : "secondary"}>{pub.status}</Badge>
                        </TableCell>
                        <TableCell>${pub.price?.toFixed(2) || "0.00"}</TableCell>
                        <TableCell>{pub.current_stock || 0}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleOpenModal(pub)}
                            size="sm"
                            variant="outline"
                            className="bg-transparent"
                          >
                            <LinkIcon className="h-4 w-4 mr-1" />
                            Asociar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Paginación */}
              <div className="flex justify-between items-center">
                <Button
                  onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  disabled={pagination.page === 1}
                  variant="outline"
                  className="bg-transparent"
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {pagination.page} de {pagination.totalPages}
                </span>
                <Button
                  onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                  disabled={pagination.page >= pagination.totalPages}
                  variant="outline"
                  className="bg-transparent"
                >
                  Siguiente
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de asociación */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asociar Publicación con Producto</DialogTitle>
            <DialogDescription>
              Busca y selecciona el producto interno que corresponde a esta publicación
            </DialogDescription>
          </DialogHeader>

          {selectedPublication && (
            <div className="space-y-4">
              {/* Info de la publicación */}
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Publicación ML</span>
                  <Badge>{selectedPublication.account_nickname}</Badge>
                </div>
                <p className="text-sm font-medium">{selectedPublication.title}</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>ID: {selectedPublication.ml_item_id}</span>
                  <span>Precio: ${selectedPublication.price?.toFixed(2)}</span>
                  <span>Stock: {selectedPublication.current_stock}</span>
                </div>
              </div>

              {/* Búsqueda de productos */}
              <div>
                <Label htmlFor="product-search">Buscar Producto Interno</Label>
                <div className="relative mt-1">
                  <Input
                    id="product-search"
                    placeholder="Buscar por SKU, título o autor..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  {searchingProducts && (
                    <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Resultados */}
              {products.length > 0 && (
                <div className="space-y-2">
                  <Label>Resultados ({products.length})</Label>
                  <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                    {products.map((product) => (
                      <div
                        key={product.id}
                        className={`p-3 cursor-pointer hover:bg-muted transition-colors ${
                          selectedProduct?.id === product.id ? "bg-primary/10 border-l-4 border-primary" : ""
                        }`}
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div className="flex gap-3">
                          {product.image_url && (
                            <img
                              src={product.image_url || "/placeholder.svg"}
                              alt={product.title}
                              className="w-12 h-12 object-cover rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{product.title}</p>
                            <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                              <span className="font-mono">SKU: {product.sku}</span>
                              {product.author && <span>Autor: {product.author}</span>}
                              {product.stock !== undefined && <span>Stock: {product.stock}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botones */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  onClick={() => setModalOpen(false)}
                  variant="outline"
                  disabled={matching}
                  className="bg-transparent"
                >
                  Cancelar
                </Button>
                <Button onClick={handleMatch} disabled={!selectedProduct || matching}>
                  {matching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Vinculando...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Vincular
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
