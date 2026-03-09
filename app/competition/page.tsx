"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface CompetitionBoost {
  type: string
  status: string // opportunity, active, not_available
  description?: string
}

interface CompetitionWinner {
  seller_id: string
  nickname: string
  price: number
  advantages: string[]
}

interface Product {
  id: string
  title: string
  price: string
  inventory: number
  status: string
  image?: string
  catalog_listing?: boolean
  listing_type_id?: string
  account_id?: string
  account_nickname?: string
  seller_sku?: string
  competition?: {
    status: string // winning, competing, losing, sharing_first_place, listed, penalized
    price_to_win: number | null
    visit_share: string
    winner_price?: number
    has_opportunities: boolean
    last_analyzed?: string
    boosts?: CompetitionBoost[]
    winner?: CompetitionWinner
  }
}

interface PagingInfo {
  total: number
  limit: number
  offset: number
}

export default function CompetitionPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [mlPaging, setMlPaging] = useState<PagingInfo>({ total: 0, limit: 50, offset: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [mlAccounts, setMlAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("all")
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [applyingBoost, setApplyingBoost] = useState<string | null>(null)
  const [priceUpdateValue, setPriceUpdateValue] = useState<{ [key: string]: string }>({})
  const [sortBy, setSortBy] = useState("sold_quantity_desc")

  const [filters, setFilters] = useState({
    status: "all",
    catalog_listing: "true",
    listing_type: "all",
    tags: "all",
    sub_status: "all",
    competition_status: "all", // winning, losing, sharing_first_place, listed
  })

  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState({
    price: "",
    available_quantity: "",
    title: "",
  })

  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [priceTrackings, setPriceTrackings] = useState<{ [key: string]: any }>({})
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [trackingProduct, setTrackingProduct] = useState<Product | null>(null)
  const [trackingForm, setTrackingForm] = useState({
    enabled:      false,
    min_price:    "",
    max_price:    "",
    target_price: "",
    strategy:     "win_buybox",
  })

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

  const filteredProducts = products.filter((product) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (query.startsWith("mla")) {
        return product.id.toLowerCase().includes(query)
      }
      return product.title.toLowerCase().includes(query)
    }
    return true
  })

  useEffect(() => {
    loadProducts()
  }, []) // Solo se ejecuta al montar el componente

  useEffect(() => {
    if (currentPage > 1 || selectedAccount !== "all" || sortBy !== "sold_quantity_desc") {
      loadProducts()
    }
  }, [currentPage, selectedAccount, sortBy])

  const loadProducts = async () => {
    console.log("[v0] loadProducts called")
    setLoading(true)
    try {
      const offset = (currentPage - 1) * 50
      const params = new URLSearchParams({
        limit: "50",
        offset: offset.toString(),
        sort: sortBy,
      })

      if (selectedAccount && selectedAccount !== "all") {
        params.append("account_id", selectedAccount)
      }

      if (filters.status && filters.status !== "all") params.append("status", filters.status)
      if (filters.catalog_listing && filters.catalog_listing !== "all")
        params.append("catalog_listing", filters.catalog_listing)
      if (filters.listing_type && filters.listing_type !== "all") params.append("listing_type", filters.listing_type)
      if (filters.tags && filters.tags !== "all") params.append("tags", filters.tags)
      if (filters.sub_status && filters.sub_status !== "all") params.append("sub_status", filters.sub_status)

      const url = `/api/ml/items?${params.toString()}`
      console.log("[v0] Fetching from:", url)

      const mlResponse = await fetch(url)
      console.log("[v0] Response status:", mlResponse.status)

      if (mlResponse.ok) {
        const mlData = await mlResponse.json()
        console.log("[v0] Received data:", mlData)

        if (mlData.paging) {
          setMlPaging(mlData.paging)
        }

        let formattedMLProducts: Product[] = mlData.products.map((p: any) => ({
          id: p.id,
          title: p.title,
          price: p.price?.toString() || "0",
          inventory: p.available_quantity || 0,
          status: p.status,
          image: p.thumbnail,
          catalog_listing: p.catalog_listing,
          listing_type_id: p.listing_type_id,
          account_id: p.account_id,
          account_nickname: p.account_nickname,
          seller_sku: p.seller_sku || p.seller_custom_field || p.variations?.[0]?.seller_custom_field || "N/A",
          competition: p.competition
            ? {
                status: p.competition.status,
                price_to_win: p.competition.price_to_win,
                visit_share: p.competition.visit_share,
                winner_price: p.competition.winner_price,
                has_opportunities: p.competition.boosts?.some((b: any) => b.status === "opportunity") || false,
                last_analyzed: p.competition.last_analyzed,
                boosts: p.competition.boosts,
                winner: p.competition.winner,
              }
            : undefined,
        }))

        if (filters.competition_status !== "all") {
          formattedMLProducts = formattedMLProducts.filter((p) => {
            if (!p.competition) return false
            return p.competition.status === filters.competition_status
          })
        }

        console.log("[v0] Setting", formattedMLProducts.length, "products")
        setProducts(formattedMLProducts)
      } else {
        console.error("[v0] Failed to fetch products:", mlResponse.status)
      }
    } catch (error) {
      console.error("[v0] Failed to load products:", error)
    }
    setLoading(false)
  }

  const loadPriceTrackings = async () => {
    try {
      // Carga en lotes de 20 para evitar N+1 requests
      const ids = filteredProducts.map((p) => p.id)
      const trackingsMap: { [key: string]: any } = {}

      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20)
        const promises = batch.map(async (id) => {
          const res = await fetch(`/api/competition/reprice-config?ml_item_id=${id}`)
          const d   = await res.json()
          return { id, config: d.config }
        })
        const results = await Promise.all(promises)
        results.forEach(({ id, config }) => {
          if (config) trackingsMap[id] = config
        })
      }

      setPriceTrackings(trackingsMap)
    } catch (error) {
      console.error("Error loading price trackings:", error)
    }
  }

  useEffect(() => {
    if (filteredProducts.length > 0) {
      loadPriceTrackings()
    }
  }, [filteredProducts])

  const analyzeCompetition = async (itemId: string) => {
    setAnalyzingId(itemId)
    try {
      const res = await fetch("/api/competition/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })
      const data = await res.json()

      if (data.success && data.competition) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === itemId
              ? {
                  ...p,
                  competition: {
                    status: data.competition.status,
                    price_to_win: data.competition.price_to_win,
                    visit_share: data.competition.visit_share,
                    winner_price: data.competition.winner_price,
                    has_opportunities: data.competition.boosts?.some((b: any) => b.status === "opportunity") || false,
                    last_analyzed: new Date().toISOString(),
                    boosts: data.competition.boosts,
                    winner: data.competition.winner,
                  },
                }
              : p,
          ),
        )
      } else {
        alert(`Error: ${data.error || "No se pudo analizar"}`)
      }
    } catch (error) {
      console.error("Error analyzing competition:", error)
      alert("Error al analizar competencia")
    } finally {
      setAnalyzingId(null)
    }
  }

  const analyzeAllVisible = async () => {
    for (const product of filteredProducts) {
      if (product.catalog_listing && product.status === "active") {
        await analyzeCompetition(product.id)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  const totalPages = Math.ceil(mlPaging.total / mlPaging.limit)

  const toggleRowExpansion = (productId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
      } else {
        newSet.add(productId)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)))
    }
  }

  const toggleSelectProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
      } else {
        newSet.add(productId)
      }
      return newSet
    })
  }

  const bulkUpdateToPriceToWin = async () => {
    if (selectedProducts.size === 0) {
      alert("Selecciona al menos un producto")
      return
    }

    const productsWithPriceToWin = Array.from(selectedProducts).filter((id) => {
      const product = products.find((p) => p.id === id)
      return product?.competition?.price_to_win !== null && product?.competition?.price_to_win !== undefined
    })

    if (productsWithPriceToWin.length === 0) {
      alert("Ninguno de los productos seleccionados tiene un precio para ganar disponible")
      return
    }

    const confirmed = confirm(
      `¿Estás seguro de actualizar ${productsWithPriceToWin.length} productos al precio para ganar?`,
    )
    if (!confirmed) return

    setBulkUpdating(true)
    try {
      const res = await fetch("/api/competition/bulk-update-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: productsWithPriceToWin }),
      })

      const data = await res.json()

      if (data.success) {
        alert(`Actualización completada:\n✓ Exitosos: ${data.summary.success}\n✗ Fallidos: ${data.summary.failed}`)
        setSelectedProducts(new Set())
        await loadProducts()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error("Error in bulk update:", error)
      alert("Error al actualizar precios masivamente")
    } finally {
      setBulkUpdating(false)
    }
  }

  const getCompetitionIcon = (status: string) => {
    switch (status) {
      case "winning":
        return "🏆"
      case "sharing_first_place":
        return "🤝"
      case "competing":
        return "⚔️"
      case "losing":
        return "❌"
      case "listed":
        return "📋"
      case "penalized":
        return "⚠️"
      default:
        return "❓"
    }
  }

  const getCompetitionStatusColor = (status: string) => {
    switch (status) {
      case "winning":
        return "bg-green-100 text-green-800 border-green-300"
      case "sharing_first_place":
        return "bg-blue-100 text-blue-800 border-blue-300"
      case "competing":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      case "losing":
        return "bg-red-100 text-red-800 border-red-300"
      case "listed":
        return "bg-gray-100 text-gray-800 border-gray-300"
      case "penalized":
        return "bg-orange-100 text-orange-800 border-orange-300"
      default:
        return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  const getCompetitionStatusText = (status: string) => {
    switch (status) {
      case "winning":
        return "Ganando"
      case "sharing_first_place":
        return "Compartiendo 1°"
      case "competing":
        return "Compitiendo"
      case "losing":
        return "Perdiendo"
      case "listed":
        return "Listado"
      case "penalized":
        return "Penalizado"
      default:
        return status
    }
  }

  const getCompetitionExplanation = (status: string) => {
    switch (status) {
      case "winning":
        return "Tu publicación aparece primero en la página del producto. ¡Excelente!"
      case "sharing_first_place":
        return "Compartes la primera posición con otros vendedores."
      case "competing":
        return "Estás compitiendo activamente por la primera posición."
      case "losing":
        return "Otra publicación aparece primero. Revisa las oportunidades para mejorar."
      case "listed":
        return "Tu publicación está en el catálogo pero no hay competencia activa."
      case "penalized":
        return "Tu publicación no puede competir debido a penalizaciones."
      default:
        return "Estado desconocido"
    }
  }

  const getBoostIcon = (type: string) => {
    switch (type) {
      case "free_shipping":
        return "🚚"
      case "installments":
        return "💳"
      case "same_day_shipping":
        return "⚡"
      case "full_shipping":
        return "📦"
      case "price":
        return "💰"
      default:
        return "✨"
    }
  }

  const getBoostText = (type: string) => {
    switch (type) {
      case "free_shipping":
        return "Envío Gratis"
      case "installments":
        return "Cuotas sin Interés"
      case "same_day_shipping":
        return "Envío el Mismo Día"
      case "full_shipping":
        return "Envío Full"
      case "price":
        return "Precio Competitivo"
      default:
        return type
    }
  }

  const applyPriceChange = async (itemId: string, newPrice: number) => {
    setApplyingBoost(`${itemId}-price`)
    try {
      const res = await fetch("/api/competition/apply-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          boost_type: "price",
          new_price: newPrice,
        }),
      })
      const data = await res.json()

      if (data.success) {
        alert("Precio actualizado exitosamente")
        await analyzeCompetition(itemId)
        await loadProducts()
      } else {
        alert(`Error: ${data.error || "No se pudo actualizar el precio"}`)
      }
    } catch (error) {
      console.error("Error applying price change:", error)
      alert("Error al actualizar precio")
    } finally {
      setApplyingBoost(null)
    }
  }

  const applyShippingBoost = async (itemId: string, boostType: string) => {
    setApplyingBoost(`${itemId}-${boostType}`)
    try {
      const res = await fetch("/api/competition/apply-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          boost_type: boostType,
        }),
      })
      const data = await res.json()

      if (data.success) {
        alert("Mejora aplicada exitosamente")
        await analyzeCompetition(itemId)
      } else {
        alert(`Error: ${data.error || "No se pudo aplicar la mejora"}`)
      }
    } catch (error) {
      console.error("Error applying boost:", error)
      alert("Error al aplicar mejora")
    } finally {
      setApplyingBoost(null)
    }
  }

  const openEditModal = (product: Product) => {
    setEditingProduct(product)
    setEditForm({
      price: product.price,
      available_quantity: product.inventory.toString(),
      title: product.title,
    })
  }

  const saveProductChanges = async () => {
    if (!editingProduct) return

    try {
      const requestBody: any = {
        item_id: editingProduct.id,
        price: Number.parseFloat(editForm.price),
        available_quantity: Number.parseInt(editForm.available_quantity),
      }

      if (!editingProduct.catalog_listing) {
        requestBody.title = editForm.title
      }

      console.log("[v0] Saving product changes:", requestBody)

      const res = await fetch("/api/ml/items/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      const data = await res.json()

      if (data.success) {
        if (data.warning) {
          alert(`Actualizado exitosamente. Nota: ${data.warning}`)
        } else {
          alert("Publicación actualizada exitosamente")
        }
        setEditingProduct(null)
        await loadProducts()
      } else {
        alert(`Error: ${data.error || "No se pudo actualizar"}`)
      }
    } catch (error) {
      console.error("Error updating product:", error)
      alert("Error al actualizar publicación")
    }
  }

  const openTrackingModal = (product: Product) => {
    setTrackingProduct(product)
    const cfg = priceTrackings[product.id]
    setTrackingForm({
      enabled:      cfg?.enabled      || false,
      min_price:    cfg?.min_price?.toString()    || product.price,
      max_price:    cfg?.max_price?.toString()    || "",
      target_price: cfg?.target_price?.toString() || "",
      strategy:     cfg?.strategy                 || "win_buybox",
    })
    setShowTrackingModal(true)
  }

  const saveTrackingConfig = async () => {
    if (!trackingProduct) return

    const minPrice = Number.parseFloat(trackingForm.min_price)
    if (isNaN(minPrice) || minPrice <= 0) {
      alert("El precio mínimo debe ser un número válido mayor a 0")
      return
    }

    const maxPrice  = trackingForm.max_price  ? Number.parseFloat(trackingForm.max_price)  : null
    const targetPrice = trackingForm.target_price ? Number.parseFloat(trackingForm.target_price) : null

    if (maxPrice !== null && maxPrice <= minPrice) {
      alert("El precio máximo debe ser mayor al precio mínimo")
      return
    }

    try {
      const res = await fetch("/api/competition/reprice-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ml_item_id:   trackingProduct.id,
          account_id:   trackingProduct.account_id,
          enabled:      trackingForm.enabled,
          min_price:    minPrice,
          max_price:    maxPrice,
          target_price: targetPrice,
          strategy:     trackingForm.strategy,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        alert(
          trackingForm.enabled
            ? "Repricing automático activado. El cron ajustará el precio según los 5 escenarios configurados."
            : "Repricing automático desactivado",
        )
        setShowTrackingModal(false)
        await loadPriceTrackings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error("Error saving tracking config:", error)
      alert("Error al guardar configuración")
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Análisis de Competencia</h2>
        <p className="text-muted-foreground">
          {mlPaging.total > 0
            ? `Total: ${mlPaging.total.toLocaleString()} publicaciones de catálogo`
            : "Analiza tu competencia en MercadoLibre"}
        </p>
      </div>

      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900">ℹ️ Guía de Estados de Competencia</h3>
            <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">🏆 Ganando:</span>
                <span className="text-gray-700">Tu publicación aparece primero en la página del producto</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">❌ Perdiendo:</span>
                <span className="text-gray-700">
                  Otra publicación aparece primero. Revisa las oportunidades de mejora
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">📋 Listado:</span>
                <span className="text-gray-700">Está en catálogo pero sin competencia activa</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-900">✨ Oportunidades:</span>
                <span className="text-gray-700">
                  Mejoras disponibles (envío gratis, cuotas, etc.) para ganar posición
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Agregando Filtros Avanzados */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros Avanzados</CardTitle>
          <CardDescription>Filtra tus publicaciones por estado, catálogo, competencia y más</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                  <SelectItem value="under_review">En Revisión</SelectItem>
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
                  <SelectItem value="true">Solo Catálogo</SelectItem>
                  <SelectItem value="false">No Catálogo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado de Competencia</Label>
              <Select
                value={filters.competition_status}
                onValueChange={(v) => setFilters({ ...filters, competition_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="winning">🏆 Ganando</SelectItem>
                  <SelectItem value="losing">❌ Perdiendo</SelectItem>
                  <SelectItem value="sharing_first_place">🤝 Compartiendo 1°</SelectItem>
                  <SelectItem value="listed">📋 Listado</SelectItem>
                  <SelectItem value="penalized">⚠️ Penalizado</SelectItem>
                </SelectContent>
              </Select>
              {filters.competition_status !== "all" && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                  ℹ️ Este filtro solo muestra productos que ya han sido analizados. Usa el botón "Analizar" para obtener
                  datos de competencia.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tipo de Publicación</Label>
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

            <div className="space-y-2">
              <Label>Elegibilidad</Label>
              <Select value={filters.tags} onValueChange={(v) => setFilters({ ...filters, tags: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="catalog_listing_eligible">Elegibles para Catálogo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado Detallado</Label>
              <Select value={filters.sub_status} onValueChange={(v) => setFilters({ ...filters, sub_status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="out_of_stock">Sin Stock (Por Pausar)</SelectItem>
                  <SelectItem value="warning">Con Advertencia</SelectItem>
                  <SelectItem value="waiting_for_patch">Esperando Corrección</SelectItem>
                  <SelectItem value="held">En Moderación</SelectItem>
                  <SelectItem value="pending_documentation">Documentación Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {filters.status !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Estado: {filters.status}
                <button
                  onClick={() => setFilters({ ...filters, status: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.catalog_listing !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Catálogo: {filters.catalog_listing === "true" ? "Sí" : "No"}
                <button
                  onClick={() => setFilters({ ...filters, catalog_listing: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.competition_status !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Competencia: {getCompetitionStatusText(filters.competition_status)}
                <button
                  onClick={() => setFilters({ ...filters, competition_status: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.tags !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Elegibles para Catálogo
                <button onClick={() => setFilters({ ...filters, tags: "all" })} className="ml-1 hover:text-destructive">
                  ×
                </button>
              </Badge>
            )}
            {filters.sub_status !== "all" && (
              <Badge variant="secondary" className="gap-1">
                Sub-estado: {filters.sub_status}
                <button
                  onClick={() => setFilters({ ...filters, sub_status: "all" })}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            )}
            {(filters.status !== "all" ||
              filters.catalog_listing !== "all" ||
              filters.competition_status !== "all" ||
              filters.tags !== "all" ||
              filters.sub_status !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({
                    status: "all",
                    catalog_listing: "true",
                    listing_type: "all",
                    tags: "all",
                    sub_status: "all",
                    competition_status: "all",
                  })
                }
              >
                Limpiar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <Input
            placeholder="Buscar por título o ID (MLA)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label>Ordenar por:</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sold_quantity_desc">Más Vendidos</SelectItem>
                <SelectItem value="sold_quantity_asc">Menos Vendidos</SelectItem>
                <SelectItem value="price_desc">Precio: Mayor a Menor</SelectItem>
                <SelectItem value="price_asc">Precio: Menor a Mayor</SelectItem>
                <SelectItem value="date_desc">Más Recientes</SelectItem>
                <SelectItem value="date_asc">Más Antiguos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Publicaciones con Análisis de Competencia</CardTitle>
              <CardDescription>
                {loading ? (
                  "Cargando..."
                ) : (
                  <>
                    Mostrando {filteredProducts.length} de {mlPaging.total.toLocaleString()} productos
                    {totalPages > 1 && ` (Página ${currentPage} de ${totalPages})`}
                  </>
                )}
                {selectedProducts.size > 0 && (
                  <span className="ml-2 text-blue-600 font-semibold">• {selectedProducts.size} seleccionados</span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {selectedProducts.size > 0 && (
                <Button
                  onClick={bulkUpdateToPriceToWin}
                  disabled={bulkUpdating}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {bulkUpdating ? "Actualizando..." : `Igualar Precio (${selectedProducts.size})`}
                </Button>
              )}
              <Button onClick={loadProducts} disabled={loading} variant="outline">
                Actualizar Lista
              </Button>
              <Button onClick={analyzeAllVisible} disabled={loading || analyzingId !== null}>
                Analizar Todos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[400px] items-center justify-center">Cargando productos...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center">No hay productos disponibles.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <input
                          type="checkbox"
                          checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Precio Actual</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Estado Competencia</TableHead>
                      <TableHead>Precio para Ganar</TableHead>
                      {/* Start of update */}
                      <TableHead>Mejor Precio Competidor</TableHead>
                      <TableHead>Vendedor Ganador</TableHead>
                      {/* End of update */}
                      <TableHead>Seguimiento Auto</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <>
                        <TableRow key={product.id} className="group">
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.id)}
                              onChange={() => toggleSelectProduct(product.id)}
                              className="h-4 w-4 cursor-pointer"
                            />
                          </TableCell>
                          <TableCell>
                            {product.competition && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleRowExpansion(product.id)}
                                className="h-8 w-8 p-0"
                              >
                                {expandedRows.has(product.id) ? "▼" : "▶"}
                              </Button>
                            )}
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
                              <div className="max-w-[300px]">
                                <p className="font-medium truncate">{product.title}</p>
                                <p className="text-xs text-muted-foreground">{product.id}</p>
                                {product.seller_sku && product.seller_sku !== "N/A" && (
                                  <p className="text-xs text-muted-foreground">SKU: {product.seller_sku}</p>
                                )}
                                <Badge variant="outline" className="mt-1">
                                  {product.account_nickname || "N/A"}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-lg">${product.price}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={product.inventory > 0 ? "default" : "secondary"}>{product.inventory}</Badge>
                          </TableCell>
                          <TableCell>
                            {product.competition ? (
                              <div className="space-y-1">
                                <Badge className={`${getCompetitionStatusColor(product.competition.status)} border`}>
                                  {getCompetitionIcon(product.competition.status)}{" "}
                                  {getCompetitionStatusText(product.competition.status)}
                                </Badge>
                                {product.competition.has_opportunities && (
                                  <Badge
                                    variant="outline"
                                    className="ml-1 text-xs bg-yellow-50 text-yellow-700 border-yellow-300"
                                  >
                                    ✨ Oportunidades
                                  </Badge>
                                )}
                                <div className="text-xs text-muted-foreground mt-1">
                                  Participación: <strong>{product.competition.visit_share}</strong>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No analizado</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.competition && product.competition.price_to_win !== null ? (
                              <div className="space-y-1">
                                <span className="font-semibold text-lg text-blue-600">
                                  ${product.competition.price_to_win.toFixed(2)}
                                </span>
                                {product.competition.winner_price && (
                                  <div className="text-xs text-muted-foreground">
                                    Ganador: ${product.competition.winner_price.toFixed(2)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          {/* Start of update */}
                          <TableCell>
                            {product.competition?.winner_price ? (
                              <div className="space-y-1">
                                <span className="font-semibold text-lg text-red-600">
                                  ${product.competition.winner_price.toFixed(2)}
                                </span>
                                {product.price && (
                                  <div className="text-xs text-muted-foreground">
                                    {Number.parseFloat(product.price) > product.competition.winner_price ? (
                                      <span className="text-red-600">
                                        +$
                                        {(Number.parseFloat(product.price) - product.competition.winner_price).toFixed(
                                          2,
                                        )}{" "}
                                        más caro
                                      </span>
                                    ) : Number.parseFloat(product.price) < product.competition.winner_price ? (
                                      <span className="text-green-600">
                                        -$
                                        {(product.competition.winner_price - Number.parseFloat(product.price)).toFixed(
                                          2,
                                        )}{" "}
                                        más barato
                                      </span>
                                    ) : (
                                      <span className="text-blue-600">Mismo precio</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.competition?.winner ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-xl">🏆</span>
                                  <span className="font-medium text-gray-900">
                                    {product.competition.winner.nickname}
                                  </span>
                                </div>
                                {product.competition.winner.advantages &&
                                  product.competition.winner.advantages.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {product.competition.winner.advantages.slice(0, 2).map((adv, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">
                                          {adv}
                                        </Badge>
                                      ))}
                                      {product.competition.winner.advantages.length > 2 && (
                                        <Badge variant="secondary" className="text-xs">
                                          +{product.competition.winner.advantages.length - 2}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          {/* End of update */}
                          <TableCell>
                            {priceTrackings[product.id] ? (
                              <div className="space-y-1">
                                <Badge className={priceTrackings[product.id].enabled
                                  ? "bg-green-100 text-green-800 border-green-300"
                                  : "bg-gray-100 text-gray-600 border-gray-300"
                                }>
                                  {priceTrackings[product.id].enabled ? "✓ Activo" : "Pausado"}
                                </Badge>
                                <div className="text-xs text-muted-foreground">
                                  Mín: ${priceTrackings[product.id].min_price}
                                  {priceTrackings[product.id].max_price && (
                                    <> · Máx: ${priceTrackings[product.id].max_price}</>
                                  )}
                                </div>
                                {priceTrackings[product.id].last_status && (
                                  <div className="text-xs text-muted-foreground">
                                    {priceTrackings[product.id].last_status}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-gray-500">
                                Sin config
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {product.catalog_listing && product.status === "active" ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => analyzeCompetition(product.id)}
                                    disabled={analyzingId === product.id}
                                  >
                                    {analyzingId === product.id ? "Analizando..." : "Analizar"}
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => openEditModal(product)}>
                                    Editar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openTrackingModal(product)}
                                    title="Configurar seguimiento automático"
                                  >
                                    ⚙️
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">No disponible</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {expandedRows.has(product.id) && product.competition && (
                          <TableRow>
                            {/* Start of update - Adjusted colspan from 10 to 11 */}
                            <TableCell colSpan={11} className="bg-gray-50 p-6">
                              {/* End of update */}
                              <div className="space-y-6">
                                {product.competition.status === "penalized" && (
                                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4">
                                    <h4 className="font-semibold text-lg flex items-center gap-2 text-red-800 mb-3">
                                      <span className="text-2xl">⚠️</span>
                                      Producto Penalizado - No Puede Competir
                                    </h4>
                                    <div className="space-y-3 text-sm">
                                      <p className="text-red-700">
                                        Tu publicación está penalizada y no puede competir en el catálogo. Esto
                                        significa que no aparecerá en la página del producto y tendrás menos
                                        visibilidad.
                                      </p>

                                      <div className="bg-white p-4 rounded border border-red-200">
                                        <p className="font-semibold text-red-800 mb-2">
                                          Razones comunes de penalización:
                                        </p>
                                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                                          <li>Fotos de baja calidad o que no cumplen con las políticas</li>
                                          <li>Descripción incompleta o con información incorrecta</li>
                                          <li>Atributos faltantes o incorrectos del catálogo</li>
                                          <li>Historial de reclamos o incumplimientos</li>
                                          <li>Precio muy por encima del mercado</li>
                                          <li>Problemas con entregas anteriores</li>
                                        </ul>
                                      </div>

                                      <div className="bg-white p-4 rounded border border-red-200">
                                        <p className="font-semibold text-red-800 mb-2">
                                          Cómo resolver la penalización:
                                        </p>
                                        <ol className="list-decimal list-inside space-y-2 text-gray-700">
                                          <li>
                                            <strong>Mejora las fotos:</strong> Usa imágenes de alta calidad, con fondo
                                            blanco, que muestren el producto claramente
                                          </li>
                                          <li>
                                            <strong>Completa todos los atributos:</strong> Asegúrate de que todos los
                                            campos requeridos del catálogo estén completos y correctos
                                          </li>
                                          <li>
                                            <strong>Revisa la descripción:</strong> Debe ser clara, completa y sin
                                            información engañosa
                                          </li>
                                          <li>
                                            <strong>Ajusta el precio:</strong> Verifica que tu precio sea competitivo y
                                            esté dentro del rango del mercado
                                          </li>
                                          <li>
                                            <strong>Resuelve reclamos pendientes:</strong> Si tienes reclamos abiertos,
                                            resuélvelos lo antes posible
                                          </li>
                                          <li>
                                            <strong>Contacta soporte:</strong> Si después de hacer mejoras la
                                            penalización persiste, contacta al soporte de MercadoLibre
                                          </li>
                                        </ol>
                                      </div>

                                      <div className="flex gap-2 pt-2">
                                        <Button
                                          size="sm"
                                          variant="default"
                                          asChild
                                          className="bg-red-600 hover:bg-red-700"
                                        >
                                          <a
                                            href={`https://www.mercadolibre.com.ar/publicaciones/${product.id}/modificar`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            Editar Publicación en ML
                                          </a>
                                        </Button>
                                        <Button size="sm" variant="outline" asChild>
                                          <a
                                            href="https://www.mercadolibre.com.ar/ayuda"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            Contactar Soporte
                                          </a>
                                        </Button>
                                      </div>

                                      <p className="text-xs text-red-600 italic">
                                        Nota: Las penalizaciones pueden tardar varios días en resolverse después de
                                        hacer las correcciones necesarias.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                <div className="grid md:grid-cols-2 gap-6">
                                  <div>
                                    <h4 className="font-semibold mb-3 text-lg flex items-center gap-2">
                                      <span className="text-2xl">{getCompetitionIcon(product.competition.status)}</span>
                                      Análisis Detallado
                                    </h4>
                                    <div className="bg-white p-4 rounded-lg border space-y-3">
                                      <p className="text-sm">{getCompetitionExplanation(product.competition.status)}</p>

                                      <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                                        <div>
                                          <p className="text-xs text-muted-foreground">Tu Precio</p>
                                          <p className="text-lg font-bold text-blue-600">${product.price}</p>
                                        </div>
                                        {product.competition.price_to_win !== null && (
                                          <div>
                                            <p className="text-xs text-muted-foreground">Precio para Ganar</p>
                                            <p className="text-lg font-bold text-green-600">
                                              ${product.competition.price_to_win.toFixed(2)}
                                            </p>
                                          </div>
                                        )}
                                      </div>

                                      <div className="pt-3 border-t">
                                        <p className="text-xs text-muted-foreground mb-1">Participación en Visitas</p>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                                            <div
                                              className="bg-blue-600 h-2 rounded-full transition-all"
                                              style={{ width: product.competition.visit_share }}
                                            />
                                          </div>
                                          <span className="text-sm font-semibold">
                                            {product.competition.visit_share}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {product.competition.winner && (
                                      <div className="bg-white p-4 rounded-lg border mt-4">
                                        <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                          <span className="text-xl">🏆</span>
                                          Ganador Actual
                                        </h5>
                                        <div className="space-y-2 text-sm">
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Vendedor:</span>
                                            <span className="font-medium">{product.competition.winner.nickname}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Precio:</span>
                                            <span className="font-bold text-green-600">
                                              ${product.competition.winner.price.toFixed(2)}
                                            </span>
                                          </div>
                                          {product.competition.winner.advantages &&
                                            product.competition.winner.advantages.length > 0 && (
                                              <div className="pt-2 border-t">
                                                <p className="text-muted-foreground mb-2">Sus Ventajas:</p>
                                                <div className="flex flex-wrap gap-1">
                                                  {product.competition.winner.advantages.map((adv, idx) => (
                                                    <Badge key={idx} variant="secondary" className="text-xs">
                                                      {adv}
                                                    </Badge>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <h4 className="font-semibold mb-3 text-lg flex items-center gap-2">
                                      <span className="text-2xl">✨</span>
                                      Oportunidades de Mejora
                                    </h4>

                                    {product.competition.boosts && product.competition.boosts.length > 0 ? (
                                      <div className="space-y-3">
                                        {product.competition.boosts
                                          .filter((boost) => boost.status === "opportunity")
                                          .map((boost, idx) => (
                                            <div
                                              key={idx}
                                              className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg border-2 border-amber-400 shadow-sm"
                                            >
                                              <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-2xl">{getBoostIcon(boost.type)}</span>
                                                  <div>
                                                    <p className="font-semibold text-gray-900">
                                                      {getBoostText(boost.type)}
                                                    </p>
                                                    {boost.description && (
                                                      <p className="text-sm text-gray-700 mt-1">{boost.description}</p>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>

                                              {boost.type === "price" && product.competition.price_to_win && (
                                                <div className="mt-3 pt-3 border-t border-amber-300">
                                                  <Label className="text-sm font-medium text-gray-900 mb-2 block">
                                                    Nuevo Precio Sugerido:
                                                  </Label>
                                                  <div className="flex gap-2">
                                                    <Input
                                                      type="number"
                                                      step="0.01"
                                                      placeholder={product.competition.price_to_win.toFixed(2)}
                                                      value={priceUpdateValue[product.id] || ""}
                                                      onChange={(e) =>
                                                        setPriceUpdateValue({
                                                          ...priceUpdateValue,
                                                          [product.id]: e.target.value,
                                                        })
                                                      }
                                                      className="flex-1"
                                                    />
                                                    <Button
                                                      size="sm"
                                                      onClick={() => {
                                                        const newPrice = Number.parseFloat(
                                                          priceUpdateValue[product.id] ||
                                                            product.competition!.price_to_win!.toString(),
                                                        )
                                                        if (newPrice > 0) {
                                                          applyPriceChange(product.id, newPrice)
                                                        }
                                                      }}
                                                      disabled={applyingBoost === `${product.id}-price`}
                                                      className="bg-green-600 hover:bg-green-700"
                                                    >
                                                      {applyingBoost === `${product.id}-price`
                                                        ? "Aplicando..."
                                                        : "Aplicar"}
                                                    </Button>
                                                  </div>
                                                </div>
                                              )}

                                              {boost.type === "free_shipping" && (
                                                <div className="mt-3 pt-3 border-t border-amber-300">
                                                  <Button
                                                    size="sm"
                                                    onClick={() => applyShippingBoost(product.id, "free_shipping")}
                                                    disabled={applyingBoost === `${product.id}-free_shipping`}
                                                    className="w-full bg-blue-600 hover:bg-blue-700"
                                                  >
                                                    {applyingBoost === `${product.id}-free_shipping`
                                                      ? "Activando..."
                                                      : "Activar Envío Gratis"}
                                                  </Button>
                                                  <p className="text-sm text-gray-600 mt-2">
                                                    Nota: Esto puede tener costos adicionales según tu configuración
                                                  </p>
                                                </div>
                                              )}

                                              {(boost.type === "installments" ||
                                                boost.type === "same_day_shipping" ||
                                                boost.type === "full_shipping") && (
                                                <div className="mt-3 pt-3 border-t border-amber-300">
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    asChild
                                                    className="w-full bg-transparent"
                                                  >
                                                    <a
                                                      href={`https://www.mercadolibre.com.ar/publicaciones/${product.id}/modificar`}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                    >
                                                      Configurar en MercadoLibre
                                                    </a>
                                                  </Button>
                                                  <p className="text-sm text-gray-600 mt-2">
                                                    Esta mejora requiere configuración manual
                                                  </p>
                                                </div>
                                              )}
                                            </div>
                                          ))}

                                        {product.competition.boosts.filter((b) => b.status === "opportunity").length ===
                                          0 && (
                                          <div className="bg-white p-6 rounded-lg border text-center">
                                            <p className="text-sm text-muted-foreground">
                                              No hay oportunidades disponibles en este momento.
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-2">
                                              ¡Sigue así! Tu publicación está optimizada.
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="bg-white p-6 rounded-lg border text-center">
                                        <p className="text-sm text-muted-foreground">
                                          No hay datos de oportunidades disponibles.
                                        </p>
                                      </div>
                                    )}

                                    {product.competition.boosts &&
                                      product.competition.boosts.filter((b) => b.status === "active").length > 0 && (
                                        <div className="mt-4">
                                          <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                            <span>✅</span>
                                            Ventajas Activas
                                          </h5>
                                          <div className="flex flex-wrap gap-2">
                                            {product.competition.boosts
                                              .filter((boost) => boost.status === "active")
                                              .map((boost, idx) => (
                                                <Badge
                                                  key={idx}
                                                  className="bg-green-100 text-green-800 border-green-300"
                                                >
                                                  {getBoostIcon(boost.type)} {getBoostText(boost.type)}
                                                </Badge>
                                              ))}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                </div>

                                <div className="flex gap-2 pt-4 border-t">
                                  <Button size="sm" variant="default" asChild>
                                    <a
                                      href={`https://www.mercadolibre.com.ar/p/${product.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Ver en MercadoLibre
                                    </a>
                                  </Button>
                                  <Button size="sm" variant="outline" asChild>
                                    <a
                                      href={`https://www.mercadolibre.com.ar/publicaciones/${product.id}/modificar`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Editar Publicación
                                    </a>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => analyzeCompetition(product.id)}
                                    disabled={analyzingId === product.id}
                                  >
                                    {analyzingId === product.id ? "Analizando..." : "Re-analizar"}
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between border-t pt-4">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {(currentPage - 1) * mlPaging.limit + 1} -{" "}
                    {Math.min(currentPage * mlPaging.limit, mlPaging.total)} de {mlPaging.total.toLocaleString()}{" "}
                    publicaciones
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || loading}
                    >
                      Anterior
                    </Button>
                    <span className="text-sm font-medium px-4">
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
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Editar Publicación</CardTitle>
              <CardDescription className="space-y-2">
                <div className="text-base font-mono">{editingProduct.id}</div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {editingProduct.catalog_listing && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-800">
                    ⚠️ Este producto está en catálogo. El título no se puede modificar.
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                <Label className="text-sm font-semibold text-blue-900 mb-2 block">SKU del Producto</Label>
                <div className="text-2xl font-bold text-blue-700">
                  {editingProduct.seller_sku && editingProduct.seller_sku !== "N/A"
                    ? editingProduct.seller_sku
                    : "Sin SKU asignado"}
                </div>
                <p className="text-xs text-blue-600 mt-1">El SKU no se puede modificar desde aquí</p>
              </div>

              {editingProduct.competition?.price_to_win && (
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <Label className="text-sm font-semibold text-green-900 mb-2 block">
                    💰 Precio Sugerido para Ganar
                  </Label>
                  <div className="text-3xl font-bold text-green-700">
                    ${editingProduct.competition.price_to_win.toFixed(2)}
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Este es el precio recomendado por MercadoLibre para ganar la competencia
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-price" className="text-base font-semibold">
                    Precio Actual
                  </Label>
                  <Input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    placeholder="0.00"
                    className="text-lg font-semibold"
                  />
                  {editingProduct.competition?.price_to_win && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditForm({
                          ...editForm,
                          price: editingProduct.competition!.price_to_win!.toFixed(2),
                        })
                      }
                      className="w-full text-xs"
                    >
                      Usar precio sugerido (${editingProduct.competition.price_to_win.toFixed(2)})
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-stock" className="text-base font-semibold">
                    Stock Disponible
                  </Label>
                  <Input
                    id="edit-stock"
                    type="number"
                    value={editForm.available_quantity}
                    onChange={(e) => setEditForm({ ...editForm, available_quantity: e.target.value })}
                    placeholder="0"
                    className="text-lg font-semibold"
                  />
                </div>
              </div>

              {editingProduct.image && (
                <div className="space-y-2">
                  <Label>Vista Previa</Label>
                  <img
                    src={editingProduct.image || "/placeholder.svg"}
                    alt={editingProduct.title}
                    className="w-full h-48 object-contain rounded border"
                  />
                </div>
              )}
            </CardContent>
            <div className="flex gap-2 p-6 border-t">
              <Button onClick={saveProductChanges} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Guardar Cambios
              </Button>
              <Button variant="outline" onClick={() => setEditingProduct(null)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showTrackingModal && trackingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Repricing Automático</CardTitle>
              <CardDescription>
                <div>{trackingProduct.title}</div>
                <div className="text-xs mt-1">ID: {trackingProduct.id}</div>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2">Cómo funciona el repricing</h4>
                <ul className="text-xs space-y-1 text-gray-700">
                  <li>• <strong>Con competidor:</strong> ajusta según la estrategia elegida, nunca debajo del mínimo</li>
                  <li>• <strong>Sin competidor / sin stock:</strong> sube al precio objetivo o máximo</li>
                  <li>• <strong>price_to_win &lt; mínimo:</strong> se queda en precio mínimo</li>
                  <li>• <strong>Sin datos de ML:</strong> no toca el precio</li>
                  <li>• <strong>Umbral:</strong> solo actúa si la diferencia es ≥ $1</li>
                </ul>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label className="text-base font-semibold">Activar Repricing Automático</Label>
                  <p className="text-sm text-muted-foreground">El cron ajustará el precio cada hora</p>
                </div>
                <input
                  type="checkbox"
                  checked={trackingForm.enabled}
                  onChange={(e) => setTrackingForm({ ...trackingForm, enabled: e.target.checked })}
                  className="h-6 w-6 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <Label>Estrategia de Repricing</Label>
                <Select
                  value={trackingForm.strategy}
                  onValueChange={(v) => setTrackingForm({ ...trackingForm, strategy: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="win_buybox">
                      🏆 Ganar Buybox — usar price_to_win de ML
                    </SelectItem>
                    <SelectItem value="follow_competitor">
                      🤝 Igualar Competidor — mismo precio que el ganador
                    </SelectItem>
                    <SelectItem value="maximize_margin_if_alone">
                      💰 Maximizar Margen — sube a precio máximo cuando estoy solo
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {trackingForm.strategy === "win_buybox" && "Usa el precio calculado por ML para ganar el buybox (puede ser ligeramente menor al competidor)"}
                  {trackingForm.strategy === "follow_competitor" && "Iguala el precio exacto del vendedor ganador actual, sin necesariamente ganar el buybox"}
                  {trackingForm.strategy === "maximize_margin_if_alone" && "Gana el buybox cuando hay competencia; sube directo al precio máximo cuando no hay competidores con stock"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="min-price">Precio Mínimo <span className="text-red-500">*</span></Label>
                <Input
                  id="min-price"
                  type="number"
                  step="0.01"
                  value={trackingForm.min_price}
                  onChange={(e) => setTrackingForm({ ...trackingForm, min_price: e.target.value })}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Piso de rentabilidad — nunca se bajará de este valor
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-price">Precio Máximo <span className="text-gray-400">(opcional)</span></Label>
                <Input
                  id="max-price"
                  type="number"
                  step="0.01"
                  value={trackingForm.max_price}
                  onChange={(e) => setTrackingForm({ ...trackingForm, max_price: e.target.value })}
                  placeholder="Dejar vacío para sin techo"
                />
                <p className="text-xs text-muted-foreground">
                  Techo — el precio no subirá más de este valor al seguir al competidor
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-price">Precio Objetivo <span className="text-gray-400">(opcional)</span></Label>
                <Input
                  id="target-price"
                  type="number"
                  step="0.01"
                  value={trackingForm.target_price}
                  onChange={(e) => setTrackingForm({ ...trackingForm, target_price: e.target.value })}
                  placeholder="Dejar vacío para usar precio máximo"
                />
                <p className="text-xs text-muted-foreground">
                  Precio al que sube cuando no hay competencia activa (escenarios 3 y 4)
                </p>
              </div>

              {trackingProduct.competition?.price_to_win && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Price to win actual:</span>
                    <span className="text-lg font-bold text-green-600">
                      ${trackingProduct.competition.price_to_win.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {priceTrackings[trackingProduct.id] && (
                <div className="text-xs text-muted-foreground space-y-1 bg-gray-50 rounded p-3">
                  {priceTrackings[trackingProduct.id].last_run_at && (
                    <div>
                      Última ejecución:{" "}
                      {new Date(priceTrackings[trackingProduct.id].last_run_at).toLocaleString()}
                    </div>
                  )}
                  {priceTrackings[trackingProduct.id].last_status && (
                    <div>
                      Último estado: <strong>{priceTrackings[trackingProduct.id].last_status}</strong>
                    </div>
                  )}
                  {priceTrackings[trackingProduct.id].last_our_price && (
                    <div>
                      Último precio nuestro: <strong>${priceTrackings[trackingProduct.id].last_our_price}</strong>
                    </div>
                  )}
                  {priceTrackings[trackingProduct.id].last_price_to_win && (
                    <div>
                      Último price_to_win: <strong>${priceTrackings[trackingProduct.id].last_price_to_win}</strong>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <div className="flex gap-2 p-6 border-t">
              <Button onClick={saveTrackingConfig} className="flex-1">
                Guardar Configuración
              </Button>
              <Button variant="outline" onClick={() => setShowTrackingModal(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
