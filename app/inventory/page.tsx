"use client"

import { useState, useEffect } from "react"
import { Package, ShoppingCart, TrendingUp, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Upload,
  RefreshCw,
  Edit,
  Trash2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Settings,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import Link from "next/link" // Importado desde updates

export default function InventoryPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importSources, setImportSources] = useState<any[]>([])
  const [selectedSource, setSelectedSource] = useState("")
  // Elimina updateExistingData state - ya no se permite actualizar productos existentes
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{
    stage: string
    message: string
    show: boolean
  }>({
    stage: "",
    message: "",
    show: false,
  })
  const [validationResults, setValidationResults] = useState<any>(null)
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validating, setValidating] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState<any>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [detailsProduct, setDetailsProduct] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const productsPerPage = 100
  const [sortBy, setSortBy] = useState<string>("id")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null)
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [showImportSummary, setShowImportSummary] = useState(false)
  const [importSummary, setImportSummary] = useState<any>(null)

  const [scheduleFrequency, setScheduleFrequency] = useState<string>("once")
  const [scheduleTime, setScheduleTime] = useState<string>("00:00")
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState<number>(1)
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState<number>(1)
  const [scheduleTimezone, setScheduleTimezone] = useState<string>("America/Santiago")

  const timezones = [
    { country: "Argentina", timezone: "America/Argentina/Buenos_Aires" },
    { country: "Chile", timezone: "America/Santiago" },
    { country: "Colombia", timezone: "America/Bogota" },
    { country: "España", timezone: "Europe/Madrid" },
    { country: "Estados Unidos (Centro)", timezone: "America/Chicago" },
    { country: "Estados Unidos (Este)", timezone: "America/New_York" },
    { country: "Estados Unidos (Montaña)", timezone: "America/Denver" },
    { country: "Estados Unidos (Pacífico)", timezone: "America/Los_Angeles" },
    { country: "México (Centro)", timezone: "America/Mexico_City" },
    { country: "México (Noroeste)", timezone: "America/Tijuana" },
    { country: "México (Sureste)", timezone: "America/Cancun" },
    { country: "Venezuela", timezone: "America/Caracas" },
  ]

  const [showSkuVerifier, setShowSkuVerifier] = useState(false)
  const [skuToVerify, setSkuToVerify] = useState("")
  const [verificationResult, setVerificationResult] = useState<any>(null)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    loadProducts()
    loadImportSources()
  }, [currentPage, sortBy, sortOrder, debouncedSearch])

  const loadProducts = async () => {
    setLoading(true)
    setErrorMessage(null)
    console.log(
      "[v0] Cargando productos - página:",
      currentPage,
      "ordenar por:",
      sortBy,
      sortOrder,
      "búsqueda:",
      debouncedSearch, // Usar debouncedSearch
    )

    try {
      const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""
      const response = await fetch(
        `/api/inventory/products?page=${currentPage}&limit=${productsPerPage}&sortBy=${sortBy}&sortOrder=${sortOrder}${searchParam}`,
      )

      console.log("[v0] Respuesta recibida:", response.status, response.statusText)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Datos recibidos:", {
          productos: data.products?.length || 0,
          total: data.total,
          página: data.page,
          totalPáginas: data.totalPages,
        })

        // Debug: mostrar el primer producto para ver su estructura
        if (data.products && data.products.length > 0) {
          console.log("[v0] Primer producto:", data.products[0])
        }

        setProducts(data.products || [])
        setTotalProducts(data.total || 0)
        setTotalPages(data.totalPages || 0)

        if (data.products?.length === 0 && currentPage > 1) {
          setCurrentPage(1)
        }
      } else {
        const errorData = await response.json()
        console.error("[v0] Error al cargar productos:", errorData)
        if (errorData.timeout) {
          setErrorMessage("La búsqueda tardó demasiado tiempo. Intenta con un término más específico.")
        } else {
          setErrorMessage(`Error al cargar productos: ${errorData.error || response.statusText}`)
        }

        toast({
          title: "Error",
          description: errorData.error || "No se pudieron cargar los productos",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("[v0] Error en fetch:", error)
      setErrorMessage(`Error de conexión: ${error.message}`)
      toast({
        title: "Error",
        description: `Error al cargar productos: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadImportSources = async () => {
    console.log("[v0] Cargando fuentes de importación...")
    try {
      const response = await fetch("/api/import-sources")
      console.log("[v0] Respuesta fuentes:", response.status, response.statusText)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Fuentes recibidas:", data)
        console.log("[v0] Número de fuentes:", Array.isArray(data) ? data.length : 0)
        setImportSources(Array.isArray(data) ? data : [])
      } else {
        const errorData = await response.json()
        console.error("[v0] Error al cargar fuentes:", errorData)
        toast({
          title: "Error",
          description: `No se pudieron cargar las fuentes de importación: ${errorData.error || response.statusText}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error en fetch fuentes:", error)
      toast({
        title: "Error",
        description: "Error al cargar fuentes de importación",
        variant: "destructive",
      })
    }
  }

  const handleSort = (column: string) => {
    if (column === "source") {
      toast({
        title: "Ordenamiento no disponible",
        description: "No se puede ordenar por fuente debido a que un producto puede tener múltiples fuentes",
        variant: "default",
      })
      return
    }

    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(column)
      setSortOrder("asc")
    }
    setCurrentPage(1)
  }

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />
    }
    return sortOrder === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
  }

  const handleImportFromSource = async () => {
    console.log("[v0] handleImportFromSource iniciado")
    console.log("[v0] selectedSource:", selectedSource)

    if (!selectedSource) {
      console.log("[v0] Error: No hay fuente seleccionada")
      toast({
        title: "Error",
        description: "Por favor selects una fuente de importación",
        variant: "destructive",
      })
      return
    }

    console.log("[v0] Iniciando importación directa...")
    setImporting(true)
    setShowImportDialog(false)

    setImportProgress({
      stage: "downloading",
      message: "Descargando CSV desde la fuente...",
      show: true,
    })

    try {
      const importPayload = {
        sourceId: selectedSource,
        // Elimina updateExisting del payload - siempre será false (solo nuevos)
        offset: 0,
        schedule: {
          frequency: scheduleFrequency,
          time: scheduleTime,
          day_of_week: scheduleFrequency === "weekly" ? scheduleDayOfWeek : null,
          day_of_month: scheduleFrequency === "monthly" ? scheduleDayOfMonth : null,
          timezone: scheduleTimezone,
        },
      }

      console.log("[v0] Payload de importación:", importPayload)
      console.log("[v0] Llamando a /api/inventory/import/csv")

      setTimeout(() => {
        setImportProgress({
          stage: "processing",
          message: "Procesando productos del CSV...",
          show: true,
        })
      }, 1000)

      const importResponse = await fetch("/api/inventory/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importPayload),
      })

      console.log("[v0] Respuesta importación:", importResponse.status, importResponse.statusText)

      if (!importResponse.ok) {
        const errorData = await importResponse.json()
        console.error("[v0] Error en importación:", errorData)
        throw new Error(errorData.error || "Error al importar productos")
      }

      setImportProgress({
        stage: "inserting",
        message: "Insertando productos en la base de datos...",
        show: true,
      })

      const result = await importResponse.json()
      console.log("[v0] Resultado de importación:", result)

      setImportProgress({
        stage: "finalizing",
        message: "Finalizando importación...",
        show: true,
      })

      await new Promise((resolve) => setTimeout(resolve, 500))

      setImportSummary(result.summary || result)
      setShowImportSummary(true)

      toast({
        title: "Importación completada",
        description:
          scheduleFrequency !== "once"
            ? "Los productos se han importado y la programación se ha configurado correctamente"
            : "Los productos se han importado correctamente",
      })

      loadProducts()
    } catch (error: any) {
      console.error("[v0] Error en importación:", error)
      console.error("[v0] Stack trace:", error.stack)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      console.log("[v0] Finalizando importación, limpiando estados")
      setImporting(false)
      setImportProgress({
        stage: "",
        message: "",
        show: false,
      })
    }
  }

  const handleEditProduct = (product: any) => {
    setEditingProduct({ ...product })
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!editingProduct) return

    try {
      const response = await fetch(`/api/inventory/products/${editingProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProduct),
      })

      if (response.ok) {
        toast({
          title: "Producto actualizado",
          description: "El producto se ha actualizado correctamente",
        })
        setShowEditDialog(false)
        loadProducts()
      } else {
        throw new Error("Error al actualizar producto")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return

    try {
      const response = await fetch(`/api/inventory/products/${deletingProduct.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Producto eliminado",
          description: "El producto se ha eliminado correctamente",
        })
        setShowDeleteDialog(false)
        setDeletingProduct(null)
        loadProducts()
      } else {
        throw new Error("Error al eliminar producto")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleViewDetails = (product: any) => {
    setDetailsProduct(product)
    setShowDetailsDialog(true)
  }

  const loadDiagnostics = async () => {
    setLoadingDiagnostics(true)
    try {
      const [diagnosticsRes, schedulesRes] = await Promise.all([
        fetch("/api/inventory/diagnostics"),
        fetch("/api/inventory/schedules"),
      ])

      const diagnostics = diagnosticsRes.ok ? await diagnosticsRes.json() : null
      const schedules = schedulesRes.ok ? await schedulesRes.json() : null

      setDiagnosticsData({
        ...diagnostics,
        schedules: schedules?.schedules || [],
        history: schedules?.history || [],
      })
    } catch (error) {
      console.error("Error loading diagnostics:", error)
    } finally {
      setLoadingDiagnostics(false)
    }
  }

  const handleOpenDiagnostics = () => {
    setShowDiagnostics(true)
    loadDiagnostics()
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(products.map((p) => p.id)))
    }
  }

  const toggleSelectProduct = (id: string) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedProducts(newSelected)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case "error":
        return <XCircle className="h-5 w-5 text-red-600" />
      case "partial":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />
      case "running":
        return <Clock className="h-5 w-5 text-blue-600 animate-spin" />
      default:
        return null
    }
  }

  const handleVerifySku = async (sku: string) => {
    if (!sku.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa un SKU para verificar",
        variant: "destructive",
      })
      return
    }

    setVerifying(true)
    try {
      const response = await fetch(`/api/inventory/verify-sku?sku=${encodeURIComponent(sku)}`)
      if (response.ok) {
        const result = await response.json()
        setVerificationResult(result)
        console.log("[v0] Resultado de verificación:", result)

        toast({
          title: result.found ? "Producto encontrado" : "Producto no encontrado",
          description: result.message,
          variant: result.found ? "default" : "destructive",
        })
      } else {
        throw new Error("Error al verificar SKU")
      }
    } catch (error: any) {
      console.error("[v0] Error verificando SKU:", error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Ecommerce Manager</h1>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-64 border-r border-border bg-sidebar">
          <nav className="flex flex-col gap-1 p-4">
            <a
              href="/"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Package className="h-5 w-5" />
              <span className="font-medium">Dashboard</span>
            </a>
            <a
              href="/products"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="font-medium">Productos</span>
            </a>
            <a
              href="/inventory"
              className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2 text-sidebar-accent-foreground transition-colors"
            >
              <Database className="h-5 w-5" />
              <span className="font-medium">Base de Productos</span>
            </a>
            <a
              href="/inventory/sources"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Upload className="h-5 w-5" />
              <span className="font-medium">Fuentes de Importación</span>
            </a>
            <a
              href="/destinations"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <TrendingUp className="h-5 w-5" />
              <span className="font-medium">Destinos</span>
            </a>
            <a
              href="/integrations"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <TrendingUp className="h-5 w-5" />
              <span className="font-medium">Integraciones</span>
            </a>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Base de Productos</h2>
                <p className="text-muted-foreground">Gestiona tu inventario de productos</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="lg" onClick={() => setShowSkuVerifier(true)} className="gap-2">
                  <Search className="h-5 w-5" />
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">Verificar SKU</span>
                    <span className="text-xs text-muted-foreground">Buscar en base de datos</span>
                  </div>
                </Button>
                <Link href="/inventory/sources">
                  <Button variant="outline" size="lg" className="gap-2 bg-transparent">
                    <Settings className="h-5 w-5" />
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Gestor de Importaciones</span>
                      <span className="text-xs text-muted-foreground">Ver fuentes configuradas</span>
                    </div>
                  </Button>
                </Link>
                <Button variant="outline" onClick={handleOpenDiagnostics}>
                  <Activity className="mr-2 h-4 w-4" />
                  Diagnóstico
                </Button>
                <Button onClick={() => setShowImportDialog(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar desde Fuente
                </Button>
              </div>
            </div>

            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-600 dark:text-red-400 font-medium">{errorMessage}</p>
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por SKU, título o descripción..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searchQuery !== debouncedSearch && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={loadProducts}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </Button>
            </div>

            <div className="rounded-lg border-2 border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="border-r-2 border-border w-12">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === products.length && products.length > 0}
                        onChange={toggleSelectAll}
                        className="cursor-pointer"
                      />
                    </TableHead>
                    <TableHead className="border-r-2 border-border w-16">Imagen</TableHead>
                    <TableHead className="border-r-2 border-border">SKU</TableHead>
                    <TableHead className="border-r-2 border-border">Título</TableHead>
                    <TableHead className="border-r-2 border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort("price")}
                        className="hover:bg-transparent p-0 h-auto font-semibold"
                      >
                        Precio
                        {getSortIcon("price")}
                      </Button>
                    </TableHead>
                    <TableHead className="border-r-2 border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort("stock")}
                        className="hover:bg-transparent p-0 h-auto font-semibold"
                      >
                        Stock
                        {getSortIcon("stock")}
                      </Button>
                    </TableHead>
                    <TableHead className="border-r-2 border-border font-semibold">Fuente</TableHead>
                    <TableHead className="border-r-2 border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort("created_at")}
                        className="hover:bg-transparent p-0 h-auto font-semibold"
                      >
                        Fecha Creación
                        {getSortIcon("created_at")}
                      </Button>
                    </TableHead>
                    <TableHead className="border-r-2 border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort("updated_at")}
                        className="hover:bg-transparent p-0 h-auto font-semibold"
                      >
                        Última Actualización
                        {getSortIcon("updated_at")}
                      </Button>
                    </TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        Cargando productos...
                      </TableCell>
                    </TableRow>
                  ) : products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        {searchQuery
                          ? `No se encontraron productos que coincidan con "${searchQuery}"`
                          : "No se encontraron productos"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="border-r-2 border-border">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="border-r-2 border-border p-2">
                          {product.url_template || product.image_url ? (
                            <img
                              src={product.url_template || product.image_url}
                              alt={product.title || "Producto"}
                              className="w-12 h-12 object-cover rounded border border-border"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder.svg?height=50&width=50"
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded border border-border flex items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="border-r-2 border-border font-mono text-sm">{product.sku}</TableCell>
                        <TableCell className="border-r-2 border-border max-w-xs truncate">{product.title}</TableCell>
                        <TableCell className="border-r-2 border-border font-mono">
                          ${product.price != null ? product.price.toFixed(2) : "N/A"}
                        </TableCell>
                        <TableCell className="border-r-2 border-border">{product.stock ?? "N/A"}</TableCell>
                        <TableCell className="border-r-2 border-border">
                          {product.source && Array.isArray(product.source) && product.source.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {product.source.slice(0, 2).map((src: string, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {src}
                                </Badge>
                              ))}
                              {product.source.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{product.source.length - 2}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Sin fuente</span>
                          )}
                        </TableCell>
                        <TableCell className="border-r-2 border-border text-sm text-muted-foreground">
                          {product.created_at ? new Date(product.created_at).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell className="border-r-2 border-border text-sm text-muted-foreground">
                          {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditProduct(product)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleViewDetails(product)}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDeletingProduct(product)
                                setShowDeleteDialog(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * productsPerPage + 1} a{" "}
                {Math.min(currentPage * productsPerPage, totalProducts)} de {totalProducts} productos
                {searchQuery && ` (filtrando por "${searchQuery}")`}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <div className="text-sm">
                  Página {currentPage} de {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Import Dialog */}
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Importar desde Fuente</DialogTitle>
                <DialogDescription>Selecciona una fuente de importación configurada</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Fuente de Importación</Label>
                  <select
                    className="w-full mt-1 p-2 border rounded-md bg-background text-foreground dark:bg-background dark:text-foreground"
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                  >
                    <option value="">Seleccionar fuente...</option>
                    {importSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Nota:</strong> Solo se importarán productos nuevos. Los productos con SKU existente serán
                    saltados automáticamente.
                  </p>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h3 className="font-semibold">Programación de Importación</h3>

                  <div>
                    <Label>Frecuencia</Label>
                    <select
                      className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                      value={scheduleFrequency}
                      onChange={(e) => setScheduleFrequency(e.target.value)}
                    >
                      <option value="daily">Diariamente</option>
                      <option value="monthly">Mensualmente</option>
                      <option value="once">Una vez (ahora)</option>
                      <option value="weekly">Semanalmente</option>
                    </select>
                  </div>

                  {scheduleFrequency !== "once" && (
                    <>
                      <div>
                        <Label>Zona Horaria</Label>
                        <select
                          className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                          value={scheduleTimezone}
                          onChange={(e) => {
                            console.log("[v0] Cambiando zona horaria a:", e.target.value)
                            setScheduleTimezone(e.target.value)
                          }}
                        >
                          {timezones.map((tz) => (
                            <option key={tz.timezone} value={tz.timezone}>
                              {tz.country}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">
                          La hora de ejecución se ajustará a la zona horaria seleccionada
                        </p>
                      </div>

                      <div>
                        <Label>Hora de Ejecución</Label>
                        <Input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => {
                            console.log("[v0] Cambiando hora a:", e.target.value)
                            setScheduleTime(e.target.value)
                          }}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Hora en formato 24h (ej: 14:30 para 2:30 PM)
                        </p>
                      </div>

                      {console.log("[v0] scheduleFrequency actual:", scheduleFrequency)}
                      {console.log("[v0] ¿Debería mostrar selector de día?:", scheduleFrequency === "weekly")}

                      {scheduleFrequency === "weekly" && (
                        <div>
                          <Label>Día de la Semana</Label>
                          <select
                            className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                            value={scheduleDayOfWeek}
                            onChange={(e) => {
                              console.log("[v0] Cambiando día de la semana a:", e.target.value)
                              setScheduleDayOfWeek(Number(e.target.value))
                            }}
                          >
                            <option value={0}>Domingo</option>
                            <option value={1}>Lunes</option>
                            <option value={2}>Martes</option>
                            <option value={3}>Miércoles</option>
                            <option value={4}>Jueves</option>
                            <option value={5}>Viernes</option>
                            <option value={6}>Sábado</option>
                          </select>
                        </div>
                      )}

                      {scheduleFrequency === "monthly" && (
                        <div>
                          <Label>Día del Mes</Label>
                          <select
                            className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                            value={scheduleDayOfMonth}
                            onChange={(e) => setScheduleDayOfMonth(Number(e.target.value))}
                          >
                            {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                              <option key={day} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground mt-1">
                            Solo días 1-28 para evitar problemas con meses cortos
                          </p>
                        </div>
                      )}

                      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>Nota:</strong> La importación programada se ejecutará automáticamente según la
                          frecuencia seleccionada.
                          {scheduleFrequency === "daily" && " Se ejecutará todos los días a las " + scheduleTime + "."}
                          {scheduleFrequency === "weekly" &&
                            " Se ejecutará todos los " +
                              ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"][
                                scheduleDayOfWeek
                              ] +
                              " a las " +
                              scheduleTime +
                              "."}
                          {scheduleFrequency === "monthly" &&
                            " Se ejecutará el día " + scheduleDayOfMonth + " de cada mes a las " + scheduleTime + "."}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowImportDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleImportFromSource}>
                  {scheduleFrequency === "once" ? "Importar Ahora" : "Importar y Programar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Validation Dialog */}
          <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Validación de Importación</DialogTitle>
              </DialogHeader>
              {validating ? (
                <div className="text-center py-8">Validando configuración...</div>
              ) : validationResults ? (
                <div className="space-y-4">
                  {validationResults.errors?.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-red-600 dark:text-red-400">Errores:</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResults.errors.map((error: string, i: number) => (
                          <li key={i} className="text-red-600 dark:text-red-400">
                            {error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validationResults.warnings?.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-yellow-600 dark:text-yellow-400">Advertencias:</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResults.warnings.map((warning: string, i: number) => (
                          <li key={i} className="text-yellow-600 dark:text-yellow-400">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </DialogContent>
          </Dialog>

          <Dialog open={importProgress.show} onOpenChange={() => {}}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Importando Productos</DialogTitle>
                <DialogDescription>Por favor espera mientras se importan los productos...</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <RefreshCw className="h-16 w-16 text-primary animate-spin" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="font-medium text-lg">{importProgress.message}</p>
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      {importProgress.stage === "downloading" && (
                        <>
                          <Database className="h-4 w-4" />
                          <span>Conectando con la fuente de datos...</span>
                        </>
                      )}
                      {importProgress.stage === "processing" && (
                        <>
                          <Package className="h-4 w-4" />
                          <span>Validando y procesando productos...</span>
                        </>
                      )}
                      {importProgress.stage === "inserting" && (
                        <>
                          <Upload className="h-4 w-4" />
                          <span>Guardando en la base de datos...</span>
                        </>
                      )}
                      {importProgress.stage === "finalizing" && (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Completando importación...</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                    Este proceso puede tomar varios minutos dependiendo del tamaño del archivo.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showImportSummary} onOpenChange={setShowImportSummary}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Resumen de Importación</DialogTitle>
                <DialogDescription>Resultados de la importación completada</DialogDescription>
              </DialogHeader>
              {importSummary && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="text-sm text-green-600 dark:text-green-400 font-medium">Productos Nuevos</div>
                      <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                        {importSummary.imported || 0}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Productos que no existían en la base de datos
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-950/30 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Ya Existían (Saltados)</div>
                      <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">
                        {importSummary.updated || 0}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Productos con SKU existente que no se importaron
                      </div>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Duplicados en CSV</div>
                      <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">
                        {importSummary.skipped || 0}
                      </div>
                      <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        SKUs repetidos en el archivo que se combinaron
                      </div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <div className="text-sm text-red-600 dark:text-red-400 font-medium">Errores</div>
                      <div className="text-3xl font-bold text-red-700 dark:text-red-300">
                        {importSummary.failed || 0}
                      </div>
                      <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Productos que no pudieron ser procesados
                      </div>
                    </div>
                  </div>

                  {importSummary.sampleSkus && importSummary.sampleSkus.length > 0 && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-3">Verificación de SKUs (Primeros 5 del archivo):</h3>
                      <div className="space-y-2">
                        {importSummary.sampleSkus.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              item.status === "nuevo"
                                ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                                : item.status === "existente"
                                  ? "bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800"
                                  : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                            }`}
                          >
                            <div className="flex-1">
                              <div className="font-mono text-sm font-semibold">{item.sku}</div>
                              {item.title && (
                                <div className="text-xs text-muted-foreground truncate max-w-md">{item.title}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  item.status === "nuevo"
                                    ? "default"
                                    : item.status === "existente"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {item.status === "nuevo"
                                  ? "✓ Nuevo"
                                  : item.status === "existente"
                                    ? "⊘ Ya existía"
                                    : "✗ Error"}
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSearchQuery(item.sku)
                                  setShowImportSummary(false)
                                  loadProducts()
                                }}
                              >
                                <Search className="h-3 w-3 mr-1" />
                                Buscar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Haz clic en "Buscar" para ver el producto en el inventario
                      </p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="text-sm text-muted-foreground">
                      <strong>Total procesado:</strong> {importSummary.total || 0} registros
                    </div>
                  </div>

                  {importSummary.errors && importSummary.errors.length > 0 && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-2 text-red-600 dark:text-red-400">
                        Errores Encontrados ({importSummary.errors.length}):
                      </h3>
                      <div className="max-h-40 overflow-y-auto space-y-1 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-3">
                        {importSummary.errors.map((error: string, i: number) => (
                          <div key={i} className="text-sm text-red-600 dark:text-red-400 font-mono">
                            • {error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">Resumen:</h3>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                      {(importSummary.imported || 0) > 0 && (
                        <li>✓ Se importaron {importSummary.imported} productos nuevos a la base de datos</li>
                      )}
                      {(importSummary.updated || 0) > 0 && (
                        <li>⊘ Se saltaron {importSummary.updated} productos porque ya existían (mismo SKU)</li>
                      )}
                      {(importSummary.skipped || 0) > 0 && (
                        <li>
                          ⚠ Se encontraron {importSummary.skipped} SKUs duplicados en el CSV que se combinaron
                          automáticamente
                        </li>
                      )}
                      {(importSummary.failed || 0) > 0 && (
                        <li>✗ {importSummary.failed} productos no pudieron ser procesados (ver errores arriba)</li>
                      )}
                      {(importSummary.imported || 0) === 0 &&
                        (importSummary.updated || 0) === 0 &&
                        (importSummary.failed || 0) === 0 && <li>No se procesaron productos nuevos</li>}
                    </ul>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setShowImportSummary(false)}>Cerrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar Producto</DialogTitle>
              </DialogHeader>
              {editingProduct && (
                <div className="space-y-4">
                  <div>
                    <Label>SKU</Label>
                    <Input
                      value={editingProduct.sku || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Título</Label>
                    <Input
                      value={editingProduct.title || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Descripción</Label>
                    <Textarea
                      value={editingProduct.description || ""}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Precio</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editingProduct.price || ""}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            price: Number.parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Stock</Label>
                      <Input
                        type="number"
                        value={editingProduct.stock || ""}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            stock: Number.parseInt(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Dialog */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmar Eliminación</DialogTitle>
                <DialogDescription>
                  ¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.
                </DialogDescription>
              </DialogHeader>
              {deletingProduct && (
                <div className="py-4">
                  <p className="font-semibold">{deletingProduct.title}</p>
                  <p className="text-sm text-muted-foreground">SKU: {deletingProduct.sku}</p>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false)
                    setDeletingProduct(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleDeleteProduct}>
                  Eliminar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Details Dialog */}
          <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Detalles del Producto</DialogTitle>
              </DialogHeader>
              {detailsProduct && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">SKU</Label>
                      <p className="font-mono">{detailsProduct.sku}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Código Interno</Label>
                      <p className="font-mono">{detailsProduct.internal_code || "N/A"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Título</Label>
                    <p>{detailsProduct.title}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Descripción</Label>
                    <p className="text-sm">{detailsProduct.description || "N/A"}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Precio</Label>
                      <p className="font-mono">
                        ${detailsProduct.price != null ? detailsProduct.price.toFixed(2) : "N/A"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Stock</Label>
                      <p>{detailsProduct.stock ?? "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Condición</Label>
                      <p>{detailsProduct.condition || "N/A"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Marca</Label>
                      <p>{detailsProduct.brand || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Categoría</Label>
                      <p>{detailsProduct.category || "N/A"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Fuentes</Label>
                    {detailsProduct.source &&
                    Array.isArray(detailsProduct.source) &&
                    detailsProduct.source.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {detailsProduct.source.map((src: string, idx: number) => (
                          <Badge key={idx} variant="secondary">
                            {src}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm">Sin fuentes</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Fecha de Creación</Label>
                      <p className="text-sm">
                        {detailsProduct.created_at ? new Date(detailsProduct.created_at).toLocaleString() : "N/A"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Última Actualización</Label>
                      <p className="text-sm">
                        {detailsProduct.updated_at ? new Date(detailsProduct.updated_at).toLocaleString() : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={showDiagnostics} onOpenChange={setShowDiagnostics}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Diagnóstico del Sistema</DialogTitle>
              </DialogHeader>
              {loadingDiagnostics ? (
                <div className="text-center py-8">Cargando diagnóstico...</div>
              ) : diagnosticsData ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-2">Total de Productos</h3>
                    <p className="text-3xl font-bold">{diagnosticsData.totalProducts}</p>
                  </div>

                  {diagnosticsData.productsBySource && (
                    <div>
                      <h3 className="font-semibold mb-2">Productos por Fuente</h3>
                      <div className="space-y-2">
                        {diagnosticsData.productsBySource.map((item: any) => (
                          <div key={item.source} className="flex justify-between">
                            <span>{item.source || "Sin fuente"}</span>
                            <Badge>{item.count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {diagnosticsData.schedules && diagnosticsData.schedules.length > 0 && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-3">Importaciones Programadas</h3>
                      <div className="space-y-3">
                        {diagnosticsData.schedules.map((schedule: any) => (
                          <div key={schedule.id} className="border rounded-lg p-3 bg-muted/30">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium">
                                  {schedule.import_sources?.name || "Fuente desconocida"}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  Frecuencia: {schedule.frequency === "daily" && "Diaria"}
                                  {schedule.frequency === "weekly" && "Semanal"}
                                  {schedule.frequency === "monthly" && "Mensual"}
                                  {" a las " + schedule.time}
                                  {schedule.timezone && ` (${schedule.timezone})`}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Próxima ejecución:{" "}
                                  {schedule.next_run_at
                                    ? new Date(schedule.next_run_at).toLocaleString()
                                    : "No programada"}
                                </div>
                                {schedule.last_run_at && (
                                  <div className="text-sm text-muted-foreground">
                                    Última ejecución: {new Date(schedule.last_run_at).toLocaleString()}
                                  </div>
                                )}
                              </div>
                              <Badge variant={schedule.is_active ? "default" : "secondary"}>
                                {schedule.is_active ? "Activa" : "Inactiva"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {diagnosticsData.history && diagnosticsData.history.length > 0 && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-3">Historial de Importaciones (Últimas 20)</h3>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {diagnosticsData.history.slice(0, 20).map((item: any) => (
                          <div key={item.id} className="border rounded-lg p-3 flex items-start gap-3">
                            <div className="mt-0.5">{getStatusIcon(item.status)}</div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="font-medium">{item.import_sources?.name || "Fuente desconocida"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(item.started_at).toLocaleString()}
                                </div>
                              </div>
                              <div className="flex gap-4 mt-1 text-sm">
                                <span className="text-green-600 dark:text-green-400">
                                  +{item.products_imported} nuevos
                                </span>
                                <span className="text-blue-600 dark:text-blue-400">
                                  ~{item.products_updated} actualizados
                                </span>
                                {item.products_failed > 0 && (
                                  <span className="text-red-600 dark:text-red-400">
                                    ✕{item.products_failed} errores
                                  </span>
                                )}
                              </div>
                              {item.error_message && (
                                <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                  Error: {item.error_message}
                                </div>
                              )}
                              {item.completed_at && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Duración:{" "}
                                  {Math.round(
                                    (new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) /
                                      1000,
                                  )}
                                  s
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {diagnosticsData.recentProducts && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-2">Últimos 10 Productos Creados</h3>
                      <div className="space-y-2 text-sm">
                        {diagnosticsData.recentProducts.map((product: any) => (
                          <div key={product.id} className="border rounded p-2">
                            <p className="font-mono text-xs">{product.sku}</p>
                            <p className="truncate">{product.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(product.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <DialogFooter>
                <Button onClick={() => setShowDiagnostics(false)}>Cerrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showSkuVerifier} onOpenChange={setShowSkuVerifier}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Verificar SKU en Base de Datos</DialogTitle>
                <DialogDescription>
                  Ingresa un SKU para verificar si existe en la base de datos y ver su información
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Ingresa el SKU a verificar (ej: 9788466739894)"
                    value={skuToVerify}
                    onChange={(e) => setSkuToVerify(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleVerifySku(skuToVerify)
                      }
                    }}
                    className="flex-1"
                  />
                  <Button onClick={() => handleVerifySku(skuToVerify)} disabled={verifying}>
                    {verifying ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Verificar
                      </>
                    )}
                  </Button>
                </div>

                {verificationResult && (
                  <div className="space-y-4 border-t pt-4">
                    <div
                      className={`p-4 rounded-lg border-2 ${
                        verificationResult.found
                          ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                          : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                      }`}
                    >
                      <p
                        className={`font-semibold ${
                          verificationResult.found
                            ? "text-green-800 dark:text-green-200"
                            : "text-red-800 dark:text-red-200"
                        }`}
                      >
                        {verificationResult.message}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total de productos en la base de datos: {verificationResult.totalProductsInDB}
                      </p>
                    </div>

                    {verificationResult.exactMatch && (
                      <div className="border rounded-lg p-4 bg-muted/30">
                        <h3 className="font-semibold mb-3">Información del Producto:</h3>
                        <div className="space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-muted-foreground">SKU:</span>
                              <p className="font-mono font-semibold">{verificationResult.exactMatch.sku}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Código Interno:</span>
                              <p className="font-mono">{verificationResult.exactMatch.internal_code || "N/A"}</p>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Título:</span>
                            <p className="font-medium">{verificationResult.exactMatch.title || "N/A"}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <span className="text-muted-foreground">Precio:</span>
                              <p className="font-mono">${verificationResult.exactMatch.price?.toFixed(2) || "N/A"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Stock:</span>
                              <p>{verificationResult.exactMatch.stock ?? "N/A"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Condición:</span>
                              <p>{verificationResult.exactMatch.condition || "N/A"}</p>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fuentes:</span>
                            {verificationResult.exactMatch.source &&
                            Array.isArray(verificationResult.exactMatch.source) &&
                            verificationResult.exactMatch.source.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {verificationResult.exactMatch.source.map((src: string, idx: number) => (
                                  <Badge key={idx} variant="secondary">
                                    {src}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm">Sin fuentes</p>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-muted-foreground">Creado:</span>
                              <p className="text-xs">
                                {verificationResult.exactMatch.created_at
                                  ? new Date(verificationResult.exactMatch.created_at).toLocaleString()
                                  : "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Actualizado:</span>
                              <p className="text-xs">
                                {verificationResult.exactMatch.updated_at
                                  ? new Date(verificationResult.exactMatch.updated_at).toLocaleString()
                                  : "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {verificationResult.similarMatches && verificationResult.similarMatches.length > 0 && (
                      <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950/20">
                        <h3 className="font-semibold mb-3 text-yellow-800 dark:text-yellow-200">
                          Productos con SKU Similar ({verificationResult.similarMatches.length}):
                        </h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {verificationResult.similarMatches.map((product: any, idx: number) => (
                            <div key={idx} className="border rounded p-2 bg-background">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="font-mono text-sm font-semibold">{product.sku}</p>
                                  <p className="text-xs text-muted-foreground truncate">{product.title}</p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSearchQuery(product.sku)
                                    setShowSkuVerifier(false)
                                    loadProducts()
                                  }}
                                >
                                  Ver
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSkuVerifier(false)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </div>
  )
}
