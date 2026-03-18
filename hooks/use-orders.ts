"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useToast } from "@/components/ui/use-toast"
import type {
  Order,
  PagingInfo,
  Column,
  SortConfig,
  MlAccount,
  MlBrowserModal,
  ConfirmMarkReceived,
  OrderFiltersState,
  GeneralStatusCounts,
  AvailabilityCounts,
  ReturnDetails,
} from "@/components/orders/types"
import {
  getOrderAvailabilityStatus,
  hasHandlingTime,
  hasActiveClaim,
  getRemainingDays,
  DEFAULT_COLUMNS,
} from "@/components/orders/types"

export function useOrders() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState<PagingInfo>({ total: 0, limit: 50, offset: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [completeOrderDetails, setCompleteOrderDetails] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")

  const [mlAccounts, setMlAccounts] = useState<Record<string, MlAccount>>({})

  const [selectedAccount, setSelectedAccount] = useState<string>("all")

  const [filters, setFilters] = useState<OrderFiltersState>({
    status: "all",
    date_from: "",
    date_to: "",
    generalStatus: "all",
    account: "all",
    availability: "all",
    timeFilter: "1month",
  })

  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)

  const [copiedSku, setCopiedSku] = useState<string | null>(null)
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)

  const [loadingSkus, setLoadingSkus] = useState<Set<string>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [markingReceived, setMarkingReceived] = useState<Set<string>>(new Set())

  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [bulkMarkingReceived, setBulkMarkingReceived] = useState(false)

  const [confirmMarkReceived, setConfirmMarkReceived] = useState<ConfirmMarkReceived | null>(null)

  const [loadingShipmentStatuses, setLoadingShipmentStatuses] = useState<Set<number>>(new Set())

  const [visibleColumns, setVisibleColumns] = useState<Column[]>(DEFAULT_COLUMNS)

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "date", direction: "desc" })

  const [returnDetailsOpen, setReturnDetailsOpen] = useState(false)
  const [returnDetails, setReturnDetails] = useState<ReturnDetails | null>(null)
  const [loadingReturnDetails, setLoadingReturnDetails] = useState(false)

  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [selectedReturnOrder, setSelectedReturnOrder] = useState<Order | null>(null)

  const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState<number | null>(null)
  const [showDeliveryConfirmDialog, setShowDeliveryConfirmDialog] = useState(false)
  const [isMarkingDelivered, setIsMarkingDelivered] = useState(false)

  const [mlBrowserModal, setMlBrowserModal] = useState<MlBrowserModal | null>(null)

  const [orders, setOrders] = useState<Order[]>([])
  const [totalOrders, setTotalOrders] = useState(0)

  // --- Data fetching ---

  const syncOrders = async () => {
    try {
      const response = await fetch("/api/mercadolibre/sync-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: selectedAccount !== "all" ? selectedAccount : undefined }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to sync orders")
      }
      toast({ title: "Sincronizacion iniciada", description: "Las ordenes se actualizaran pronto." })
    } catch (error: any) {
      console.error("Error syncing orders:", error)
      toast({
        title: "Error de sincronizacion",
        description: error.message || "No se pudo iniciar la sincronizacion de ordenes.",
        variant: "destructive",
      })
    }
  }

  const fetchOrders = async () => {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (selectedAccount && selectedAccount !== "all") {
        params.append("account_id", selectedAccount)
      }

      const response = await fetch(`/api/mercadolibre/orders?${params.toString()}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch orders")
      }

      const ordersWithAccount = data.orders.map((order: any) => {
        const sellerId = order.seller?.id
        const accountInfo = sellerId ? mlAccounts[sellerId] : null

        return {
          ...order,
          _account: accountInfo
            ? {
                id: sellerId,
                nickname: accountInfo.nickname,
              }
            : undefined,
        }
      })

      setOrders(ordersWithAccount)
      setPaging(data.paging)
    } catch (error: any) {
      console.error("[v0] Error fetching orders:", error)
      setError(error.message || "Failed to fetch orders")
    } finally {
      setLoading(false)
    }
  }

  const fetchOrdersEffect = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/mercadolibre/orders?account_id=${selectedAccount}`)
      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Orders API error in effect:", response.status, errorText)
        throw new Error(`Failed to fetch orders: ${response.statusText}`)
      }

      const data = await response.json()

      const ordersWithAccount = (data.orders || []).map((order: Order) => {
        const sellerId = order.seller?.id
        const accountInfo = sellerId && mlAccounts[sellerId]

        return {
          ...order,
          _account: accountInfo
            ? {
                id: sellerId,
                nickname: accountInfo.nickname,
              }
            : undefined,
        }
      })

      setOrders(ordersWithAccount)
      setTotalOrders(data.paging?.total || ordersWithAccount.length)
      loadSkusProgressively(ordersWithAccount)
      loadShipmentStatusesProgressively(ordersWithAccount)
    } catch (error: any) {
      console.error("Error fetching orders in effect:", error)
      setError(`Error al cargar ordenes: ${error.message}`)
      setOrders([])
      setTotalOrders(0)
    } finally {
      setLoading(false)
    }
  }

  const fetchMlAccounts = async () => {
    try {
      console.log("[v0] Fetching ML accounts from DB (no ML API calls)...")
      const response = await fetch("/api/mercadolibre/accounts")

      if (!response.ok) {
        console.warn("[v0] Failed to fetch accounts, will use empty list")
        setMlAccounts({})
        return
      }

      const data = await response.json()
      console.log("[v0] ML accounts response:", data)

      const accountsRecord: Record<string, MlAccount> = {}
      data.accounts?.forEach((account: any) => {
        let browserPreference = null
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem(`ml_browser_${account.id}`)
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              browserPreference = parsed.label || parsed.value
            } catch (e) {
              console.error("[v0] Failed to parse browser preference:", e)
            }
          }
        }

        accountsRecord[account.ml_user_id] = {
          id: account.id,
          nickname: account.nickname,
          browser_preference: browserPreference,
        }
      })

      console.log("[v0] ML accounts indexed by ml_user_id:", accountsRecord)
      setMlAccounts(accountsRecord)
    } catch (error) {
      console.error("[v0] Failed to fetch ML accounts:", error)
      setMlAccounts({})
    }
  }

  // --- Effects ---

  useEffect(() => {
    const initializeData = async () => {
      await fetchMlAccounts()
      setTimeout(() => {
        if (selectedAccount) {
          fetchOrdersEffect()
        }
      }, 100)
    }

    initializeData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Object.keys(mlAccounts).length === 0) {
      return
    }

    if (selectedAccount) {
      fetchOrdersEffect()
    }
  }, [selectedAccount]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("orders-columns")
      if (saved) {
        try {
          setVisibleColumns(JSON.parse(saved))
        } catch (e) {
          console.error("Failed to parse saved columns:", e)
        }
      }
    }
  }, [])

  const filterByTimeRange = useCallback(
    (order: Order) => {
      if (filters.timeFilter === "all") return true

      const now = new Date()
      const orderDate = new Date(order.date_created)
      const dateFrom = new Date(now)

      switch (filters.timeFilter) {
        case "1month":
          dateFrom.setDate(now.getDate() - 30)
          break
        case "2months":
          dateFrom.setDate(now.getDate() - 60)
          break
        case "6months":
          dateFrom.setDate(now.getDate() - 180)
          break
      }

      return orderDate >= dateFrom
    },
    [filters.timeFilter],
  )

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/mercadolibre/orders?limit=${paging.limit}&offset=${paging.offset}&account_id=${selectedAccount}`,
      )
      if (!response.ok) {
        throw new Error("Error al cargar las ordenes")
      }
      const data = await response.json()

      setOrders(data.orders || [])
      setPaging(data.paging || { total: 0, limit: paging.limit, offset: paging.offset })
    } catch (err: any) {
      console.error("Error al cargar ordenes:", err)
      setError(err instanceof Error ? err.message : "Error desconocido")
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [paging.limit, paging.offset, selectedAccount])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // --- Progressive loaders ---

  async function loadSkusProgressively(ordersToProcess: Order[]) {
    const itemIds = new Set<string>()
    ordersToProcess.forEach((order) => {
      order.order_items.forEach((item) => {
        if (!item.item.seller_sku) {
          itemIds.add(item.item.id)
        }
      })
    })

    const itemIdsArray = Array.from(itemIds)
    const batchSize = 1
    const delayBetweenBatches = 6000

    for (let i = 0; i < itemIdsArray.length; i += batchSize) {
      const batch = itemIdsArray.slice(i, i + batchSize)

      setLoadingSkus((prev) => new Set([...prev, ...batch]))

      await Promise.all(
        batch.map(async (itemId) => {
          try {
            const response = await fetch(`/api/ml/items/${itemId}`)
            if (response.ok) {
              const data = await response.json()

              setOrders((prevOrders) =>
                prevOrders.map((order) => ({
                  ...order,
                  order_items: order.order_items.map((item) =>
                    item.item.id === itemId ? { ...item, item: { ...item.item, seller_sku: data.seller_sku } } : item,
                  ),
                })),
              )
            } else {
              console.error(`[v0] Error loading SKU for ${itemId}: ${response.status}`)
            }
          } catch (error) {
            console.error(`[v0] Error loading SKU for ${itemId}:`, error)
          } finally {
            setLoadingSkus((prev) => {
              const newSet = new Set(prev)
              newSet.delete(itemId)
              return newSet
            })
          }
        }),
      )

      if (i + batchSize < itemIdsArray.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
      }
    }
  }

  async function loadShipmentStatusesProgressively(ordersToProcess: Order[]) {
    const ordersWithShipping = ordersToProcess.filter((order) => order.shipping?.id)
    const batchSize = 1
    const delayBetweenBatches = 6000

    for (let i = 0; i < ordersWithShipping.length; i += batchSize) {
      const batch = ordersWithShipping.slice(i, i + batchSize)

      const shipmentIds = batch.map((order) => order.shipping!.id)
      setLoadingShipmentStatuses((prev) => new Set([...prev, ...shipmentIds]))

      await Promise.all(
        batch.map(async (order) => {
          try {
            const shipmentId = order.shipping!.id
            const response = await fetch(`/api/ml/shipments/${shipmentId}`)

            if (response.ok) {
              const data = await response.json()

              setOrders((prevOrders) =>
                prevOrders.map((o) =>
                  o.id === order.id
                    ? {
                        ...o,
                        shipping: {
                          ...o.shipping!,
                          status: data.status,
                          substatus: data.substatus,
                        },
                      }
                    : o,
                ),
              )
            } else {
              console.error(`[v0] Error loading shipment status for order ${order.id}: ${response.status}`)
            }
          } catch (error) {
            console.error(`[v0] Error loading shipment status for order ${order.id}:`, error)
          } finally {
            setLoadingShipmentStatuses((prev) => {
              const newSet = new Set(prev)
              newSet.delete(order.shipping!.id)
              return newSet
            })
          }
        }),
      )

      if (i + batchSize < ordersWithShipping.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
      }
    }
  }

  // --- Actions ---

  function viewOrderDetails(order: Order) {
    setSelectedOrder(order)
    setShowOrderDetails(true)
    setCompleteOrderDetails({
      order: order,
      billingInfo: null,
      shipmentDetails: null,
      messages: [],
    })
  }

  const copySku = async (sku: string) => {
    try {
      await navigator.clipboard.writeText(sku)
      setCopiedSku(sku)
      setTimeout(() => setCopiedSku(null), 2000)
    } catch (error) {
      console.error("Failed to copy SKU:", error)
    }
  }

  const copyOrderId = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId)
      setCopiedOrderId(orderId)
      setTimeout(() => setCopiedOrderId(null), 2000)
    } catch (error) {
      console.error("Failed to copy order ID:", error)
    }
  }

  const handleSortChange = (key: string, direction: "asc" | "desc") => {
    setSortConfig({ key, direction })
  }

  const markProductAsReceived = async (orderId: number, itemId: string) => {
    try {
      setMarkingReceived((prev) => new Set([...prev, itemId]))

      const response = await fetch(`/api/mercadolibre/orders/${orderId}/mark-received`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })

      if (response.ok) {
        toast({ title: "Producto marcado como recibido", description: "La etiqueta estara disponible en breve." })
        await loadOrders()
      } else {
        const error = await response.json()
        toast({
          title: "Error al marcar recibido",
          description: error.details || "No se pudo marcar el producto como recibido.",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Error marking product as received:", error)
      toast({
        title: "Error",
        description: `No se pudo marcar el producto como recibido: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setMarkingReceived((prev) => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }

  const showMarkReceivedConfirmation = (orderId: number, itemId: string) => {
    const order = orders.find((o) => o.id === orderId)
    setConfirmMarkReceived({ orderId, itemId, orderDetails: order || null })
  }

  const confirmAndMarkReceived = async () => {
    if (!confirmMarkReceived) return
    const { orderId, itemId } = confirmMarkReceived
    setConfirmMarkReceived(null)
    await markProductAsReceived(orderId, itemId)
  }

  const markBulkProductsAsReceived = async () => {
    if (selectedOrders.size === 0) {
      toast({ title: "Seleccion vacia", description: "Por favor selecciona al menos una orden." })
      return
    }

    if (!confirm(`Marcar ${selectedOrders.size} ordenes como recibidas?`)) {
      return
    }

    try {
      setBulkMarkingReceived(true)
      const ordersToMark = Array.from(selectedOrders)

      for (const orderId of ordersToMark) {
        const order = orders.find((o) => o.id === orderId)
        if (order && order.order_items.length > 0) {
          try {
            const response = await fetch(`/api/mercadolibre/orders/${orderId}/mark-received`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item_id: order.order_items[0].item.id }),
            })

            if (!response.ok) {
              console.error(`Error marking order ${orderId} as received`)
            }
          } catch (error) {
            console.error(`Error marking order ${orderId}:`, error)
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      toast({ title: "Ordenes marcadas", description: `${selectedOrders.size} ordenes marcadas como recibidas.` })
      setSelectedOrders(new Set())
      await loadOrders()
    } catch (error: any) {
      console.error("Error in bulk mark as received:", error)
      toast({
        title: "Error",
        description: `Error al marcar ordenes como recibidas: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setBulkMarkingReceived(false)
    }
  }

  async function fetchReturnDetails(claimId: number) {
    setLoadingReturnDetails(true)
    try {
      const response = await fetch(`/api/mercadolibre/returns/${claimId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch return details")
      }
      const data = await response.json()
      setReturnDetails(data)
      setReturnDetailsOpen(true)
    } catch (error: any) {
      console.error("Error fetching return details:", error)
      toast({
        title: "Error",
        description: `No se pudieron cargar los detalles de la devolucion: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setLoadingReturnDetails(false)
    }
  }

  const showMarkDeliveredConfirmation = (orderId: number) => {
    setSelectedOrderForDelivery(orderId)
    setShowDeliveryConfirmDialog(true)
  }

  const handleMarkAsDelivered = async () => {
    if (!selectedOrderForDelivery) return

    try {
      setIsMarkingDelivered(true)

      const response = await fetch(`/api/mercadolibre/orders/${selectedOrderForDelivery}/deliver`, {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || "Error al marcar como entregado")
      }

      toast({
        title: "Orden marcada como entregada",
        description: "La orden ha sido marcada como entregada exitosamente.",
      })

      await loadOrders()
    } catch (error: any) {
      console.error("Error marking as delivered:", error)
      toast({
        title: "Error",
        description: `No se pudo marcar la orden como entregada: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setIsMarkingDelivered(false)
      setShowDeliveryConfirmDialog(false)
      setSelectedOrderForDelivery(null)
    }
  }

  const openMLOrder = (order: any) => {
    const mlUrl = `https://www.mercadolibre.com.ar/ventas/${order.id}/detalle`

    const accountInfo = mlAccounts[order.seller?.id] || {
      nickname: "Cuenta de MercadoLibre",
      browser_preference: null,
    }

    setMlBrowserModal({
      open: true,
      orderId: order.id,
      accountNickname: accountInfo.nickname,
      browserPreference: accountInfo.browser_preference,
      url: mlUrl,
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    const button = document.activeElement as HTMLButtonElement
    if (button) {
      const originalText = button.textContent
      button.textContent = "!Copiado!"
      setTimeout(() => {
        button.textContent = originalText
      }, 2000)
    }
  }

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set())
    } else {
      const newSelected = new Set<number>()
      filteredOrders.forEach((order) => newSelected.add(order.id))
      setSelectedOrders(newSelected)
    }
  }

  const toggleOrderSelection = (orderId: number) => {
    setSelectedOrders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(orderId)) {
        newSet.delete(orderId)
      } else {
        newSet.add(orderId)
      }
      return newSet
    })
  }

  // --- Computed / memos ---

  const filteredOrders = useMemo(() => {
    let filtered = orders

    filtered = filtered.filter(filterByTimeRange)

    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim()

      filtered = filtered.filter((order) => {
        const matchesOrderId = order.id.toString().includes(query)
        const matchesPackId = order.pack_id?.toString().includes(query)
        const matchesNickname = order.buyer?.nickname?.toLowerCase().includes(query)
        const matchesTitle = order.order_items?.some((item: any) => item.item?.title?.toLowerCase().includes(query))
        const matchesSku = order.order_items?.some(
          (item: any) =>
            item.item?.seller_sku?.toLowerCase().includes(query) ||
            (item.item?.seller_sku === undefined && item.item?.id?.toLowerCase().includes(query)),
        )

        return matchesOrderId || matchesPackId || matchesNickname || matchesTitle || matchesSku
      })

      return filtered
    }

    if (filters.generalStatus !== "all") {
      filtered = filtered.filter((order) => {
        const orderStatus = getOrderAvailabilityStatus(order)

        switch (filters.generalStatus) {
          case "delivered":
            return orderStatus === "Entregado"
          case "in_transit":
            return orderStatus === "En camino"
          case "delayed":
            return orderStatus === "Demorado"
          case "waiting":
            return orderStatus === "Esperando disponibilidad"
          case "ready":
            return (
              orderStatus === "Listo para enviar" ||
              orderStatus === "Etiqueta impresa" ||
              orderStatus === "En punto de retiro"
            )
          case "toAgree":
            return orderStatus === "Acordar la entrega"
          case "cancelled":
            return orderStatus === "Cancelado"
          case "con_reclamo":
            return orderStatus === "Con reclamo"
          case "pending":
            return orderStatus === "Pendiente"
          case "pending_payment":
            return orderStatus === "Pendiente de pago"
          case "delivery_issues":
            return orderStatus === "Problema de entrega"
          case "returned":
            return orderStatus === "Devolucion"
          default:
            return true
        }
      })
    }

    if (filters.availability !== "all") {
      filtered = filtered.filter((order) => {
        if (filters.availability === "today") {
          const orderStatus = getOrderAvailabilityStatus(order)
          return orderStatus === "Listo para enviar" || orderStatus === "Etiqueta impresa"
        }

        if (!hasHandlingTime(order)) {
          return false
        }

        const orderStatus = getOrderAvailabilityStatus(order)
        const requiresAvailability =
          orderStatus === "Pendiente" ||
          orderStatus === "Esperando disponibilidad" ||
          orderStatus === "Demorado" ||
          orderStatus === "Etiqueta impresa" ||
          orderStatus === "Listo para enviar"

        if (!requiresAvailability) {
          return false
        }

        const days = getRemainingDays(order)
        if (days === null) {
          return false
        }

        switch (filters.availability) {
          case "pendientes":
            return true
          case "twentyFourHours":
            return days === 1
          case "fortyEightHours":
            return days === 2
          case "lastWeek":
            return days >= 3 && days <= 7
          case "rest":
            return days > 7
          default:
            return true
        }
      })
    }

    if (filters.account !== "all") {
      filtered = filtered.filter((order) => order._account?.id === filters.account)
    }

    if (filters.date_from) {
      const dateFrom = new Date(filters.date_from)
      filtered = filtered.filter((order) => new Date(order.date_created) >= dateFrom)
    }
    if (filters.date_to) {
      const dateTo = new Date(filters.date_to)
      dateTo.setDate(dateTo.getDate() + 1)
      filtered = filtered.filter((order) => new Date(order.date_created) < dateTo)
    }

    return filtered
  }, [orders, filters, searchQuery, filterByTimeRange])

  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders]

    if (!sortConfig) {
      return sorted
    }

    sorted.sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortConfig.key) {
        case "date":
          aValue = new Date(a.date_created).getTime()
          bValue = new Date(b.date_created).getTime()
          break
        case "total":
          aValue = a.total_amount
          bValue = b.total_amount
          break
        case "order":
          aValue = a.id
          bValue = b.id
          break
        case "customer":
          aValue = a.buyer?.nickname?.toLowerCase() || ""
          bValue = b.buyer?.nickname?.toLowerCase() || ""
          break
        default:
          return 0
      }

      if (aValue < bValue) {
        return sortConfig.direction === "asc" ? -1 : 1
      }
      if (aValue > bValue) {
        return sortConfig.direction === "asc" ? 1 : -1
      }
      return 0
    })

    return sorted
  }, [filteredOrders, sortConfig])

  const totalPages = Math.max(1, Math.ceil(totalOrders / paging.limit))
  const startIndex = (currentPage - 1) * paging.limit
  const endIndex = startIndex + paging.limit
  const paginatedOrders = sortedOrders.slice(startIndex, endIndex)

  const timeFilteredOrders = orders.filter(filterByTimeRange)

  const generalStatusCounts = useMemo<GeneralStatusCounts>(() => {
    const ordersForCounting = orders.filter((order) => {
      if (!filterByTimeRange(order)) {
        return false
      }

      if (filters.account !== "all" && order._account?.id !== filters.account) {
        return false
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesId = order.id.toString().includes(query)
        const matchesPackId = order.pack_id?.toString().includes(query)
        const matchesNickname = order.buyer?.nickname?.toLowerCase().includes(query)
        const matchesTitle = order.order_items?.some((item: any) => item.item?.title?.toLowerCase().includes(query))
        const matchesSku = order.order_items?.some((item: any) => item.item?.seller_sku?.toLowerCase().includes(query))

        if (!matchesId && !matchesPackId && !matchesNickname && !matchesTitle && !matchesSku) {
          return false
        }
      }

      return true
    })

    const counts: GeneralStatusCounts = {
      all: 0,
      delivered: 0,
      toAgree: 0,
      cancelled: 0,
      waiting: 0,
      withClaim: 0,
      returned: 0,
      in_transit: 0,
      delayed: 0,
      ready: 0,
      pending_payment: 0,
      delivery_issues: 0,
      pending: 0,
    }

    for (const order of ordersForCounting) {
      counts.all++
      const status = getOrderAvailabilityStatus(order)

      if (status === "Entregado") {
        counts.delivered++
      } else if (status === "Acordar la entrega") {
        counts.toAgree++
      } else if (status === "Devolucion") {
        counts.returned++
      } else if (status === "Cancelado") {
        counts.cancelled++
      } else if (status === "Esperando disponibilidad") {
        counts.waiting++
      } else if (status === "Con reclamo") {
        counts.withClaim++
      } else if (status === "En camino") {
        counts.in_transit++
      } else if (status === "Demorado") {
        counts.delayed++
      } else if (status === "Listo para enviar" || status === "Etiqueta impresa" || status === "En punto de retiro") {
        counts.ready++
      } else if (status === "Pendiente de pago") {
        counts.pending_payment++
      } else if (status === "Problema de entrega") {
        counts.delivery_issues++
      } else if (status === "Pendiente") {
        counts.pending++
      }
    }

    return counts
  }, [orders, filters.timeFilter, searchQuery, filters.account, filterByTimeRange])

  const ordersWithHandlingTime = useMemo(() => {
    return orders.filter((order) => filterByTimeRange(order) && hasHandlingTime(order))
  }, [orders, filterByTimeRange])

  const availabilityCounts = useMemo<AvailabilityCounts>(() => {
    const counts: AvailabilityCounts = {
      all: 0,
      today: 0,
      twentyFourHours: 0,
      fortyEightHours: 0,
      lastWeek: 0,
      rest: 0,
    }

    ordersWithHandlingTime.forEach((o) => {
      const days = getRemainingDays(o)
      if (days === null) return

      const status = getOrderAvailabilityStatus(o)
      const requiresAvailability =
        status === "Pendiente" ||
        status === "Esperando disponibilidad" ||
        status === "Demorado" ||
        status === "Listo para enviar" ||
        status === "Etiqueta impresa"

      if (!requiresAvailability) return

      counts.all++

      if (status === "Listo para enviar" || status === "Etiqueta impresa") {
        counts.today++
      } else if (days === 1) {
        counts.twentyFourHours++
      } else if (days === 2) {
        counts.fortyEightHours++
      } else if (days >= 3 && days <= 7) {
        counts.lastWeek++
      } else if (days > 7) {
        counts.rest++
      }
    })

    return counts
  }, [ordersWithHandlingTime])

  const showAvailabilityFilters = Object.keys(mlAccounts).length > 0

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filters])

  return {
    // State
    loading,
    error,
    orders,
    totalOrders,
    paging,
    currentPage,
    setCurrentPage,
    selectedOrder,
    showOrderDetails,
    setShowOrderDetails,
    completeOrderDetails,
    searchQuery,
    setSearchQuery,
    mlAccounts,
    selectedAccount,
    setSelectedAccount,
    filters,
    setFilters,
    advancedFiltersOpen,
    setAdvancedFiltersOpen,
    copiedSku,
    copiedOrderId,
    loadingSkus,
    lastUpdated,
    markingReceived,
    selectedOrders,
    bulkMarkingReceived,
    confirmMarkReceived,
    setConfirmMarkReceived,
    loadingShipmentStatuses,
    visibleColumns,
    setVisibleColumns,
    sortConfig,
    returnDetailsOpen,
    setReturnDetailsOpen,
    returnDetails,
    loadingReturnDetails,
    showReturnDialog,
    setShowReturnDialog,
    selectedReturnOrder,
    setSelectedReturnOrder,
    selectedOrderForDelivery,
    showDeliveryConfirmDialog,
    setShowDeliveryConfirmDialog,
    isMarkingDelivered,
    mlBrowserModal,
    setMlBrowserModal,

    // Computed
    filteredOrders,
    sortedOrders,
    paginatedOrders,
    totalPages,
    timeFilteredOrders,
    generalStatusCounts,
    availabilityCounts,
    showAvailabilityFilters,

    // Actions
    syncOrders,
    fetchOrders,
    fetchOrdersEffect,
    viewOrderDetails,
    copySku,
    copyOrderId,
    handleSortChange,
    showMarkReceivedConfirmation,
    confirmAndMarkReceived,
    markBulkProductsAsReceived,
    fetchReturnDetails,
    showMarkDeliveredConfirmation,
    handleMarkAsDelivered,
    openMLOrder,
    copyToClipboard,
    toggleSelectAll,
    toggleOrderSelection,
  }
}
