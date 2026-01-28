"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { AdvancedPagination } from "@/components/advanced-pagination"

import { MLConnectionStatus } from "@/components/ml-connection-status"
import { LastUpdated } from "@/components/last-updated"
import { SortSelector } from "@/components/sort-selector"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

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
    <polyline points="20 6 9 17 4 12" />
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
    <polyline points="6 9 12 15 18 9" />
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
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" x2="21" y1="14" y2="3" />
  </svg>
)

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

const CreditCard = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </svg>
)

const DollarSign = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="12" x2="12" y1="2" y2="22" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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

const TrendingUp = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
)

interface Payment {
  id: number
  order_id: number
  status: string
  status_detail: string
  transaction_amount: number
  currency_id: string
  date_created: string
  date_approved?: string
  date_released?: string
  money_release_date?: string
  money_release_status?: string
  payment_method_id: string
  payment_type_id: string
  installments: number
  transaction_amount_refunded: number
  shipping_cost: number
  marketplace_fee: number
  coupon_amount: number
  taxes_amount: number
  net_received_amount: number
  collector_id: number
  payer?: {
    id: number
    email: string
    nickname: string
  }
  order?: {
    id: number
    type: string
  }
  _account?: {
    nickname: string
  }
}

interface PagingInfo {
  total: number
  limit: number
  offset: number
}

interface Stats {
  total_payments: number
  approved_payments: number
  pending_payments: number
  total_amount: number
  released_amount: number
  pending_release_amount: number
  total_fees: number
  net_amount: number
}

export default function PagosPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState<PagingInfo>({ total: 0, limit: 50, offset: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [showPaymentDetails, setShowPaymentDetails] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)

  const [mlAccounts, setMlAccounts] = useState<Record<string, any>>({})
  const [selectedAccount, setSelectedAccount] = useState<string>("all")

  const [filters, setFilters] = useState({
    status: "all",
    release_status: "all",
    date_from: "",
    date_to: "",
    payment_method: "all",
    timeFilter: "all", // Cambiado de "1month" a "all" como valor por defecto
  })

  const [sortConfig, setSortConfig] = useState<{
    key: string
    direction: "asc" | "desc"
  }>({ key: "date", direction: "desc" })

  const [stats, setStats] = useState<Stats>({
    total_payments: 0,
    approved_payments: 0,
    pending_payments: 0,
    total_amount: 0,
    released_amount: 0,
    pending_release_amount: 0,
    total_fees: 0,
    net_amount: 0,
  })

  const fetchMlAccounts = async () => {
    try {
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()

      const accountsMap: Record<string, any> = {}
      if (data.accounts && Array.isArray(data.accounts)) {
        data.accounts.forEach((account: any) => {
          accountsMap[account.id] = account
        })
      }
      setMlAccounts(accountsMap)
    } catch (error) {
      console.error("[v0] Failed to fetch ML accounts:", error)
    }
  }

  useEffect(() => {
    fetchMlAccounts()
  }, [])

  const filterByTimeRange = useCallback(
    (payment: Payment) => {
      if (filters.timeFilter === "all") return true

      const now = new Date()
      const paymentDate = new Date(payment.date_created)
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

      return paymentDate >= dateFrom
    },
    [filters.timeFilter],
  )

  useEffect(() => {
    loadPayments()
  }, [selectedAccount])

  async function loadPayments() {
    try {
      console.log("[v0] loadPayments - Starting")
      setLoading(true)
      const params = new URLSearchParams({
        limit: "200", // Aumentado para obtener más pagos
        offset: "0",
      })

      if (selectedAccount && selectedAccount !== "all") {
        params.append("account_id", selectedAccount)
      }

      console.log("[v0] loadPayments - Fetching with params:", params.toString())
      const response = await fetch(`/api/mercadolibre/payments?${params}`)

      console.log("[v0] loadPayments - Response status:", response.status)
      if (!response.ok) {
        throw new Error("Failed to fetch payments")
      }

      const data = await response.json()
      console.log("[v0] loadPayments - Received data:", {
        paymentsCount: data.payments?.length || 0,
        total: data.paging?.total || 0,
      })

      setPayments(data.payments || [])
      setPaging(data.paging || { total: 0, limit: 50, offset: 0 })
      setLastUpdated(new Date())

      calculateStats(data.payments || [])
    } catch (error) {
      console.error("[v0] Error loading payments:", error)
    } finally {
      setLoading(false)
    }
  }

  function calculateStats(paymentsList: Payment[]) {
    const filteredPayments = paymentsList.filter(filterByTimeRange)

    const newStats: Stats = {
      total_payments: filteredPayments.length,
      approved_payments: filteredPayments.filter((p) => p.status === "approved").length,
      pending_payments: filteredPayments.filter((p) => p.status === "pending" || p.status === "in_process").length,
      total_amount: filteredPayments.reduce((sum, p) => sum + (p.transaction_amount || 0), 0),
      released_amount: filteredPayments
        .filter((p) => p.money_release_status === "released")
        .reduce((sum, p) => sum + (p.net_received_amount || 0), 0),
      pending_release_amount: filteredPayments
        .filter((p) => p.money_release_status === "pending")
        .reduce((sum, p) => sum + (p.net_received_amount || 0), 0),
      total_fees: filteredPayments.reduce((sum, p) => sum + (p.marketplace_fee || 0), 0),
      net_amount: filteredPayments.reduce((sum, p) => sum + (p.net_received_amount || 0), 0),
    }
    setStats(newStats)
  }

  useEffect(() => {
    calculateStats(payments)
  }, [filters.timeFilter, payments])

  const filteredPayments = useMemo(() => {
    let filtered = payments

    // Filtro de tiempo
    filtered = filtered.filter(filterByTimeRange)

    // Filtro de estado
    if (filters.status !== "all") {
      filtered = filtered.filter((p) => p.status === filters.status)
    }

    // Filtro de estado de liberación
    if (filters.release_status !== "all") {
      filtered = filtered.filter((p) => p.money_release_status === filters.release_status)
    }

    // Filtro de método de pago
    if (filters.payment_method !== "all") {
      filtered = filtered.filter((p) => p.payment_type_id === filters.payment_method)
    }

    // Filtros de fecha específicos
    if (filters.date_from) {
      const dateFrom = new Date(filters.date_from)
      filtered = filtered.filter((p) => new Date(p.date_created) >= dateFrom)
    }
    if (filters.date_to) {
      const dateTo = new Date(filters.date_to)
      dateTo.setDate(dateTo.getDate() + 1)
      filtered = filtered.filter((p) => new Date(p.date_created) < dateTo)
    }

    return filtered
  }, [payments, filters, filterByTimeRange])

  async function viewPaymentDetails(payment: Payment) {
    setSelectedPayment(payment)
    setShowPaymentDetails(true)
  }

  async function viewOrderDetails(orderId: number) {
    try {
      console.log("[v0] Fetching order details for:", orderId)
      const response = await fetch(`/api/mercadolibre/orders?order_id=${orderId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch order details")
      }
      const data = await response.json()
      console.log("[v0] Order details response:", data)

      if (data.orders && data.orders.length > 0) {
        setSelectedOrder(data.orders[0])
        setShowOrderDetails(true)
      } else {
        console.error("[v0] No order found with ID:", orderId)
        alert("No se encontró la orden")
      }
    } catch (error) {
      console.error("[v0] Error fetching order details:", error)
      alert("Error al cargar los detalles de la orden")
    }
  }

  async function exportToCSV() {
    try {
      const csvRows = []
      const headers = [
        "ID Pago",
        "Orden",
        "Estado",
        "Monto",
        "Comisión",
        "Neto",
        "Método",
        "Fecha Pago",
        "Fecha Liberación",
        "Estado Liberación",
      ]
      csvRows.push(headers.join(","))

      filteredPayments.forEach((payment) => {
        const row = [
          payment.id,
          payment.order_id,
          payment.status,
          payment.transaction_amount,
          payment.marketplace_fee,
          payment.net_received_amount,
          payment.payment_method_id,
          new Date(payment.date_created).toLocaleDateString(),
          payment.money_release_date ? new Date(payment.money_release_date).toLocaleDateString() : "Pendiente",
          payment.money_release_status || "N/A",
        ]
        csvRows.push(row.join(","))
      })

      const csvContent = csvRows.join("\n")
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `pagos_${new Date().toISOString().split("T")[0]}.csv`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error exporting to CSV:", error)
      alert("Error al exportar datos")
    }
  }

  function getPaymentStatusBadge(status: string) {
    const statusConfig: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
    > = {
      approved: { label: "Aprobado", variant: "secondary" },
      pending: { label: "Pendiente", variant: "outline" },
      in_process: { label: "En Proceso", variant: "default" },
      rejected: { label: "Rechazado", variant: "destructive" },
      cancelled: { label: "Cancelado", variant: "destructive" },
      refunded: { label: "Reembolsado", variant: "outline" },
    }

    const config = statusConfig[status] || { label: status, variant: "outline" }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  function getReleaseStatusBadge(status?: string) {
    if (!status) return <Badge variant="outline">N/A</Badge>

    const statusConfig: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
    > = {
      released: { label: "Liberado", variant: "secondary" },
      pending: { label: "Pendiente", variant: "default" },
      blocked: { label: "Retenido", variant: "destructive" },
    }

    const config = statusConfig[status] || { label: status, variant: "outline" }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const totalPages = Math.ceil(filteredPayments.length / 50)
  const paginatedPayments = filteredPayments.slice((currentPage - 1) * 50, currentPage * 50)

  const handleSortChange = (key: string, direction: "asc" | "desc") => {
    setSortConfig({ key, direction })
  }

  const sortedPayments = [...paginatedPayments].sort((a, b) => {
    const { key, direction } = sortConfig
    const multiplier = direction === "asc" ? 1 : -1

    if (key === "date") {
      return multiplier * (new Date(a.date_created).getTime() - new Date(b.date_created).getTime())
    }
    if (key === "amount") {
      return multiplier * (a.transaction_amount - b.transaction_amount)
    }
    if (key === "order") {
      return multiplier * (a.order_id - b.order_id)
    }
    if (key === "status") {
      return multiplier * a.status.localeCompare(b.status)
    }
    if (key === "release_date") {
      const dateA = a.money_release_date ? new Date(a.money_release_date).getTime() : 0
      const dateB = b.money_release_date ? new Date(b.money_release_date).getTime() : 0
      return multiplier * (dateA - dateB)
    }

    return 0
  })

  const sortOptions = [
    { value: "date", label: "Fecha de Pago" },
    { value: "amount", label: "Monto" },
    { value: "order", label: "Orden" },
    { value: "status", label: "Estado" },
    { value: "release_date", label: "Fecha de Liberación" },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Ecommerce Manager</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Pagos</h2>
            <p className="text-muted-foreground">
              {filteredPayments.length > 0
                ? `${filteredPayments.length.toLocaleString()} pagos en total`
                : "Gestiona tus pagos de Mercado Libre"}
              {selectedAccount !== "all" && mlAccounts[selectedAccount] && (
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
            <Button onClick={loadPayments} disabled={loading} variant="outline" className="shadow-sm bg-transparent">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            <Button
              variant="outline"
              onClick={exportToCSV}
              disabled={filteredPayments.length === 0}
              className="shadow-sm bg-transparent"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cobrado</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats.total_amount || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
              </div>
              <p className="text-xs text-muted-foreground">{stats.approved_payments || 0} pagos aprobados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Dinero Liberado</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {(stats.released_amount || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
              </div>
              <p className="text-xs text-muted-foreground">Disponible en tu cuenta</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendiente de Liberar</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                {payments.filter((p) => p.money_release_status === "pending" && filterByTimeRange(p)).length} pagos
                pendientes
              </p>
              <div className="text-2xl font-bold text-orange-600">
                {(stats.pending_release_amount || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
              </div>
              <p className="text-xs text-muted-foreground">En proceso de liberación</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comisiones</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats.total_fees || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
              </div>
              <p className="text-xs text-muted-foreground">Total de comisiones</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-border/50 shadow-sm hover:shadow-md transition-shadow">
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
                <LastUpdated timestamp={lastUpdated} isLoading={loading} onRefresh={loadPayments} />
                <MLConnectionStatus accountId={selectedAccount} onRefresh={loadPayments} refreshing={loading} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 space-y-4">
          <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
              <CardTitle className="text-base font-semibold">Período de Tiempo</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filters.timeFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilters({ ...filters, timeFilter: "all" })}
                  className="shadow-sm"
                >
                  {filters.timeFilter === "all" && <Check className="mr-2 h-4 w-4" />}
                  Todas
                </Button>
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

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Estado del Pago</Label>
                    <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los estados</SelectItem>
                        <SelectItem value="approved">Aprobado</SelectItem>
                        <SelectItem value="pending">Pendiente</SelectItem>
                        <SelectItem value="in_process">En Proceso</SelectItem>
                        <SelectItem value="rejected">Rechazado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                        <SelectItem value="refunded">Reembolsado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Estado de Liberación</Label>
                    <Select
                      value={filters.release_status}
                      onValueChange={(v) => setFilters({ ...filters, release_status: v })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="released">Liberado</SelectItem>
                        <SelectItem value="pending">Pendiente</SelectItem>
                        <SelectItem value="blocked">Retenido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Método de Pago</Label>
                    <Select
                      value={filters.payment_method}
                      onValueChange={(v) => setFilters({ ...filters, payment_method: v })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="credit_card">Tarjeta de Crédito</SelectItem>
                        <SelectItem value="debit_card">Tarjeta de Débito</SelectItem>
                        <SelectItem value="account_money">Dinero en Cuenta</SelectItem>
                        <SelectItem value="ticket">Efectivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </div>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Lista de Pagos</CardTitle>
                <CardDescription>
                  {loading
                    ? "Cargando..."
                    : `Mostrando ${sortedPayments.length} pagos (Página ${currentPage} de ${totalPages})`}
                </CardDescription>
              </div>
              <SortSelector
                options={sortOptions}
                value={sortConfig.key}
                direction={sortConfig.direction}
                onSortChange={handleSortChange}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
                Cargando pagos...
              </div>
            ) : sortedPayments.length === 0 ? (
              <div className="flex h-[400px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="h-12 w-12 opacity-20" />
                <p>No hay pagos disponibles.</p>
                <p className="text-xs">Los pagos aparecerán aquí cuando realices ventas.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Pago</TableHead>
                      <TableHead>Orden</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Monto Bruto</TableHead>
                      <TableHead>Comisión ML</TableHead>
                      <TableHead>Envío</TableHead>
                      <TableHead>Impuestos</TableHead>
                      <TableHead>Reembolsos</TableHead>
                      <TableHead className="font-semibold">Neto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Liberación</TableHead>
                      <TableHead>Fecha Liberación</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">#{payment.id}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => viewOrderDetails(payment.order_id)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            #{payment.order_id}
                            <Eye className="h-3 w-3" />
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{payment._account?.nickname || "N/A"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {(payment.transaction_amount || 0).toLocaleString("es-AR", {
                              style: "currency",
                              currency: payment.currency_id || "ARS",
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-red-600">
                            -{" "}
                            {(payment.marketplace_fee || 0).toLocaleString("es-AR", {
                              style: "currency",
                              currency: payment.currency_id || "ARS",
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {payment.shipping_cost > 0
                              ? (payment.shipping_cost || 0).toLocaleString("es-AR", {
                                  style: "currency",
                                  currency: payment.currency_id || "ARS",
                                })
                              : "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-red-600">
                            {payment.taxes_amount > 0
                              ? `- ${(payment.taxes_amount || 0).toLocaleString("es-AR", {
                                  style: "currency",
                                  currency: payment.currency_id || "ARS",
                                })}`
                              : "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-red-600">
                            {payment.transaction_amount_refunded > 0
                              ? `- ${(payment.transaction_amount_refunded || 0).toLocaleString("es-AR", {
                                  style: "currency",
                                  currency: payment.currency_id || "ARS",
                                })}`
                              : "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-green-600">
                            {(payment.net_received_amount || 0).toLocaleString("es-AR", {
                              style: "currency",
                              currency: payment.currency_id || "ARS",
                            })}
                          </div>
                        </TableCell>
                        <TableCell>{getPaymentStatusBadge(payment.status)}</TableCell>
                        <TableCell>{getReleaseStatusBadge(payment.money_release_status)}</TableCell>
                        <TableCell>
                          {payment.money_release_date ? (
                            <div className="text-sm">
                              <div>{new Date(payment.money_release_date).toLocaleDateString()}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(payment.money_release_date).toLocaleTimeString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Pendiente</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => viewPaymentDetails(payment)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalPages > 1 && (
                  <AdvancedPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    disabled={loading}
                    itemsPerPage={50}
                    totalItems={filteredPayments.length}
                    offset={(currentPage - 1) * 50}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
