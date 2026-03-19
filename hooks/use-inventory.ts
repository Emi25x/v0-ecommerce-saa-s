"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import type {
  Product,
  ImportSource,
  ImportProgress,
  ImportSummaryData,
  ValidationResults,
  DiagnosticsData,
  VerificationResult,
  SortOrder,
} from "@/components/inventory/types"
import { PRODUCTS_PER_PAGE } from "@/components/inventory/types"

export function useInventory() {
  // Products state
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [sortBy, setSortBy] = useState<string>("id")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Import state
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importSources, setImportSources] = useState<ImportSource[]>([])
  const [selectedSource, setSelectedSource] = useState("")
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    stage: "",
    message: "",
    show: false,
  })
  const [showImportSummary, setShowImportSummary] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummaryData | null>(null)

  // Schedule state
  const [scheduleFrequency, setScheduleFrequency] = useState<string>("once")
  const [scheduleTime, setScheduleTime] = useState<string>("00:00")
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState<number>(1)
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState<number>(1)
  const [scheduleTimezone, setScheduleTimezone] = useState<string>("America/Santiago")

  // Validation state
  const [validationResults, setValidationResults] = useState<ValidationResults | null>(null)
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [validating, setValidating] = useState(false)

  // Edit state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)

  // Details state
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null)

  // Diagnostics state
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [diagnosticsData, setDiagnosticsData] = useState<DiagnosticsData | null>(null)
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false)

  // SKU Verifier state
  const [showSkuVerifier, setShowSkuVerifier] = useState(false)
  const [skuToVerify, setSkuToVerify] = useState("")
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [verifying, setVerifying] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length === 0 || searchQuery.length >= 3) {
        setDebouncedSearch(searchQuery)
        setCurrentPage(1)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load data when filters change
  useEffect(() => {
    loadProducts()
    loadImportSources()
  }, [currentPage, sortBy, sortOrder, debouncedSearch])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    console.log(
      "Cargando productos - p\u00e1gina:",
      currentPage,
      "ordenar por:",
      sortBy,
      sortOrder,
      "b\u00fasqueda:",
      debouncedSearch,
    )

    try {
      const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""
      const response = await fetch(
        `/api/inventory/products?page=${currentPage}&limit=${PRODUCTS_PER_PAGE}&sortBy=${sortBy}&sortOrder=${sortOrder}${searchParam}`,
      )

      console.log("Respuesta recibida:", response.status, response.statusText)

      if (response.ok) {
        const data = await response.json()
        console.log("Datos recibidos:", {
          productos: data.products?.length || 0,
          total: data.total,
          página: data.page,
          totalPáginas: data.totalPages,
        })

        if (data.products && data.products.length > 0) {
          console.log("Primer producto:", data.products[0])
        }

        setProducts(data.products || [])
        setTotalProducts(data.total || 0)
        setTotalPages(data.totalPages || 1)

        if (data.products?.length === 0 && currentPage > 1) {
          setCurrentPage(1)
        }
      } else {
        const errorData = await response.json()
        console.error("Error al cargar productos:", errorData)
        if (errorData.timeout) {
          setErrorMessage(
            "La b\u00fasqueda tard\u00f3 demasiado tiempo. Intenta buscar por SKU/ISBN/EAN exacto o un t\u00e9rmino m\u00e1s espec\u00edfico.",
          )
        } else if (errorData.message) {
          setErrorMessage(errorData.message)
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
      console.error("Error en fetch:", error)
      setErrorMessage(`Error de conexi\u00f3n: ${error.message}`)
      toast({
        title: "Error",
        description: `Error al cargar productos: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [currentPage, sortBy, sortOrder, debouncedSearch])

  const loadImportSources = async () => {
    console.log("Cargando fuentes de importaci\u00f3n...")
    try {
      const response = await fetch("/api/import-sources")
      console.log("Respuesta fuentes:", response.status, response.statusText)

      if (response.ok) {
        const data = await response.json()
        console.log("Fuentes recibidas:", data)
        console.log("N\u00famero de fuentes:", Array.isArray(data) ? data.length : 0)
        setImportSources(Array.isArray(data) ? data : [])
      } else {
        const errorData = await response.json()
        console.error("Error al cargar fuentes:", errorData)
        toast({
          title: "Error",
          description: `No se pudieron cargar las fuentes de importaci\u00f3n: ${errorData.error || response.statusText}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error en fetch fuentes:", error)
      toast({
        title: "Error",
        description: "Error al cargar fuentes de importaci\u00f3n",
        variant: "destructive",
      })
    }
  }

  const handleSort = (column: string) => {
    if (column === "source") {
      toast({
        title: "Ordenamiento no disponible",
        description: "No se puede ordenar por fuente debido a que un producto puede tener m\u00faltiples fuentes",
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

  const handleImportFromSource = async () => {
    console.log("handleImportFromSource iniciado")
    console.log("selectedSource:", selectedSource)

    if (!selectedSource) {
      console.log("Error: No hay fuente seleccionada")
      toast({
        title: "Error",
        description: "Por favor selects una fuente de importaci\u00f3n",
        variant: "destructive",
      })
      return
    }

    console.log("Iniciando importaci\u00f3n directa...")
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
        offset: 0,
        schedule: {
          frequency: scheduleFrequency,
          time: scheduleTime,
          day_of_week: scheduleFrequency === "weekly" ? scheduleDayOfWeek : null,
          day_of_month: scheduleFrequency === "monthly" ? scheduleDayOfMonth : null,
          timezone: scheduleTimezone,
        },
      }

      console.log("Payload de importaci\u00f3n:", importPayload)
      console.log("Llamando a /api/inventory/import/csv")

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

      console.log("Respuesta importaci\u00f3n:", importResponse.status, importResponse.statusText)

      if (!importResponse.ok) {
        const errorData = await importResponse.json()
        console.error("Error en importaci\u00f3n:", errorData)
        throw new Error(errorData.error || "Error al importar productos")
      }

      setImportProgress({
        stage: "inserting",
        message: "Insertando productos en la base de datos...",
        show: true,
      })

      const result = await importResponse.json()
      console.log("Resultado de importaci\u00f3n:", result)

      setImportProgress({
        stage: "finalizing",
        message: "Finalizando importaci\u00f3n...",
        show: true,
      })

      await new Promise((resolve) => setTimeout(resolve, 500))

      setImportSummary(result.summary || result)
      setShowImportSummary(true)

      toast({
        title: "Importaci\u00f3n completada",
        description:
          scheduleFrequency !== "once"
            ? "Los productos se han importado y la programaci\u00f3n se ha configurado correctamente"
            : "Los productos se han importado correctamente",
      })

      loadProducts()
    } catch (error: any) {
      console.error("Error en importaci\u00f3n:", error)
      console.error("Stack trace:", error.stack)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      console.log("Finalizando importaci\u00f3n, limpiando estados")
      setImporting(false)
      setImportProgress({
        stage: "",
        message: "",
        show: false,
      })
    }
  }

  const handleEditProduct = (product: Product) => {
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

  const handleViewDetails = (product: Product) => {
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
        console.log("Resultado de verificaci\u00f3n:", result)

        toast({
          title: result.found ? "Producto encontrado" : "Producto no encontrado",
          description: result.message,
          variant: result.found ? "default" : "destructive",
        })
      } else {
        throw new Error("Error al verificar SKU")
      }
    } catch (error: any) {
      console.error("Error verificando SKU:", error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setVerifying(false)
    }
  }

  const confirmDelete = (product: Product) => {
    setDeletingProduct(product)
    setShowDeleteDialog(true)
  }

  return {
    // Products
    products,
    loading,
    searchQuery,
    setSearchQuery,
    debouncedSearch,
    selectedProducts,
    currentPage,
    setCurrentPage,
    totalProducts,
    totalPages,
    sortBy,
    sortOrder,
    errorMessage,
    loadProducts,

    // Import
    showImportDialog,
    setShowImportDialog,
    importSources,
    selectedSource,
    setSelectedSource,
    importing,
    importProgress,
    showImportSummary,
    setShowImportSummary,
    importSummary,
    handleImportFromSource,

    // Schedule
    scheduleFrequency,
    setScheduleFrequency,
    scheduleTime,
    setScheduleTime,
    scheduleDayOfWeek,
    setScheduleDayOfWeek,
    scheduleDayOfMonth,
    setScheduleDayOfMonth,
    scheduleTimezone,
    setScheduleTimezone,

    // Validation
    validationResults,
    showValidationDialog,
    setShowValidationDialog,
    validating,

    // Edit
    editingProduct,
    setEditingProduct,
    showEditDialog,
    setShowEditDialog,
    handleEditProduct,
    handleSaveEdit,

    // Delete
    showDeleteDialog,
    setShowDeleteDialog,
    deletingProduct,
    setDeletingProduct,
    handleDeleteProduct,
    confirmDelete,

    // Details
    showDetailsDialog,
    setShowDetailsDialog,
    detailsProduct,
    handleViewDetails,

    // Diagnostics
    showDiagnostics,
    setShowDiagnostics,
    diagnosticsData,
    loadingDiagnostics,
    handleOpenDiagnostics,

    // SKU Verifier
    showSkuVerifier,
    setShowSkuVerifier,
    skuToVerify,
    setSkuToVerify,
    verificationResult,
    verifying,
    handleVerifySku,

    // Sorting & Selection
    handleSort,
    toggleSelectAll,
    toggleSelectProduct,
  }
}

export type UseInventoryReturn = ReturnType<typeof useInventory>
