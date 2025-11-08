"use client"

import { TableHeader } from "@/components/ui/table"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog" // Import AlertDialog components

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
// Removed duplicate imports for DialogContent, DialogDescription, DialogHeader, DialogTitle
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ColumnSelector } from "@/components/column-selector"
import { AdvancedPagination } from "@/components/advanced-pagination"
import { MLConnectionStatus } from "@/components/ml-connection-status"
import { LastUpdated } from "@/components/last-updated"
import { SortSelector } from "@/components/sort-selector"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils" // Added cn utility import
import { useToast } from "@/components/ui/use-toast" // Added toast hook

const RefreshCw = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
)

const Download = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
)

const Eye = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const Clock = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const Printer = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect width="12" height="8" x="6" y="14" />
  </svg>
)

const Package = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
)

const AlertCircle = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
)

const Search = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

const ShoppingBag = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
)

const Copy = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
)

const Check = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const ArrowUpDown = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="m21 16-4 4-4-4" />
    <path d="M17 20V4" />
    <path d="m3 8 4-4 4 4" />
    <path d="M7 4v16" />
  </svg>
)

const ArrowUp = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </svg>
)

const ArrowDown = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </svg>
)

const ChevronDown = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const Lightbulb = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </svg>
)

const ExternalLink = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

const MLLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 0C10.745 0 0 10.745 0 24s10.745 24 24 24 24-10.745 24-24S37.255 0 24 0z" fill="#FFE600" />
    <path
      d="M35.5 18.5c0-1.933-1.567-3.5-3.5-3.5s-3.5 1.567-3.5 3.5v11c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-11zM24 12c-1.933 0-3.5 1.567-3.5 3.5v19c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-19c0-1.933-1.567-3.5-3.5-3.5zM16 18.5c0-1.933-1.567-3.5-3.5-3.5s9 16.567 9 18.5v11c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-11z"
      fill="#2D3277"
    />
  </svg>
)

interface OrderItem {
  item: {
    id: string
    title: string
    seller_sku?: string
    sale_terms?: Array<{
      id: string
      value_name?: string
      value_struct?: {
        number: number
        unit: string
      }
    }>
    shipping?: {
      // Added shipping field to OrderItem
      local_pick_up?: boolean
    }
    seller_custom_field?: string // Added for SKU
    thumbnail?: string // Added for item thumbnail
    variation_id?: string // Added for variation ID
  }
  quantity: number
  unit_price: number
  full_unit_price: number
  manufacturing_days?: number
}

interface ReturnShipping {
  id: number
  status: string
  tracking_number?: string
  status_history?: Array<{
    status: string
    substatus: string | null
    date: string
  }>
}

interface ReturnDetails {
  claim_id: number
  type: string
  subtype: string | null
  status: string
  status_money: string
  shipping?: ReturnShipping
  date_created: string
  date_closed?: string
  refund_at?: string
}

interface Order {
  id: number
  pack_id?: number // Added pack_id to show ML sale number
  status: string
  status_detail: string | null
  date_created: string
  date_closed: string | null
  order_items: OrderItem[]
  total_amount: number
  currency_id: string
  buyer: {
    id: number
    nickname: string
    email?: string
    phone?: {
      number: string
      area_code?: string
    }
    first_name?: string
    last_name?: string
  }
  shipping?: {
    id: number
    status: string
    substatus?: string | string[] // Changed from string[] to string for compatibility
    mode?: string // Added mode field for shipping type (me1, me2, custom)
    shipping_mode?: string // ML API uses shipping_mode instead of mode
    logistic_type?: string
    shipping_option?: {
      // Added shipping_option field for more detailed shipping info
      id: string
      name?: string
      tag?: string
    }
    date_created?: string // Added date_created to shipping object
  }
  payments?: Array<{
    id: number
    status: string
    status_detail: string
    payment_type_id: string
    transaction_amount: number
  }>
  account_nickname?: string
  account_id?: string
  manufacturing_ending_date?: string
  tags?: string[] // Added tags to Order interface
  cancel_detail?: {
    // Added cancel_detail field
    group: string
    code: string
    description: string
    requested_by: string
    date: string
    reason?: string // Added for cancellation reason
  }
  claim_id?: number
  claim?: {
    id: string
    type: string
    stage: string
    status: string
    reason_id: string
    date_created: string
    last_updated: string
  }
  // Add _account field to Order interface for filtering by account
  _account?: { id: string; nickname: string }
  expiration_date?: string // Added for expiration date
  seller?: {
    // Added seller to Order interface for ML Logo component
    id: string
  }
}

interface PagingInfo {
  total: number
  limit: number
  offset: number
}

interface Column {
  id: string
  label: string
  enabled: boolean
}

interface SortConfig {
  key: string
  direction: "asc" | "desc"
}

export default function OrdersPage() {
  const { toast } = useToast() // Initialize toast hook
  const [loading, setLoading] = useState(true)
  const [allOrders, setAllOrders] = useState<Order[]>([]) // Store all orders
  const [paging, setPaging] = useState<PagingInfo>({ total: 0, limit: 50, offset: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [completeOrderDetails, setCompleteOrderDetails] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [error, setError] = useState<string | null>(null) // State for error messages

  const [searchQuery, setSearchQuery] = useState("") // Renamed from searchTerm

  const [mlAccounts, setMlAccounts] = useState<
    Record<string, { id: string; nickname: string; browser_preference: string | null }>
  >({})

  const [selectedAccount, setSelectedAccount] = useState<string>("all") // Renamed from accountFilter

  const [filters, setFilters] = useState({
    status: "all",
    date_from: "",
    date_to: "",
    generalStatus: "all", // Renamed from generalStatusFilter
    account: "all", // Added account filter
    availability: "all", // Added availability filter for availability status
    timeFilter: "1month", // Added timeFilter state
  })

  const [showFilters, setShowFilters] = useState(false)

  const [copiedSku, setCopiedSku] = useState<string | null>(null)
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null)

  const [loadingSkus, setLoadingSkus] = useState<Set<string>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [markingReceived, setMarkingReceived] = useState<Set<string>>(new Set())

  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [bulkMarkingReceived, setBulkMarkingReceived] = useState(false)

  const [confirmMarkReceived, setConfirmMarkReceived] = useState<{
    orderId: number
    itemId: string
    orderDetails: Order | null
  } | null>(null)

  const [loadingShipmentStatuses, setLoadingShipmentStatuses] = useState<Set<number>>(new Set())

  const [visibleColumns, setVisibleColumns] = useState<Column[]>([
    { id: "order", label: "Orden", enabled: true },
    { id: "customer", label: "Cliente", enabled: true },
    { id: "products", label: "Productos", enabled: true },
    { id: "sku", label: "SKU", enabled: true },
    { id: "availability", label: "Estado", enabled: true },
    { id: "items", label: "Items", enabled: true },
    { id: "total", label: "Total", enabled: true },
    { id: "status", label: "Estado / Pago", enabled: true },
    { id: "date", label: "Fecha", enabled: true },
    { id: "account", label: "Cuenta", enabled: true },
  ])

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "date", direction: "desc" })

  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)

  const [returnDetailsOpen, setReturnDetailsOpen] = useState(false)
  const [returnDetails, setReturnDetails] = useState<ReturnDetails | null>(null)
  const [loadingReturnDetails, setLoadingReturnDetails] = useState(false)

  // Added states for Return Dialog
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [selectedReturnOrder, setSelectedReturnOrder] = useState<Order | null>(null)

  // New states for "Mark as Delivered" functionality
  const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState<number | null>(null)
  const [showDeliveryConfirmDialog, setShowDeliveryConfirmDialog] = useState(false)
  const [isMarkingDelivered, setIsMarkingDelivered] = useState(false)

  const [mlBrowserModal, setMlBrowserModal] = useState<{
    open: boolean
    orderId: number
    accountNickname: string
    browserPreference: string | null
    url: string
  } | null>(null)

  // Replaced setAllOrders with setOrders and added setTotalOrders
  const [orders, setOrders] = useState<Order[]>([])
  const [totalOrders, setTotalOrders] = useState(0)

  // Define syncOrders before its usage
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
      toast({ title: "Sincronización iniciada", description: "Las órdenes se actualizarán pronto." })
      // Optionally, refetch orders after sync initiation
      // fetchOrders();
    } catch (error: any) {
      console.error("Error syncing orders:", error)
      toast({
        title: "Error de sincronización",
        description: error.message || "No se pudo iniciar la sincronización de órdenes.",
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

      console.log("[v0] fetchOrders - Raw orders from server:", data.orders)

      const ordersWithAccount = data.orders.map((order: any) => {
        const sellerId = order.seller?.id
        const accountInfo = sellerId ? mlAccounts[sellerId] : null

        console.log(`[v0] fetchOrders - Order ${order.id} seller.id: ${sellerId}`)
        console.log(`[v0] fetchOrders - Order ${order.id} accountInfo:`, accountInfo)

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

      console.log("[v0] fetchOrders - Orders with account:", ordersWithAccount)
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
    setError(null) // Clear previous errors
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

      setOrders(ordersWithAccount) // Use setOrders
      setTotalOrders(data.paging?.total || ordersWithAccount.length) // Use setTotalOrders
      loadSkusProgressively(ordersWithAccount)
      loadShipmentStatusesProgressively(ordersWithAccount)
    } catch (error: any) {
      console.error("Error fetching orders in effect:", error)
      setError(`Error al cargar órdenes: ${error.message}`)
      setOrders([]) // Clear orders on error
      setTotalOrders(0) // Reset total orders
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initializeData = async () => {
      await fetchMlAccounts()
      // Esperar un momento para que mlAccounts se actualice en el estado
      setTimeout(() => {
        if (selectedAccount) {
          fetchOrdersEffect()
        }
      }, 100)
    }

    initializeData()
  }, []) // Only run once on mount

  useEffect(() => {
    // Skip if this is the initial mount (handled by the effect above)
    if (Object.keys(mlAccounts).length === 0) {
      return
    }

    if (selectedAccount) {
      fetchOrdersEffect()
    }
  }, [selectedAccount])

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

  const fetchMlAccounts = async () => {
    try {
      console.log("[v0] Fetching ML accounts...")
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()
      console.log("[v0] ML accounts response:", data)

      const accountsRecord: Record<string, { id: string; nickname: string; browser_preference: string | null }> = {}
      data.accounts?.forEach((account: any) => {
        let browserPreference = null
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem(`ml_browser_${account.id}`)
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              browserPreference = parsed.label || parsed.value
              console.log(`[v0] Loaded browser preference for ${account.nickname}:`, browserPreference)
            } catch (e) {
              console.error("[v0] Failed to parse browser preference:", e)
            }
          }
        }

        accountsRecord[account.ml_user_id] = {
          id: account.id, // UUID original para localStorage
          nickname: account.nickname,
          browser_preference: browserPreference,
        }
      })

      console.log("[v0] ML accounts indexed by ml_user_id:", accountsRecord)
      setMlAccounts(accountsRecord)
    } catch (error) {
      console.error("[v0] Failed to fetch ML accounts:", error)
    }
  }

  // El efecto que actualizaba orders cuando mlAccounts cambiaba ha sido eliminado
  // porque causaba un loop infinito y no era necesario

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
    [filters.timeFilter], // Depend on filters.timeFilter
  )

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Modified to use totalOrders for the API call, assuming an endpoint that supports pagination
      const response = await fetch(
        `/api/mercadolibre/orders?limit=${paging.limit}&offset=${paging.offset}&account_id=${selectedAccount}`,
      )
      if (!response.ok) {
        throw new Error("Error al cargar las órdenes")
      }
      const data = await response.json()

      setOrders(data.orders || []) // Changed allOrders to orders
      setPaging(data.paging || { total: 0, limit: paging.limit, offset: paging.offset }) // Keep current limit and offset
    } catch (err: any) {
      // Explicitly type error as any or Error
      console.error("Error al cargar órdenes:", err)
      setError(err instanceof Error ? err.message : "Error desconocido")
      setOrders([]) // Changed allOrders to orders
    } finally {
      setLoading(false)
    }
  }, [paging.limit, paging.offset, selectedAccount]) // Added dependencies

  useEffect(() => {
    loadOrders()
  }, [loadOrders]) // Depend on the memoized loadOrders function

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
    const batchSize = 1 // Reduced batch size to 1
    const delayBetweenBatches = 6000 // Increased delay to 6 seconds

    for (let i = 0; i < itemIdsArray.length; i += batchSize) {
      const batch = itemIdsArray.slice(i, i + batchSize)

      setLoadingSkus((prev) => new Set([...prev, ...batch]))

      await Promise.all(
        batch.map(async (itemId) => {
          try {
            const response = await fetch(`/api/ml/items/${itemId}`)
            if (response.ok) {
              const data = await response.json()

              setOrders(
                // Use setOrders here
                (
                  prevOrders, // Use prevOrders for current state
                ) =>
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
    const ordersWithShipping = ordersToProcess.filter((order) => order.shipping?.id) // Changed allOrders to ordersToProcess
    const batchSize = 1 // Process one at a time to avoid rate limiting
    const delayBetweenBatches = 6000 // 6 seconds delay

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

              // Update order with real shipping status
              setOrders(
                // Use setOrders here
                (
                  prevOrders, // Use prevOrders for current state
                ) =>
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

  async function viewOrderDetails(order: Order) {
    setSelectedOrder(order)
    setShowOrderDetails(true)
    // No ہمیں cargar detalles adicionales, usamos la info que ya tenemos
    setCompleteOrderDetails({
      order: order,
      billingInfo: null, // No disponible sin endpoint adicional
      shipmentDetails: null, // No disponible sin endpoint adicional
      messages: [], // No disponible sin endpoint adicional
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

  const renderSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    )
  }

  const markProductAsReceived = async (orderId: number, itemId: string) => {
    try {
      setMarkingReceived((prev) => new Set([...prev, itemId]))

      const response = await fetch(`/api/mercadolibre/orders/${orderId}/mark-received`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.JSON.stringify({ item_id: itemId }),
      })

      if (response.ok) {
        toast({ title: "Producto marcado como recibido", description: "La etiqueta estará disponible en breve." })
        await loadOrders() // Re-fetch orders
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
    const order = orders.find((o) => o.id === orderId) // Use orders here
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
      toast({ title: "Selección vacía", description: "Por favor selecciona al menos una orden." })
      return
    }

    if (!confirm(`¿Marcar ${selectedOrders.size} órdenes como recibidas?`)) {
      return
    }

    try {
      setBulkMarkingReceived(true)
      const ordersToMark = Array.from(selectedOrders)

      for (const orderId of ordersToMark) {
        const order = orders.find((o) => o.id === orderId) // Use orders here
        if (order && order.order_items.length > 0) {
          try {
            const response = await fetch(`/api/mercadolibre/orders/${orderId}/mark-received`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.JSON.stringify({ item_id: order.order_items[0].item.id }),
            })

            if (!response.ok) {
              console.error(`Error marking order ${orderId} as received`)
              // Optionally, show individual error for each order
            }
          } catch (error) {
            console.error(`Error marking order ${orderId}:`, error)
          }
        }

        // Add delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      toast({ title: "Órdenes marcadas", description: `${selectedOrders.size} órdenes marcadas como recibidas.` })
      setSelectedOrders(new Set())
      await loadOrders()
    } catch (error: any) {
      console.error("Error in bulk mark as received:", error)
      toast({
        title: "Error",
        description: `Error al marcar órdenes como recibidas: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setBulkMarkingReceived(false)
    }
  }

  function hasActiveClaim(order: Order): boolean {
    // Una orden tiene un reclamo activo si:
    // 1. Tiene claim_id
    // 2. NO está cancelada (las canceladas ya tienen su propio estado)
    // 3. NO está entregada (las entregadas ya completaron su ciclo)
    return !!(order.claim_id && order.status !== "cancelled" && !order.tags?.includes("delivered"))
  }

  function hasHandlingTime(order: Order): boolean {
    // Si tiene manufacturing_ending_date, definitivamente tiene handling time
    if (order.manufacturing_ending_date) {
      return true
    }

    // Si no tiene manufacturing_ending_date, verificar el tipo de envío
    const shippingMode = order.shipping?.mode || order.shipping?.shipping_mode
    if (shippingMode === "custom" || shippingMode === "me1" || !order.shipping?.id) {
      return false
    }

    return false
  }

  const getRemainingDays = (order: Order): number | null => {
    if (!order.manufacturing_ending_date) return null

    const endDate = new Date(order.manufacturing_ending_date)
    const now = new Date()

    // Resetear las horas para comparar solo fechas completas
    endDate.setHours(0, 0, 0, 0)
    now.setHours(0, 0, 0, 0)

    const diffTime = endDate.getTime() - now.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    return diffDays
  }

  const getRemainingDaysColor = (days: number | null): string => {
    if (days === null) return "text-muted-foreground"
    if (days <= 0) return "text-gray-600"
    if (days <= 1) return "text-red-600"
    if (days <= 5) return "text-orange-600"
    if (days <= 7) return "text-yellow-600"
    return "text-emerald-600"
  }

  const getRemainingDaysBadge = (days: number | null) => {
    if (days === null) return null

    let bgColor = "bg-emerald-100 text-emerald-900 border-emerald-300"

    if (days <= 0) {
      bgColor = "bg-gray-100 text-gray-900 border-gray-300"
    } else if (days <= 1) {
      bgColor = "bg-red-100 text-red-900 border-red-300"
    } else if (days <= 5) {
      bgColor = "bg-orange-100 text-orange-900 border-orange-300"
    } else if (days <= 7) {
      bgColor = "bg-yellow-100 text-yellow-900 border-yellow-300"
    }

    return (
      <Badge variant="outline" className={`${bgColor} text-xs font-bold`}>
        {days <= 0 ? "¡Vencido!" : `${days}d`}
      </Badge>
    )
  }

  const getHandlingTime = (order: Order) => {
    const remainingDays = getRemainingDays(order)
    if (remainingDays !== null) {
      return remainingDays <= 0 ? "¡Tiempo vencido!" : `Faltan ${remainingDays} días`
    }

    for (const item of order.order_items) {
      if (item.manufacturing_days && item.manufacturing_days > 0) {
        return `${item.manufacturing_days} días`
      }
    }

    for (const item of order.order_items) {
      const term = item.item.sale_terms?.find((t) => t.id === "MANUFACTURING_TIME")
      if (term?.value_struct) {
        return `${term.value_struct.number} ${term.value_struct.unit}`
      }
      if (term?.value_name) {
        return term.value_name
      }
    }

    return "Tiempo de disponibilidad"
  }

  const getOrderAvailabilityStatusBadge = (order: Order) => {
    const status = getOrderAvailabilityStatus(order)
    const statusConfig: Record<string, { className: string; icon?: any }> = {
      Entregado: { className: "bg-green-100 text-green-900 border-green-300" },
      "En punto de retiro": { className: "bg-purple-100 text-purple-900 border-purple-300" },
      "Etiqueta impresa": { className: "bg-blue-100 text-blue-900 border-blue-300" },
      "En camino": { className: "bg-cyan-100 text-cyan-900 border-cyan-300" },
      "Acordar la entrega": { className: "bg-amber-100 text-amber-900 border-amber-300" },
      Demorado: { className: "bg-red-100 text-red-900 border-red-300" },
      "Esperando disponibilidad": { className: "bg-orange-100 text-orange-900 border-orange-300" },
      "Listo para enviar": { className: "bg-emerald-100 text-emerald-900 border-emerald-300" },
      Pendiente: { className: "bg-gray-100 text-gray-900 border-gray-300" },
      Cancelado: { className: "bg-red-200 text-red-900 border-red-300" },
      "Con reclamo": { className: "bg-yellow-100 text-yellow-900 border-yellow-300" },
      "Problema de entrega": { className: "bg-red-100 text-red-900 border-red-300" },
      "Pendiente de pago": { className: "bg-yellow-100 text-yellow-900 border-yellow-300" },
      Devolución: { className: "bg-pink-100 text-pink-900 border-pink-300" },
    }

    const config = statusConfig[status] || { className: "bg-gray-100 text-gray-900 border-gray-300" }
    return (
      <Badge variant="outline" className={`${config.className} text-xs font-semibold`}>
        {status}
      </Badge>
    )
  }

  function getOrderAvailabilityStatus(order: Order): string {
    // PRIORITY 1: Returns/Refunds (highest priority - before claims)
    if (
      order.tags?.includes("returned") ||
      order.tags?.includes("return") ||
      (order.claim_id && order.tags?.includes("return")) ||
      (order.status === "cancelled" && order.cancel_detail?.reason === "buyer_return") ||
      (order.status === "cancelled" && order.tags?.includes("return"))
    ) {
      return "Devolución"
    }

    // PRIORITY 2: Claims (active disputes)
    if (hasActiveClaim(order)) {
      return "Con reclamo"
    }

    // PRIORITY 3: Cancelled orders (but not returns)
    if (order.status === "cancelled") {
      return "Cancelado"
    }

    // PRIORITY 4: Delivered orders
    if (order.tags?.includes("delivered") || order.shipping?.status === "delivered") {
      return "Entregado"
    }

    // PRIORITY 5: Orders without shipping or custom shipping (acordar entrega)
    if (order.tags?.includes("no_shipping")) {
      // Si han pasado 28 días desde la compra, ML marca automáticamente como entregado
      if (order.date_created) {
        const daysSincePurchase = Math.floor(
          (Date.now() - new Date(order.date_created).getTime()) / (1000 * 60 * 60 * 24),
        )
        if (daysSincePurchase >= 28) {
          return "Entregado"
        }
      }

      // Si tiene menos de 28 días, es "Acordar la entrega"
      return "Acordar la entrega"
    }

    // PRIORITY 6: In-progress shipping states
    if (order.shipping?.substatus === "ready_for_pickup") {
      return "En punto de retiro"
    }

    if (order.shipping?.substatus === "printed") {
      return "Etiqueta impresa"
    }

    if (order.shipping?.status === "shipped") {
      return "En camino"
    }

    if (order.shipping?.status === "ready_to_ship") {
      return "Listo para enviar"
    }

    // PRIORITY 7: Delivery problems
    if (order.shipping?.status === "not_delivered" || order.shipping?.substatus === "returning_to_sender") {
      return "Problema de entrega"
    }

    // PRIORITY 8: Payment issues
    if (order.status === "payment_required" || order.status === "payment_in_process") {
      return "Pendiente de pago"
    }

    // PRIORITY 9: Handling time (manufacturing/availability)
    if (hasHandlingTime(order)) {
      const days = getRemainingDays(order)
      if (days !== null && days <= 0) {
        return "Demorado"
      }
      return "Esperando disponibilidad"
    }

    // PRIORITY 10: Default pending state
    return "Pendiente"
  }

  function getCancellationSubtype(order: Order): string | null {
    if (order.status !== "cancelled") return null

    // Priorizar cancel_detail si está disponible
    if (order.cancel_detail) {
      const { group, description, requested_by } = order.cancel_detail

      // Mapear grupos de cancelación a mensajes específicos
      switch (group) {
        case "buyer":
          return "Cancelado por comprador"
        case "seller":
          return "Cancelado por vendedor"
        case "delivery":
          return "Problema de entrega"
        case "shipment":
          return "Problema de envío"
        case "fraud":
          return "Fraude detectado"
        case "mediations":
          return "Mediación"
        case "item":
          return "Problema con el producto"
        case "fiscal":
          return "Problema fiscal"
        case "internal":
          return requested_by === "buyer"
            ? "Cancelado por comprador"
            : requested_by === "seller"
              ? "Cancelado por vendedor"
              : "Cancelado por ML"
        default:
          // Si hay description, usarla
          if (description) {
            return description
          }
      }
    }

    // Fallback: verificar tags de la orden
    if (order.tags?.includes("not_delivered")) {
      return "No entregado"
    }

    if (order.tags?.includes("returned")) {
      return "Devuelto"
    }

    // Verificar estado del envío
    const shippingStatus = order.shipping?.status
    const shippingSubstatus = order.shipping?.substatus

    if (shippingStatus === "not_delivered" || shippingSubstatus === "returning_to_sender") {
      return "Devuelto al vendedor"
    }

    if (shippingStatus === "cancelled") {
      return "Envío cancelado"
    }

    // Verificar si hay información de claim/reclamo
    if (order.tags?.includes("claim") || order.claim_id) {
      return "Reclamo / Devolución"
    }

    return null
  }

  // Modified getActionButton to accept status and days as parameters
  const getActionButton = (order: Order, status: string, days: number | null) => {
    const itemId = order.order_items[0]?.item?.id

    if (!itemId) return null

    switch (status) {
      case "Pendiente":
      case "Esperando disponibilidad":
        return (
          <Button
            variant="default"
            size="sm"
            className="w-full h-7 text-[11px] bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md transition-all"
            onClick={() => showMarkReceivedConfirmation(order.id, itemId)}
            disabled={markingReceived.has(itemId)}
          >
            {markingReceived.has(itemId) ? (
              <>
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Check className="mr-1 h-3 w-3" />
                Ya tengo el producto
              </>
            )}
          </Button>
        )

      case "Acordar la entrega":
        return (
          <div className="flex flex-col gap-1">
            <Button
              variant="default"
              size="sm"
              className="w-full h-7 text-[11px] bg-gray-400 cursor-not-allowed shadow-sm"
              disabled
              title="Las órdenes de 'Acordar la entrega' se marcan automáticamente como entregadas después de 28 días"
            >
              <Clock className="mr-1 h-3 w-3" />
              Se marca automáticamente
            </Button>
            <span className="text-[9px] text-gray-500 text-center">(28 días desde la compra)</span>
          </div>
        )

      case "Listo para enviar":
        // Botón "Imprimir etiqueta" para órdenes listas para enviar
        return (
          <Button
            variant="default"
            size="sm"
            className="w-full h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow-md transition-all"
            onClick={() => {
              if (order.shipping?.id) {
                window.open(`/shipments?highlight=${order.shipping.id}`, "_blank")
              }
            }}
          >
            <Printer className="mr-1 h-3 w-3" />
            Imprimir etiqueta
          </Button>
        )

      case "Etiqueta impresa":
        // Botón "Ver envío" para órdenes con etiqueta impresa
        return (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-[11px] border-blue-600 text-blue-600 hover:bg-blue-50 shadow-sm bg-transparent"
            onClick={() => {
              if (order.shipping?.id) {
                window.open(`/shipments?highlight=${order.shipping.id}`, "_blank")
              }
            }}
          >
            <Package className="mr-1 h-3 w-3" />
            Ver envío
          </Button>
        )

      case "Demorado":
        return (
          <Button
            variant="default"
            size="sm"
            className="w-full h-7 text-[11px] bg-red-600 hover:bg-red-700 shadow-sm hover:shadow-md transition-all"
            onClick={() => showMarkReceivedConfirmation(order.id, itemId)}
            disabled={markingReceived.has(itemId)}
          >
            {markingReceived.has(itemId) ? (
              <>
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <AlertCircle className="mr-1 h-3 w-3" />
                Ya tengo el producto
              </>
            )}
          </Button>
        )

      case "En camino":
      case "En punto de retiro":
      case "Entregado":
        // Botón "Ver detalles" para órdenes en tránsito o entregadas
        return (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-[11px] border-gray-400 text-gray-600 hover:bg-gray-50 shadow-sm bg-transparent"
            onClick={() => viewOrderDetails(order)}
          >
            <Eye className="mr-1 h-3 w-3" />
            Ver detalles
          </Button>
        )

      case "Con reclamo": // Button for orders with active claims
        return (
          <Button
            variant="destructive"
            size="sm"
            className="w-full h-7 text-[11px] bg-red-600 hover:bg-red-700 shadow-sm hover:shadow-md transition-all"
            onClick={() => viewOrderDetails(order)} // Clicking should open details to review the claim
          >
            <AlertCircle className="mr-1 h-3 w-3" />
            Revisar reclamo
          </Button>
        )

      case "Devolución": // Button for returns
        return (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-[11px] border-pink-500 text-pink-500 hover:bg-pink-50 shadow-sm bg-transparent"
            onClick={() => {
              if (order.claim_id) {
                fetchReturnDetails(order.claim_id)
              }
            }}
          >
            <Eye className="mr-1 h-3 w-3" />
            Ver devolución
          </Button>
        )

      default:
        return null
    }
  }

  const filteredOrders = useMemo(() => {
    let filtered = orders // Changed allOrders to orders

    // Aplicar filtro de tiempo primero
    filtered = filtered.filter(filterByTimeRange)

    // Si hay búsqueda, aplicar solo búsqueda y retornar
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

    // Aplicar filtro de estado general
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
            return orderStatus === "Devolución"
          default:
            return true
        }
      })
    }

    // Aplicar filtro de disponibilidad
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
            return days >= 3 && days <= 7 // Solo días 3-7
          case "rest":
            return days > 7
          default:
            return true
        }
      })
    }

    // Aplicar filtro de cuenta
    if (filters.account !== "all") {
      filtered = filtered.filter((order) => order._account?.id === filters.account)
    }

    // Aplicar filtros de fecha
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
  }, [orders, filters, searchQuery, filterByTimeRange]) // Changed allOrders to orders

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

  // Use totalOrders for totalPages
  const totalPages = Math.max(1, Math.ceil(totalOrders / paging.limit))
  const startIndex = (currentPage - 1) * paging.limit
  const endIndex = startIndex + paging.limit
  const paginatedOrders = sortedOrders.slice(startIndex, endIndex)

  // Filtered orders for counting purposes (to reflect the current time filter)
  const timeFilteredOrders = orders.filter(filterByTimeRange) // Changed allOrders to orders

  const generalStatusCounts = useMemo(() => {
    // Use orders and apply existing filters for accurate counts
    const ordersForCounting = orders.filter((order) => {
      // Changed allOrders to orders
      // Filtro de período de tiempo
      if (!filterByTimeRange(order)) {
        return false
      }

      // Filtro de cuenta
      if (filters.account !== "all" && order._account?.id !== filters.account) {
        return false
      }

      // Filtro de búsqueda
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

    const counts = {
      all: 0,
      delivered: 0,
      toAgree: 0,
      cancelled: 0,
      waiting: 0,
      withClaim: 0,
      returned: 0, // New: count for returns
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
      } else if (status === "Devolución") {
        // Added count for returns
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
  }, [orders, filters.timeFilter, searchQuery, filters.account, filterByTimeRange]) // Fixed dependency array based on the filter logic inside

  const ordersWithHandlingTime = useMemo(() => {
    return orders.filter((order) => filterByTimeRange(order) && hasHandlingTime(order)) // Changed allOrders to orders
  }, [orders, filterByTimeRange]) // Changed allOrders to orders

  const availabilityCounts = useMemo(() => {
    const counts = {
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
        // Solo días 3-7, excluyendo 1 y 2
        counts.lastWeek++
      } else if (days > 7) {
        counts.rest++
      }
    })

    return counts
  }, [ordersWithHandlingTime])

  const sortOptions = [
    { key: "date", label: "Fecha" },
    { key: "total", label: "Total" },
    { key: "order", label: "Orden" },
    { key: "customer", label: "Cliente" },
  ]

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set())
    } else {
      const newSelected = new Set<number>()
      filteredOrders.forEach((order) => newSelected.add(order.id))
      setSelectedOrders(newSelected) // Corrected: used newSelected instead of newSet
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

  const showAvailabilityFilters = mlAccounts.length > 0 // Ensure filters are shown if accounts are loaded

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filters]) // Removed availabilityFilter and timeFilter from dependency array as they are now part of the filters object

  function hasReturn(order: Order): boolean {
    const hasClaimId = !!order.claim_id
    // Check if order has returns
    const result = order.tags?.includes("return") || false

    if (order.status === "cancelled") {
      // Check if order has returns
      return result
    }

    return hasClaimId && result
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
        description: `No se pudieron cargar los detalles de la devolución: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setLoadingReturnDetails(false)
    }
  }

  function getReturnStatusLabel(status: string): string {
    const statusLabels: Record<string, string> = {
      pending: "Pendiente",
      ready_to_ship: "Listo para enviar",
      shipped: "Enviado",
      delivered: "Entregado al vendedor",
      not_delivered: "No entregado",
      cancelled: "Cancelado",
      closed: "Cerrado",
    }
    return statusLabels[status] || status
  }

  function getReturnMoneyStatusLabel(status: string): string {
    const statusLabels: Record<string, string> = {
      retained: "Retenido",
      refunded: "Reembolsado",
      available: "Disponible",
    }
    return statusLabels[status] || status
  }

  const showMarkDeliveredConfirmation = (orderId: number) => {
    setSelectedOrderForDelivery(orderId)
    setShowDeliveryConfirmDialog(true)
  }

  const handleMarkAsDelivered = async () => {
    if (!selectedOrderForDelivery) return

    try {
      setIsMarkingDelivered(true)

      // Llamar a la API de MercadoLibre para marcar como entregado
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

      // Recargar órdenes
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

  const availabilityBadgeConfig: Record<
    string,
    { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
  > = {
    Entregado: { variant: "default", className: "bg-green-100 text-green-900 border-green-300" },
    "En camino": { variant: "default", className: "bg-blue-100 text-blue-900 border-blue-300" },
    "Listo para enviar": { variant: "outline", className: "bg-purple-100 text-purple-900 border-purple-300" },
    "Etiqueta impresa": { variant: "outline", className: "bg-teal-100 text-teal-900 border-teal-300" },
    "En punto de retiro": { variant: "outline", className: "bg-indigo-100 text-indigo-900 border-indigo-300" },
    "Esperando disponibilidad": { variant: "outline", className: "bg-yellow-100 text-yellow-900 border-yellow-300" },
    Demorado: { variant: "destructive", className: "bg-red-100 text-red-900 border-red-300" },
    "Acordar la entrega": { variant: "outline", className: "bg-orange-100 text-orange-900 border-orange-300" },
    "Problema de entrega": { variant: "destructive", className: "bg-red-100 text-red-900 border-red-300" },
    "Con reclamo": { variant: "destructive", className: "bg-red-100 text-red-900 border-red-300" },
    Devolución: { variant: "destructive", className: "bg-pink-100 text-pink-900 border-pink-300" }, // Added badge config for "Devolución"
    Cancelado: { variant: "secondary", className: "bg-gray-100 text-gray-900 border-gray-300" },
    "Pendiente de pago": { variant: "outline", className: "bg-amber-100 text-amber-900 border-amber-300" },
    Pendiente: { variant: "outline" },
  }

  const openMLOrder = (order: any) => {
    const mlUrl = `https://www.mercadolibre.com.ar/ventas/${order.id}/detalle`

    console.log("[v0] openMLOrder - order.seller:", order.seller)
    console.log("[v0] openMLOrder - mlAccounts:", mlAccounts)
    console.log("[v0] openMLOrder - Looking for account with ID:", order.seller?.id)

    // Usar información de cuenta que ya tenemos
    const accountInfo = mlAccounts[order.seller?.id] || {
      nickname: "Cuenta de MercadoLibre",
      browser_preference: null,
    }

    console.log("[v0] openMLOrder - accountInfo found:", accountInfo)

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
    // Mostrar feedback visual
    const button = document.activeElement as HTMLButtonElement
    if (button) {
      const originalText = button.textContent
      button.textContent = "¡Copiado!"
      setTimeout(() => {
        button.textContent = originalText
      }, 2000)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-1">
          <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
            <div className="mx-auto grid w-full flex-1 auto-rows-max gap-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Ventas y Órdenes
                  </h2>
                  <p className="text-base text-muted-foreground">
                    {orders.length > 0 ? ( // Changed allOrders to orders
                      <>
                        <span className="font-semibold text-foreground">{totalOrders.toLocaleString()}</span> órdenes en
                        total
                      </>
                    ) : (
                      "Gestiona tus ventas de Mercado Libre"
                    )}
                    {selectedAccount !== "all" &&
                      mlAccounts[selectedAccount] && ( // Corrected condition to check if selectedAccount exists in mlAccounts
                        <span className="ml-2">
                          •{" "}
                          <span className="font-medium">
                            {mlAccounts[selectedAccount]?.nickname || "Cuenta seleccionada"}
                          </span>
                        </span>
                      )}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={fetchOrders}
                    disabled={loading}
                    variant="outline"
                    className="shadow-sm hover:shadow-md transition-shadow bg-transparent"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Actualizar
                  </Button>
                  <Button variant="outline" className="shadow-sm hover:shadow-md transition-shadow bg-transparent">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                  </Button>
                </div>
              </div>

              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Label className="text-sm font-semibold text-foreground">Filtrar por cuenta:</Label>
                      <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                        <SelectTrigger className="w-[300px] shadow-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            <span className="font-medium">Todas las cuentas</span> ({Object.keys(mlAccounts).length})
                          </SelectItem>
                          {Object.entries(mlAccounts).map(([id, account]) => (
                            <SelectItem key={id} value={id}>
                              {account.nickname || id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {Object.keys(mlAccounts).length === 0 && (
                        <Button variant="outline" size="sm" asChild className="shadow-sm bg-transparent">
                          <a href="/integrations">Conectar Cuenta</a>
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <LastUpdated timestamp={lastUpdated} isLoading={loading} onRefresh={fetchOrders} />
                      <MLConnectionStatus accountId={selectedAccount} onRefresh={fetchOrders} refreshing={loading} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
                    <CardTitle className="text-base font-semibold">Período de Tiempo</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={filters.timeFilter === "1month" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilters({ ...filters, timeFilter: "1month" })}
                        className="shadow-sm"
                      >
                        {filters.timeFilter === "1month" && <Check className="mr-2 h-4 w-4" />}1 mes
                      </Button>
                      <Button
                        variant={filters.timeFilter === "2months" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilters({ ...filters, timeFilter: "2months" })}
                        className="shadow-sm"
                      >
                        {filters.timeFilter === "2months" && <Check className="mr-2 h-4 w-4" />}2 meses
                      </Button>
                      <Button
                        variant={filters.timeFilter === "6months" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilters({ ...filters, timeFilter: "6months" })}
                        className="shadow-sm"
                      >
                        {filters.timeFilter === "6months" && <Check className="mr-2 h-4 w-4" />}6 meses
                      </Button>
                      <Button
                        variant={filters.timeFilter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilters({ ...filters, timeFilter: "all" })}
                        className="shadow-sm"
                      >
                        {filters.timeFilter === "all" && <Check className="mr-2 h-4 w-4" />}
                        Todas
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
                    <CardTitle className="text-base font-semibold">Filtro Avanzado</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <Collapsible open={advancedFiltersOpen} onOpenChange={setAdvancedFiltersOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between bg-transparent">
                          Filtros adicionales
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${advancedFiltersOpen ? "rotate-180" : ""}`}
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Rango de fechas específico</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Desde</Label>
                              <Input
                                type="date"
                                value={filters.date_from}
                                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                                className="text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Hasta</Label>
                              <Input
                                type="date"
                                value={filters.date_to}
                                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                                className="text-sm"
                              />
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Expandiendo opciones de filtro de estado para incluir todos los estados de MercadoLibre */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Estado de orden</Label>
                          <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos los estados</SelectItem>
                              <SelectItem value="confirmed">Confirmado</SelectItem>
                              <SelectItem value="payment_required">Pago requerido</SelectItem>
                              <SelectItem value="payment_in_process">Pago en proceso</SelectItem>
                              <SelectItem value="paid">Pagado</SelectItem>
                              <SelectItem value="cancelled">Cancelado</SelectItem>
                              <SelectItem value="invalid">Inválido</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Cuenta de Mercado Libre</Label>
                          <Select value={filters.account} onValueChange={(v) => setFilters({ ...filters, account: v })}>
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas</SelectItem>
                              {Object.entries(mlAccounts).map(([id, account]) => (
                                <SelectItem key={id} value={id}>
                                  {account.nickname || id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-muted/30 to-muted/10">
                  <CardTitle className="text-base font-semibold">Filtro por Estado de Orden</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por orden, cliente, producto o SKU..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        if (e.target.value) {
                          setFilters({
                            ...filters,
                            generalStatus: "all",
                            availability: "all",
                          })
                        }
                      }}
                      className="pl-10 shadow-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={filters.generalStatus === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "all" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "all" && <Check className="mr-2 h-4 w-4" />}
                      Todas ({generalStatusCounts.all})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "delivered" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "delivered" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "delivered" && <Check className="mr-2 h-4 w-4" />}
                      Entregadas ({generalStatusCounts.delivered})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "toAgree" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "toAgree" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "toAgree" && <Check className="mr-2 h-4 w-4" />}
                      Acordar entrega ({generalStatusCounts.toAgree})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "returned" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "returned" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "returned" && <Check className="mr-2 h-4 w-4" />}
                      Devoluciones ({generalStatusCounts.returned})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "cancelled" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "cancelled" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "cancelled" && <Check className="mr-2 h-4 w-4" />}
                      Canceladas ({generalStatusCounts.cancelled})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "waiting" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "waiting" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "waiting" && <Check className="mr-2 h-4 w-4" />}
                      Esperando disponibilidad ({generalStatusCounts.waiting})
                    </Button>
                    {/* Agregando más filtros por estado general */}
                    <Button
                      variant={filters.generalStatus === "con_reclamo" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "con_reclamo" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "con_reclamo" && <Check className="mr-2 h-4 w-4" />}
                      Con reclamo ({generalStatusCounts.withClaim})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "in_transit" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "in_transit" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "in_transit" && <Check className="mr-2 h-4 w-4" />}
                      En camino ({generalStatusCounts.in_transit})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "delayed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "delayed" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "delayed" && <Check className="mr-2 h-4 w-4" />}
                      Demoradas ({generalStatusCounts.delayed})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "ready" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "ready" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "ready" && <Check className="mr-2 h-4 w-4" />}
                      Listas para enviar ({generalStatusCounts.ready})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "pending_payment" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "pending_payment" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "pending_payment" && <Check className="mr-2 h-4 w-4" />}
                      Pendientes de pago ({generalStatusCounts.pending_payment})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "delivery_issues" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "delivery_issues" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "delivery_issues" && <Check className="mr-2 h-4 w-4" />}
                      Problemas de entrega ({generalStatusCounts.delivery_issues})
                    </Button>
                    <Button
                      variant={filters.generalStatus === "pending" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, generalStatus: "pending" }))}
                      className="rounded-full"
                    >
                      {filters.generalStatus === "pending" && <Check className="mr-2 h-4 w-4" />}
                      Pendientes ({generalStatusCounts.pending})
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-muted/30 to-muted/10">
                  <CardTitle className="text-base font-semibold">Pendientes de entrega (Disponibilidad)</CardTitle>
                  <CardDescription className="mt-1">
                    Órdenes que requieren que tengas el producto disponible
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={filters.availability === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, availability: "all" }))}
                      className="shadow-sm"
                    >
                      {filters.availability === "all" && <Check className="mr-2 h-4 w-4" />}
                      Todas ({availabilityCounts.all})
                    </Button>
                    <Button
                      variant={filters.availability === "today" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, availability: "today" }))}
                      className={`shadow-sm ${availabilityCounts.today > 0 ? "border-green-500 text-green-500 hover:bg-green-500/10" : ""}`}
                    >
                      {filters.availability === "today" && <Check className="mr-2 h-4 w-4" />}
                      Listas para enviar ({availabilityCounts.today})
                    </Button>
                    <Button
                      variant={filters.availability === "twentyFourHours" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, availability: "twentyFourHours" }))}
                      className={`shadow-sm ${availabilityCounts.twentyFourHours > 0 ? "border-orange-500 text-orange-500 hover:bg-orange-500/10" : ""}`}
                    >
                      {filters.availability === "twentyFourHours" && <Check className="mr-2 h-4 w-4" />}
                      en 24 horas ({availabilityCounts.twentyFourHours})
                    </Button>
                    <Button
                      variant={filters.availability === "fortyEightHours" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, availability: "fortyEightHours" }))}
                      className={`shadow-sm ${availabilityCounts.fortyEightHours > 0 ? "border-orange-500 text-orange-500 hover:bg-orange-500/10" : ""}`}
                    >
                      {filters.availability === "fortyEightHours" && <Check className="mr-2 h-4 w-4" />}
                      48 horas ({availabilityCounts.fortyEightHours})
                    </Button>
                    <Button
                      variant={filters.availability === "lastWeek" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, availability: "lastWeek" }))}
                      className={`shadow-sm ${availabilityCounts.lastWeek > 0 ? "border-blue-500 text-blue-500 hover:bg-blue-500/10" : ""}`}
                    >
                      {filters.availability === "lastWeek" && <Check className="mr-2 h-4 w-4" />}
                      Última semana ({availabilityCounts.lastWeek})
                    </Button>
                    <Button
                      variant={filters.availability === "rest" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilters((prev) => ({ ...prev, availability: "rest" }))}
                      className={`shadow-sm ${availabilityCounts.rest > 0 ? "border-green-500 text-green-500 hover:bg-green-500/10" : ""}`}
                    >
                      {filters.availability === "rest" && <Check className="mr-2 h-4 w-4" />}
                      Más de 7 días ({availabilityCounts.rest})
                    </Button>
                  </div>
                  {(availabilityCounts.today > 0 || availabilityCounts.twentyFourHours > 0) && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-500/10 p-3 text-sm">
                      <Lightbulb className="h-5 w-5 flex-shrink-0 text-green-500" />
                      <p className="text-green-600">
                        <span className="font-semibold">Tip:</span> Las órdenes "Listas para enviar" están disponibles
                        para despachar. Las de "24 horas" son urgentes.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-muted/30 to-muted/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold">Lista de Órdenes</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">
                        {loading ? (
                          <span className="flex items-center gap-2">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Cargando...
                          </span>
                        ) : (
                          <>
                            Mostrando <span className="font-semibold text-foreground">{paginatedOrders.length}</span> de{" "}
                            <span className="font-semibold text-foreground">{filteredOrders.length}</span> órdenes
                            {searchQuery && " (filtradas por búsqueda)"}
                            {filters.timeFilter !== "all" && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({timeFilteredOrders.length} en el período seleccionado)
                              </span>
                            )}
                          </>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <SortSelector
                        options={sortOptions}
                        value={sortConfig.key}
                        direction={sortConfig.direction}
                        onSortChange={handleSortChange}
                      />
                      <ColumnSelector
                        columns={visibleColumns}
                        onColumnsChange={setVisibleColumns}
                        storageKey="orders-columns"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="font-medium">Cargando órdenes...</p>
                      </div>
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="flex h-[400px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                      <div className="rounded-full bg-muted p-4">
                        <ShoppingBag className="h-12 w-12 opacity-30" />
                      </div>
                      {searchQuery ? (
                        <>
                          <p className="font-medium text-foreground">No se encontraron órdenes</p>
                          <p className="text-xs">No hay órdenes que coincidan con tu búsqueda</p>
                          <Button variant="outline" size="sm" onClick={() => setSearchQuery("")} className="mt-2">
                            Limpiar búsqueda
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-foreground">No hay órdenes disponibles</p>
                          <p className="text-xs">Las órdenes aparecerán aquí cuando realices ventas</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/40">
                              <TableHead className="w-12">
                                <input
                                  type="checkbox"
                                  checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                                  onChange={toggleSelectAll}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                              </TableHead>
                              {visibleColumns.find((c) => c.id === "order")?.enabled && (
                                <TableHead>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-3 h-8"
                                    onClick={() =>
                                      handleSortChange("order", sortConfig.direction === "asc" ? "desc" : "asc")
                                    }
                                  >
                                    Orden
                                    {renderSortIcon("order")}
                                  </Button>
                                </TableHead>
                              )}
                              {visibleColumns.find((c) => c.id === "customer")?.enabled && (
                                <TableHead>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-3 h-8"
                                    onClick={() =>
                                      handleSortChange("customer", sortConfig.direction === "asc" ? "desc" : "asc")
                                    }
                                  >
                                    Cliente
                                    {renderSortIcon("customer")}
                                  </Button>
                                </TableHead>
                              )}
                              {visibleColumns.find((c) => c.id === "products")?.enabled && (
                                <TableHead>Productos</TableHead>
                              )}
                              {visibleColumns.find((c) => c.id === "sku")?.enabled && <TableHead>SKU</TableHead>}
                              {visibleColumns.find((c) => c.id === "availability")?.enabled && (
                                <TableHead>Estado</TableHead>
                              )}
                              {visibleColumns.find((c) => c.id === "items")?.enabled && <TableHead>Items</TableHead>}
                              {visibleColumns.find((c) => c.id === "total")?.enabled && (
                                <TableHead>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-3 h-8"
                                    onClick={() =>
                                      handleSortChange("total", sortConfig.direction === "asc" ? "desc" : "asc")
                                    }
                                  >
                                    Total
                                    {renderSortIcon("total")}
                                  </Button>
                                </TableHead>
                              )}
                              {visibleColumns.find((c) => c.id === "status")?.enabled && (
                                <TableHead>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-3 h-8"
                                    onClick={() =>
                                      handleSortChange("status", sortConfig.direction === "asc" ? "desc" : "asc")
                                    }
                                  >
                                    Estado / Pago
                                    {renderSortIcon("status")}
                                  </Button>
                                </TableHead>
                              )}
                              {visibleColumns.find((c) => c.id === "date")?.enabled && (
                                <TableHead>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="-ml-3 h-8"
                                    onClick={() =>
                                      handleSortChange("date", sortConfig.direction === "asc" ? "desc" : "asc")
                                    }
                                  >
                                    Fecha
                                    {renderSortIcon("date")}
                                  </Button>
                                </TableHead>
                              )}
                              {visibleColumns.find((c) => c.id === "account")?.enabled && <TableHead>Cuenta</TableHead>}
                              <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedOrders.map((order) => {
                              const status = getOrderAvailabilityStatus(order)
                              const days = getRemainingDays(order)
                              return (
                                <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                                  <TableCell>
                                    <input
                                      type="checkbox"
                                      checked={selectedOrders.has(order.id)}
                                      onChange={() => toggleOrderSelection(order.id)}
                                      className="h-4 w-4 rounded border-gray-300"
                                    />
                                  </TableCell>
                                  {visibleColumns.find((c) => c.id === "order")?.enabled && (
                                    <TableCell className="font-medium">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-1.5">
                                          <div className="font-mono text-sm font-semibold">#{order.id}</div>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 shrink-0 hover:bg-muted"
                                            onClick={() => copyOrderId(order.id.toString())}
                                          >
                                            {copiedOrderId === order.id.toString() ? (
                                              <Check className="h-3 w-3 text-green-600" />
                                            ) : (
                                              <Copy className="h-3 w-3 text-muted-foreground" />
                                            )}
                                          </Button>
                                        </div>
                                        {order.pack_id && (
                                          <div className="flex items-center gap-1.5">
                                            <div className="text-xs text-muted-foreground font-mono">
                                              ML: {order.pack_id}
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5 shrink-0 hover:bg-muted"
                                              onClick={() => copyOrderId(order.pack_id!.toString())}
                                            >
                                              {copiedOrderId === order.pack_id?.toString() ? (
                                                <Check className="h-3 w-3 text-green-600" />
                                              ) : (
                                                <Copy className="h-3 w-3 text-muted-foreground" />
                                              )}
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "customer")?.enabled && (
                                    <TableCell>
                                      <div className="font-medium">{order.buyer.nickname}</div>
                                      {order.buyer.email && (
                                        <div className="text-sm text-muted-foreground">{order.buyer.email}</div>
                                      )}
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "products")?.enabled && (
                                    <TableCell>
                                      <div className="max-w-xs space-y-2">
                                        {order.order_items.map((item, idx) => (
                                          <div
                                            key={idx}
                                            className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-sm shadow-sm hover:shadow-md transition-shadow"
                                          >
                                            <div className="truncate font-medium text-foreground">
                                              {item.item.title}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                              Cantidad: <span className="font-semibold">{item.quantity}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "sku")?.enabled && (
                                    <TableCell>
                                      <div className="space-y-2">
                                        {order.order_items.map((item, idx) => (
                                          <div key={idx} className="flex items-center gap-1.5">
                                            {item.item.seller_sku ? (
                                              <>
                                                <code className="rounded bg-background px-2 py-1 text-xs font-mono border border-border/50">
                                                  {item.item.seller_sku}
                                                </code>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-6 w-6 shrink-0 hover:bg-muted"
                                                  onClick={() => copySku(item.item.seller_sku!)}
                                                >
                                                  {copiedSku === item.item.seller_sku ? (
                                                    <Check className="h-3 w-3 text-green-600" />
                                                  ) : (
                                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                                  )}
                                                </Button>
                                              </>
                                            ) : loadingSkus.has(item.item.id) ? (
                                              <div className="flex items-center gap-1.5">
                                                <code className="rounded bg-background px-2 py-1 text-xs font-mono border border-border/50">
                                                  MLA: {item.item.id}
                                                </code>
                                                <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                                              </div>
                                            ) : (
                                              <>
                                                <code className="rounded bg-background px-2 py-1 text-xs font-mono border border-border/50 shadow-sm">
                                                  MLA: {item.item.id}
                                                </code>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-6 w-6 shrink-0 hover:bg-muted"
                                                  onClick={() => copySku(item.item.id)}
                                                >
                                                  {copiedSku === item.item.id ? (
                                                    <Check className="h-3 w-3 text-green-600" />
                                                  ) : (
                                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                                  )}
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "availability")?.enabled && (
                                    <TableCell>
                                      <div className="flex flex-col gap-2">
                                        {/* Badge principal de estado */}
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "w-fit",
                                            availabilityBadgeConfig[status]?.className,
                                            status === "Entregado" && "border-green-500 bg-green-500/10 text-green-700",
                                            status === "Cancelado" && "border-red-500 bg-red-500/10 text-red-700",
                                            status === "Esperando disponibilidad" &&
                                              "border-orange-500 bg-orange-500/10 text-orange-700",
                                            status === "Acordar la entrega" &&
                                              "border-purple-500 bg-purple-500/10 text-purple-700",
                                            status === "En camino" && "border-blue-500 bg-blue-500/10 text-blue-700",
                                            status === "Listo para enviar" &&
                                              "border-cyan-500 bg-cyan-500/10 text-cyan-700",
                                            status === "Etiqueta impresa" &&
                                              "border-teal-500 bg-teal-500/10 text-teal-700",
                                            status === "En punto de retiro" &&
                                              "border-indigo-500 bg-indigo-500/10 text-indigo-700",
                                            status === "Pendiente" &&
                                              "border-yellow-500 bg-yellow-500/10 text-yellow-700",
                                            status === "Demorado" && "border-red-600 bg-red-600/10 text-red-800",
                                            status === "Con reclamo" && "border-pink-500 bg-pink-500/10 text-pink-700",
                                            status === "Devolución" && "border-pink-500 bg-pink-500/10 text-pink-700", // Added for Devolution badge
                                          )}
                                        >
                                          {status}
                                        </Badge>

                                        {hasActiveClaim(order) && (
                                          <Badge
                                            variant="outline"
                                            className="w-fit cursor-pointer border-pink-500 bg-pink-500/10 text-pink-700 hover:bg-pink-500/20"
                                            onClick={() => {
                                              setSelectedReturnOrder(order)
                                              setShowReturnDialog(true)
                                            }}
                                          >
                                            <AlertCircle className="mr-1 h-3 w-3" />
                                            Reclamo activo
                                          </Badge>
                                        )}

                                        {/* Badge de disponibilidad (solo para órdenes que lo requieren) */}
                                        {hasHandlingTime(order) &&
                                          (status === "Pendiente" ||
                                            status === "Esperando disponibilidad" ||
                                            status === "Demorado") && (
                                            <Badge
                                              variant="outline"
                                              className={cn(
                                                "w-fit",
                                                days !== null && days <= 0
                                                  ? "border-red-500 bg-red-500/10 text-red-700"
                                                  : "border-orange-500 bg-orange-500/10 text-orange-700",
                                              )}
                                            >
                                              <Clock className="mr-1 h-3 w-3" />
                                              Esperando
                                              {days !== null && (
                                                <span className="ml-1 font-semibold">
                                                  {days <= 0 ? "¡Vencido!" : `${days}d`}
                                                </span>
                                              )}
                                            </Badge>
                                          )}

                                        {/* Badge de subtipo de cancelación */}
                                        {status === "Cancelado" &&
                                          (() => {
                                            const subtype = getCancellationSubtype(order)
                                            if (!subtype) return null
                                            return (
                                              <Badge
                                                variant="outline"
                                                className="w-fit border-red-400 bg-red-400/10 text-red-600 text-xs"
                                              >
                                                {subtype}
                                              </Badge>
                                            )
                                          })()}

                                        {/* Botón de acción según el estado */}
                                        {getActionButton(order, status, days)}
                                      </div>
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "items")?.enabled && (
                                    <TableCell>
                                      <Badge variant="outline">{order.order_items?.length || 0} items</Badge>
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "total")?.enabled && (
                                    <TableCell className="font-mono">
                                      {order.currency_id} ${order.total_amount.toLocaleString()}
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "status")?.enabled && (
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        {getStatusBadge(order.status)}
                                        {order.payments && order.payments.length > 0 ? (
                                          getPaymentStatusBadge(order.payments[0].status)
                                        ) : (
                                          <Badge variant="outline" className="text-xs">
                                            Sin pago
                                          </Badge>
                                        )}
                                      </div>
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "date")?.enabled && (
                                    <TableCell>
                                      <div className="text-sm">{new Date(order.date_created).toLocaleDateString()}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {new Date(order.date_created).toLocaleTimeString()}
                                      </div>
                                    </TableCell>
                                  )}
                                  {visibleColumns.find((c) => c.id === "account")?.enabled && (
                                    <TableCell>
                                      {order._account ? (
                                        <button
                                          onClick={() => openMLOrder(order)}
                                          className="text-blue-500 hover:text-blue-600 hover:underline font-medium transition-colors"
                                          title="Abrir en MercadoLibre"
                                        >
                                          {order._account.nickname}
                                        </button>
                                      ) : (
                                        <span className="text-muted-foreground">N/A</span>
                                      )}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {/* Cambiando botón para usar logo de ML */}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 p-0"
                                        onClick={() => openMLOrder(order)}
                                        title="Ver en MercadoLibre"
                                      >
                                        <MLLogo className="h-4 w-4" />
                                      </Button>

                                      <Button variant="ghost" size="icon" onClick={() => viewOrderDetails(order)}>
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="border-t border-border/50 bg-muted/20 p-4">
                        <AdvancedPagination
                          currentPage={currentPage}
                          totalPages={totalPages}
                          onPageChange={setCurrentPage}
                          disabled={loading}
                          itemsPerPage={paging.limit}
                          totalItems={totalOrders} // Use totalOrders here
                          offset={paging.offset}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>

      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl">Orden #{selectedOrder?.id}</DialogTitle>
            <DialogDescription>Detalles de la orden</DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Estado de la Orden */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                  Estado de la Orden
                </h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Estado:</span>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fecha de Creación:</span>
                    <span className="font-medium">{new Date(selectedOrder.date_created).toLocaleString()}</span>
                  </div>
                  {selectedOrder.date_closed && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fecha de Cierre:</span>
                      <span className="font-medium">{new Date(selectedOrder.date_closed).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Información de Pago */}
              {selectedOrder.payments && selectedOrder.payments.length > 0 && (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    Información de Pago
                  </h3>
                  <div className="grid gap-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Estado:</span>
                      {getPaymentStatusBadge(selectedOrder.payments[0].status)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Método:</span>
                      <span className="font-medium capitalize">
                        {selectedOrder.payments[0].payment_type_id?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-semibold pt-2 border-t">
                      <span>Monto Total:</span>
                      <span className="text-green-600">
                        {selectedOrder.currency_id} ${selectedOrder.payments[0].transaction_amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Datos del Comprador */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  Datos del Comprador
                </h3>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Usuario:</span>
                    <span className="font-medium">@{selectedOrder.buyer.nickname}</span>
                  </div>
                  {selectedOrder.buyer.email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{selectedOrder.buyer.email}</span>
                    </div>
                  )}
                  {selectedOrder.buyer.phone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Teléfono:</span>
                      <span className="font-medium">
                        {selectedOrder.buyer.phone.area_code && `(${selectedOrder.buyer.phone.area_code}) `}
                        {selectedOrder.buyer.phone.number}
                      </span>
                    </div>
                  )}
                  {selectedOrder.buyer.first_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nombre:</span>
                      <span className="font-medium">
                        {selectedOrder.buyer.first_name} {selectedOrder.buyer.last_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items de la Orden */}
              <div className="space-y-3">
                <h3 className="font-semibold">Items de la Orden</h3>
                {selectedOrder.order_items.map((item, index) => (
                  <div key={index} className="bg-muted/50 p-4 rounded-lg">
                    <div className="flex gap-4">
                      {item.item.thumbnail && (
                        <img
                          src={item.item.thumbnail || "/placeholder.svg"}
                          alt={item.item.title}
                          className="w-20 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold mb-1">{item.item.title}</h4>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm text-muted-foreground">MLA: {item.item.id}</p>
                          {item.item.seller_sku && (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <code className="rounded bg-background px-2 py-0.5 text-xs font-mono border border-border/50">
                                SKU: {item.item.seller_sku}
                              </code>
                            </>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Precio Unitario:</span>
                            <p className="font-medium">
                              {selectedOrder.currency_id} ${item.unit_price.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cantidad:</span>
                            <p className="font-medium">{item.quantity}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="bg-primary/10 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">Total de la Orden:</span>
                  <span className="text-2xl font-bold text-primary">
                    {selectedOrder.currency_id} ${selectedOrder.total_amount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={mlBrowserModal && mlBrowserModal.open} onOpenChange={(open) => !open && setMlBrowserModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MLLogo className="h-6 w-6" />
              Abrir en MercadoLibre
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
              <p className="text-sm font-medium text-blue-900 mb-1">Cuenta: {mlBrowserModal?.accountNickname}</p>
              {mlBrowserModal?.browserPreference && (
                <p className="text-sm text-blue-700">
                  Navegador recomendado: <span className="font-semibold">{mlBrowserModal.browserPreference}</span>
                </p>
              )}
            </div>

            {mlBrowserModal?.browserPreference ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Para evitar conflictos entre cuentas, abrí esta orden en el navegador configurado para esta cuenta.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      copyToClipboard(mlBrowserModal.url)
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Copiar URL
                  </Button>
                  <Button
                    onClick={() => {
                      window.open(mlBrowserModal.url, "_blank")
                      setMlBrowserModal(null)
                    }}
                    className="w-full"
                  >
                    Abrir de todas formas
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  No hay navegador configurado para esta cuenta. Podés configurarlo en la sección de cuentas de
                  MercadoLibre.
                </p>
                <Button
                  onClick={() => {
                    window.open(mlBrowserModal.url, "_blank")
                    setMlBrowserModal(null)
                  }}
                  className="w-full"
                >
                  Abrir en navegador actual
                </Button>
              </div>
            )}

            <div className="text-xs text-gray-500 pt-2 border-t">
              <p className="font-medium mb-1">💡 Tip: Configurá navegadores por cuenta</p>
              <p>Usá diferentes navegadores o perfiles para cada cuenta de ML:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Chrome Perfil 1 para Cuenta A</li>
                <li>Firefox para Cuenta B</li>
                <li>Chrome Incognito para Cuenta C</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={returnDetailsOpen} onOpenChange={setReturnDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de la Devolución</DialogTitle>
            <DialogDescription>Información sobre el estado de la devolución y el envío de retorno</DialogDescription>
          </DialogHeader>

          {loadingReturnDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : returnDetails ? (
            <div className="space-y-6">
              {/* Return Status */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Estado de la Devolución</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <Badge variant="outline" className="mt-1">
                      {getReturnStatusLabel(returnDetails.status)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estado del Dinero</p>
                    <Badge
                      variant="outline"
                      className={`mt-1 ${
                        returnDetails.status_money === "refunded"
                          ? "bg-green-100 text-green-900 border-green-300"
                          : returnDetails.status_money === "retained"
                            ? "bg-yellow-100 text-yellow-900 border-yellow-300"
                            : "bg-gray-100 text-gray-900 border-gray-300"
                      }`}
                    >
                      {getReturnMoneyStatusLabel(returnDetails.status_money)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="text-sm font-medium mt-1">{returnDetails.type}</p>
                  </div>
                  {returnDetails.refund_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Reembolso en</p>
                      <p className="text-sm font-medium mt-1">{returnDetails.refund_at}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping Status */}
              {returnDetails.shipping && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Estado del Envío de Retorno</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Estado del Envío</p>
                      <Badge
                        variant="outline"
                        className={`mt-1 ${
                          returnDetails.shipping.status === "delivered"
                            ? "bg-green-100 text-green-900 border-green-300"
                            : returnDetails.shipping.status === "shipped"
                              ? "bg-blue-100 text-blue-900 border-blue-300"
                              : "bg-gray-100 text-gray-900 border-gray-300"
                        }`}
                      >
                        {getReturnStatusLabel(returnDetails.shipping.status)}
                      </Badge>
                    </div>
                    {returnDetails.shipping.tracking_number && (
                      <div>
                        <p className="text-xs text-muted-foreground">Número de Seguimiento</p>
                        <p className="text-sm font-mono mt-1">{returnDetails.shipping.tracking_number}</p>
                      </div>
                    )}
                  </div>

                  {/* Shipping History */}
                  {returnDetails.shipping.status_history && returnDetails.shipping.status_history.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground mb-2">Historial de Estados</p>
                      <div className="space-y-2">
                        {returnDetails.shipping.status_history.map((history, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="font-medium">{getReturnStatusLabel(history.status)}</span>
                            <span className="text-muted-foreground">
                              {new Date(history.date).toLocaleDateString()} -{" "}
                              {new Date(history.date).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dates */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Fechas</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Fecha de Creación</p>
                    <p className="text-sm mt-1">
                      {new Date(returnDetails.date_created).toLocaleDateString()} -{" "}
                      {new Date(returnDetails.date_created).toLocaleTimeString()}
                    </p>
                  </div>
                  {returnDetails.date_closed && (
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha de Cierre</p>
                      <p className="text-sm mt-1">
                        {new Date(returnDetails.date_closed).toLocaleDateString()} -{" "}
                        {new Date(returnDetails.date_closed).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Alert for delivered returns */}
              {returnDetails.shipping?.status === "delivered" && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    El producto devuelto ha sido entregado. Verifica que el producto esté en buenas condiciones.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudieron cargar los detalles de la devolución.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalles del Reclamo</DialogTitle>
            <DialogDescription>Revisa la información detallada del reclamo activo.</DialogDescription>
          </DialogHeader>

          {selectedReturnOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <p className="font-medium">Orden: #{selectedReturnOrder.id}</p>
                <p className="text-sm text-muted-foreground">Cliente: {selectedReturnOrder.buyer.nickname}</p>
                <Separator className="my-2" />
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Tipo de Reclamo:</span>
                  <p className="text-sm font-medium">
                    {selectedReturnOrder.claim_id ? `Reclamo ID: ${selectedReturnOrder.claim_id}` : "N/A"}
                  </p>
                  {selectedReturnOrder.cancel_detail && (
                    <>
                      <span className="text-xs text-muted-foreground">Detalle de Cancelación:</span>
                      <p className="text-sm font-medium">
                        {selectedReturnOrder.cancel_detail.description} (
                        {selectedReturnOrder.cancel_detail.requested_by === "buyer" ? "Comprador" : "Vendedor"})
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Action Button to fetch return details */}
              <Button
                variant="outline"
                className="w-full bg-transparent"
                onClick={() => selectedReturnOrder.claim_id && fetchReturnDetails(selectedReturnOrder.claim_id)}
                disabled={loadingReturnDetails}
              >
                {loadingReturnDetails ? (
                  <>
                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                    Cargando detalles...
                  </>
                ) : (
                  <>
                    <Eye className="mr-1 h-3 w-3" />
                    Ver detalles de la devolución
                  </>
                )}
              </Button>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowReturnDialog(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeliveryConfirmDialog} onOpenChange={setShowDeliveryConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar orden como entregada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto notificará a MercadoLibre que la orden ha sido entregada al comprador. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMarkingDelivered}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkAsDelivered}
              disabled={isMarkingDelivered}
              className="bg-green-600 hover:bg-green-700"
            >
              {isMarkingDelivered ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Marcando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Sí, marcar como entregada
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!confirmMarkReceived} onOpenChange={() => setConfirmMarkReceived(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Disponibilidad del Producto</DialogTitle>
            <DialogDescription>
              ¿Ya tienes el producto listo para enviar? Esta acción marcará el producto como disponible en MercadoLibre.
            </DialogDescription>
          </DialogHeader>

          {confirmMarkReceived?.orderDetails && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Orden:</span>
                    <span className="font-mono font-semibold">#{confirmMarkReceived.orderDetails.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-medium">{confirmMarkReceived.orderDetails.buyer.nickname}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Producto:</span>
                    <p className="text-sm font-medium">{confirmMarkReceived.orderDetails.order_items[0].item.title}</p>
                    {confirmMarkReceived.orderDetails.order_items[0].item.seller_custom_field && (
                      <p className="text-xs text-muted-foreground mt-1">
                        SKU:{" "}
                        <span className="font-mono font-semibold">
                          {confirmMarkReceived.orderDetails.order_items[0].item.seller_custom_field}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="flex gap-2">
                  <div className="shrink-0">
                    <div className="rounded-full bg-blue-500 p-1">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  </div>
                  <div className="text-xs text-blue-900">
                    <p className="font-semibold mb-1">¿Qué sucederá después?</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>El producto se marcará como "listo para enviar"</li>
                      <li>La etiqueta de envío estará disponible</li>
                      <li>Podrás imprimir la etiqueta desde la sección de envíos</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setConfirmMarkReceived(null)}>
                  Cancelar
                </Button>
                <Button onClick={confirmAndMarkReceived} className="bg-blue-600 hover:bg-blue-700">
                  <Check className="mr-2 h-4 w-4" />
                  Sí, tengo el producto
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function getStatusBadge(status: string) {
  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> =
    {
      paid: { variant: "default", label: "Pagado" },
      confirmed: { variant: "default", label: "Confirmado" },
      payment_required: { variant: "outline", label: "Pago Requerido" },
      payment_in_process: { variant: "outline", label: "Pago en Proceso" },
      cancelled: { variant: "destructive", label: "Cancelado" },
      invalid: { variant: "destructive", label: "Inválido" },
    }

  const config = statusConfig[status] || { variant: "secondary" as const, label: status }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function getPaymentStatusBadge(status: string) {
  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> =
    {
      approved: { variant: "default", label: "Aprobado" },
      pending: { variant: "outline", label: "Pendiente" },
      in_process: { variant: "outline", label: "En Proceso" },
      rejected: { variant: "destructive", label: "Rechazado" },
      cancelled: { variant: "destructive", label: "Cancelado" },
      refunded: { variant: "secondary", label: "Reembolsado" },
    }

  const config = statusConfig[status] || { variant: "secondary" as const, label: status }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
