"use client"

import { useEffect, useState } from "react"
import type { Product, PagingInfo, Filters, EditForm, TrackingForm } from "@/components/competition/types"

export function useCompetition() {
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

  const [filters, setFilters] = useState<Filters>({
    status: "all",
    catalog_listing: "true",
    listing_type: "all",
    tags: "all",
    sub_status: "all",
    competition_status: "all",
  })

  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    price: "",
    available_quantity: "",
    title: "",
  })

  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [priceTrackings, setPriceTrackings] = useState<{ [key: string]: any }>({})
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [trackingProduct, setTrackingProduct] = useState<Product | null>(null)
  const [trackingForm, setTrackingForm] = useState<TrackingForm>({
    enabled: false,
    min_price: "",
    max_price: "",
    target_price: "",
    strategy: "win_buybox",
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
      const ids = filteredProducts.map((p) => p.id)
      const trackingsMap: { [key: string]: any } = {}

      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20)
        const promises = batch.map(async (id) => {
          const res = await fetch(`/api/competition/reprice-config?ml_item_id=${id}`)
          const d = await res.json()
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
      `\u00BFEst\u00E1s seguro de actualizar ${productsWithPriceToWin.length} productos al precio para ganar?`,
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
        alert(`Actualizaci\u00F3n completada:\n\u2713 Exitosos: ${data.summary.success}\n\u2717 Fallidos: ${data.summary.failed}`)
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
          alert("Publicaci\u00F3n actualizada exitosamente")
        }
        setEditingProduct(null)
        await loadProducts()
      } else {
        alert(`Error: ${data.error || "No se pudo actualizar"}`)
      }
    } catch (error) {
      console.error("Error updating product:", error)
      alert("Error al actualizar publicaci\u00F3n")
    }
  }

  const openTrackingModal = (product: Product) => {
    setTrackingProduct(product)
    const cfg = priceTrackings[product.id]
    setTrackingForm({
      enabled: cfg?.enabled || false,
      min_price: cfg?.min_price?.toString() || product.price,
      max_price: cfg?.max_price?.toString() || "",
      target_price: cfg?.target_price?.toString() || "",
      strategy: cfg?.strategy || "win_buybox",
    })
    setShowTrackingModal(true)
  }

  const saveTrackingConfig = async () => {
    if (!trackingProduct) return

    const minPrice = Number.parseFloat(trackingForm.min_price)
    if (isNaN(minPrice) || minPrice <= 0) {
      alert("El precio m\u00EDnimo debe ser un n\u00FAmero v\u00E1lido mayor a 0")
      return
    }

    const maxPrice = trackingForm.max_price ? Number.parseFloat(trackingForm.max_price) : null
    const targetPrice = trackingForm.target_price ? Number.parseFloat(trackingForm.target_price) : null

    if (maxPrice !== null && maxPrice <= minPrice) {
      alert("El precio m\u00E1ximo debe ser mayor al precio m\u00EDnimo")
      return
    }

    try {
      const res = await fetch("/api/competition/reprice-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ml_item_id: trackingProduct.id,
          account_id: trackingProduct.account_id,
          enabled: trackingForm.enabled,
          min_price: minPrice,
          max_price: maxPrice,
          target_price: targetPrice,
          strategy: trackingForm.strategy,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        alert(
          trackingForm.enabled
            ? "Repricing autom\u00E1tico activado. El cron ajustar\u00E1 el precio seg\u00FAn los 5 escenarios configurados."
            : "Repricing autom\u00E1tico desactivado",
        )
        setShowTrackingModal(false)
        await loadPriceTrackings()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error("Error saving tracking config:", error)
      alert("Error al guardar configuraci\u00F3n")
    }
  }

  return {
    // State
    products,
    loading,
    analyzingId,
    searchQuery,
    setSearchQuery,
    mlPaging,
    currentPage,
    setCurrentPage,
    mlAccounts,
    selectedAccount,
    setSelectedAccount,
    expandedRows,
    applyingBoost,
    priceUpdateValue,
    setPriceUpdateValue,
    sortBy,
    setSortBy,
    filters,
    setFilters,
    editingProduct,
    setEditingProduct,
    editForm,
    setEditForm,
    selectedProducts,
    bulkUpdating,
    priceTrackings,
    showTrackingModal,
    setShowTrackingModal,
    trackingProduct,
    trackingForm,
    setTrackingForm,

    // Computed
    filteredProducts,
    totalPages,

    // Actions
    loadProducts,
    analyzeCompetition,
    analyzeAllVisible,
    toggleRowExpansion,
    toggleSelectAll,
    toggleSelectProduct,
    bulkUpdateToPriceToWin,
    applyPriceChange,
    applyShippingBoost,
    openEditModal,
    saveProductChanges,
    openTrackingModal,
    saveTrackingConfig,
  }
}
