"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { AdvancedPagination } from "@/components/advanced-pagination"
import { RefreshCw, Filter, Download, Package, Eye, Calendar, Truck, Printer, MapPin, Clock } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { MLConnectionStatus } from "@/components/ml-connection-status"
import { LastUpdated } from "@/components/last-updated"
import { SortSelector } from "@/components/sort-selector"
import { ShipmentTrackingTimeline } from "@/components/shipment-tracking-timeline"

interface Shipment {
  id: number
  order_id: number
  status: string
  substatus: string
  status_history: {
    date_shipped?: string
    date_delivered?: string
    date_first_visit?: string
  }
  date_created: string
  last_updated: string
  tracking_number?: string
  tracking_method?: string
  service_id?: number
  shipping_mode?: string // ME1, ME2, custom
  shipment_type?: string
  sender_address?: {
    address_line: string
    city: { name: string }
    state: { name: string }
    zip_code: string
  }
  receiver_address?: {
    address_line: string
    city: { name: string }
    state: { name: string }
    zip_code: string
    receiver_name: string
    receiver_phone: string
  }
  shipping_items?: Array<{
    id: string
    description: string
    quantity: number
  }>
  shipping_option?: {
    name: string
    shipping_method_id: number
  }
  has_label?: boolean
  buyer?: {
    id: number
    nickname: string
  }
  items?: Array<{
    item: {
      id: string
      title: string
    }
    quantity: number
  }>
  total_amount?: number
  cost?: number
}

interface PagingInfo {
  total: number
  limit: number
  offset: number
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState<PagingInfo>({ total: 0, limit: 50, offset: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [showShipmentDetails, setShowShipmentDetails] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const [selectedShipments, setSelectedShipments] = useState<Set<number>>(new Set())
  const [printingLabels, setPrintingLabels] = useState(false)

  const [mlAccounts, setMlAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>("all")

  const [filters, setFilters] = useState({
    status: "all",
    shipping_mode: "all",
    date_from: "",
    date_to: "",
    label_status: "all",
    has_tracking: "all",
  })

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [sortConfig, setSortConfig] = useState<{
    key: string
    direction: "asc" | "desc"
  }>({ key: "date", direction: "desc" })

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    ready_to_ship: 0,
    shipped: 0,
    delivered: 0,
    with_label: 0,
    without_label: 0,
  })

  useEffect(() => {
    if (shipments.length > 0) {
      const uniqueStatuses = new Set<string>()
      const uniqueSubstatuses = new Set<string>()
      const uniqueModes = new Set<string>()
      const statusCombinations = new Map<string, Set<string>>()

      shipments.forEach((shipment) => {
        // Registrar status
        if (shipment.status) {
          uniqueStatuses.add(shipment.status)
        }

        // Registrar substatus
        if (shipment.substatus && shipment.substatus !== "null") {
          uniqueSubstatuses.add(shipment.substatus)
        }

        // Registrar modo de envío
        if (shipment.shipping_mode) {
          uniqueModes.add(shipment.shipping_mode)
        }

        // Registrar combinaciones status + substatus
        if (shipment.status) {
          if (!statusCombinations.has(shipment.status)) {
            statusCombinations.set(shipment.status, new Set())
          }
          if (shipment.substatus && shipment.substatus !== "null") {
            statusCombinations.get(shipment.status)?.add(shipment.substatus)
          }
        }
      })

      console.log("[v0] ===== ANÁLISIS DE ESTADOS DE ENVÍOS =====")
      console.log("[v0] Total de envíos analizados:", shipments.length)
      console.log("[v0] Estados únicos encontrados:", Array.from(uniqueStatuses).sort())
      console.log("[v0] Subestados únicos encontrados:", Array.from(uniqueSubstatuses).sort())
      console.log("[v0] Modos de envío únicos:", Array.from(uniqueModes).sort())
      console.log("[v0] Combinaciones status + substatus:")
      statusCombinations.forEach((substatuses, status) => {
        console.log(`[v0]   ${status}:`, Array.from(substatuses).sort())
      })
      console.log("[v0] ==========================================")
    }
  }, [shipments])

  const fetchMlAccounts = async () => {
    try {
      const response = await fetch("/api/mercadolibre/accounts")
      const data = await response.json()
      setMlAccounts(data.accounts || [])
    } catch (error) {
      console.error("[v0] Failed to fetch ML accounts:", error)
    }
  }

  useEffect(() => {
    fetchMlAccounts()
  }, [])

  useEffect(() => {
    loadShipments()
  }, [currentPage, filters, selectedAccount])

  async function loadShipments() {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: "50",
        offset: ((currentPage - 1) * 50).toString(),
      })

      if (selectedAccount && selectedAccount !== "all") {
        params.append("account_id", selectedAccount)
      }

      if (filters.status !== "all") params.append("status", filters.status)
      if (filters.shipping_mode !== "all") params.append("shipping_mode", filters.shipping_mode)
      if (filters.date_from) params.append("date_from", filters.date_from)
      if (filters.date_to) params.append("date_to", filters.date_to)
      if (filters.label_status !== "all") params.append("label_status", filters.label_status)
      if (filters.has_tracking !== "all") params.append("has_tracking", filters.has_tracking)

      const response = await fetch(`/api/mercadolibre/shipments?${params}`)

      if (!response.ok) {
        throw new Error("Failed to fetch shipments")
      }

      const data = await response.json()

      setShipments(data.shipments || [])
      setPaging(data.paging || { total: 0, limit: 50, offset: 0 })
      setSelectedShipments(new Set())
      setLastUpdated(new Date())

      calculateStats(data.shipments || [])
    } catch (error) {
      console.error("Error loading shipments:", error)
    } finally {
      setLoading(false)
    }
  }

  function calculateStats(shipmentsList: Shipment[]) {
    const newStats = {
      total: shipmentsList.length,
      pending: shipmentsList.filter((s) => s.status === "pending" || s.status === "handling").length,
      ready_to_ship: shipmentsList.filter((s) => s.status === "ready_to_ship").length,
      shipped: shipmentsList.filter((s) => s.status === "shipped").length,
      delivered: shipmentsList.filter((s) => s.status === "delivered").length,
      with_label: shipmentsList.filter((s) => s.has_label).length,
      without_label: shipmentsList.filter((s) => !s.has_label && s.status !== "cancelled").length,
    }
    setStats(newStats)
  }

  async function viewShipmentDetails(shipment: Shipment) {
    setSelectedShipment(shipment)
    setShowShipmentDetails(true)
  }

  async function printLabel(shipmentId: number) {
    try {
      setPrintingLabels(true)
      const response = await fetch(`/api/mercadolibre/shipments/${shipmentId}/label`)
      if (response.ok) {
        const data = await response.json()
        if (data.url) {
          window.open(data.url, "_blank")
        } else {
          alert("No se pudo obtener la URL de la etiqueta")
        }
      } else {
        const error = await response.json()
        alert(`Error: ${error.details || "No se pudo obtener la etiqueta"}`)
      }
    } catch (error) {
      console.error("Error printing label:", error)
      alert("Error al obtener la etiqueta de envío")
    } finally {
      setPrintingLabels(false)
    }
  }

  async function printBulkLabels() {
    if (selectedShipments.size === 0) {
      alert("Selecciona al menos un envío para imprimir etiquetas")
      return
    }

    try {
      setPrintingLabels(true)
      const shipmentIds = Array.from(selectedShipments)

      for (const shipmentId of shipmentIds) {
        const response = await fetch(`/api/mercadolibre/shipments/${shipmentId}/label`)
        if (response.ok) {
          const data = await response.json()
          if (data.url) {
            window.open(data.url, "_blank")
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }
      }

      alert(`Se abrieron ${shipmentIds.length} etiquetas en nuevas pestañas`)
      setSelectedShipments(new Set())
    } catch (error) {
      console.error("Error printing bulk labels:", error)
      alert("Error al imprimir etiquetas en lote")
    } finally {
      setPrintingLabels(false)
    }
  }

  async function exportToCSV() {
    try {
      const csvRows = []
      const headers = [
        "ID Envío",
        "Orden",
        "Estado",
        "Destinatario",
        "Ciudad",
        "Tracking",
        "Método",
        "Fecha Creación",
        "Fecha Envío",
        "Fecha Entrega",
      ]
      csvRows.push(headers.join(","))

      shipments.forEach((shipment) => {
        const row = [
          shipment.id,
          shipment.order_id,
          shipment.status,
          shipment.receiver_address?.receiver_name || "",
          shipment.receiver_address?.city?.name || "",
          shipment.tracking_number || "",
          shipment.shipping_option?.name || "",
          new Date(shipment.date_created).toLocaleDateString(),
          shipment.status_history.date_shipped
            ? new Date(shipment.status_history.date_shipped).toLocaleDateString()
            : "",
          shipment.status_history.date_delivered
            ? new Date(shipment.status_history.date_delivered).toLocaleDateString()
            : "",
        ]
        csvRows.push(row.join(","))
      })

      const csvContent = csvRows.join("\n")
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `envios_${new Date().toISOString().split("T")[0]}.csv`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error exporting to CSV:", error)
      alert("Error al exportar datos")
    }
  }

  function toggleShipmentSelection(shipmentId: number) {
    const newSelection = new Set(selectedShipments)
    if (newSelection.has(shipmentId)) {
      newSelection.delete(shipmentId)
    } else {
      newSelection.add(shipmentId)
    }
    setSelectedShipments(newSelection)
  }

  function toggleAllShipments() {
    if (selectedShipments.size === shipments.length) {
      setSelectedShipments(new Set())
    } else {
      const allIds = shipments.filter((s) => s.status !== "pending" && s.status !== "cancelled").map((s) => s.id)
      setSelectedShipments(new Set(allIds))
    }
  }

  function getShipmentStatus(shipment: Shipment): {
    status: string
    priority: number
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
    description: string
  } {
    const status = shipment.status
    const substatus = shipment.substatus

    // PRIORITY 1: Delivered (highest priority - completed)
    if (status === "delivered") {
      return {
        status: "delivered",
        priority: 1,
        label: "Entregado",
        variant: "secondary",
        description: "El paquete fue entregado exitosamente",
      }
    }

    // PRIORITY 2: Cancelled
    if (status === "cancelled") {
      return {
        status: "cancelled",
        priority: 2,
        label: "Cancelado",
        variant: "destructive",
        description: "El envío fue cancelado",
      }
    }

    // PRIORITY 3: Delivery problems
    if (status === "not_delivered") {
      if (substatus === "returning_to_sender") {
        return {
          status: "returning",
          priority: 3,
          label: "Regresando al Remitente",
          variant: "destructive",
          description: "El paquete está siendo devuelto",
        }
      }
      return {
        status: "not_delivered",
        priority: 3,
        label: "No Entregado",
        variant: "destructive",
        description: "Hubo un problema con la entrega",
      }
    }

    // PRIORITY 4: In transit (shipped)
    if (status === "shipped") {
      if (substatus === "ready_for_pickup") {
        return {
          status: "ready_for_pickup",
          priority: 4,
          label: "En Punto de Retiro",
          variant: "default",
          description: "Disponible para recoger",
        }
      }
      if (substatus === "out_for_delivery") {
        return {
          status: "out_for_delivery",
          priority: 4,
          label: "En Camino para Entrega",
          variant: "default",
          description: "El paquete está en camino",
        }
      }
      return {
        status: "shipped",
        priority: 4,
        label: "En Tránsito",
        variant: "default",
        description: "El paquete ha sido enviado",
      }
    }

    // PRIORITY 5: Ready to ship
    if (status === "ready_to_ship") {
      if (substatus === "printed") {
        return {
          status: "printed",
          priority: 5,
          label: "Etiqueta Impresa",
          variant: "default",
          description: "Etiqueta impresa, listo para despachar",
        }
      }
      return {
        status: "ready_to_ship",
        priority: 5,
        label: "Listo para Enviar",
        variant: "default",
        description: "Producto listo para envío",
      }
    }

    // PRIORITY 6: Handling (preparing)
    if (status === "handling") {
      return {
        status: "handling",
        priority: 6,
        label: "Preparando",
        variant: "outline",
        description: "Vendedor está preparando el paquete",
      }
    }

    // PRIORITY 7: Pending
    if (status === "pending") {
      return {
        status: "pending",
        priority: 7,
        label: "Pendiente",
        variant: "outline",
        description: "Esperando acción del vendedor",
      }
    }

    // Default: Unknown status
    return {
      status: status || "unknown",
      priority: 99,
      label: status || "Procesando",
      variant: "outline",
      description: "Estado desconocido",
    }
  }

  function getStatusBadge(status: string, substatus?: string) {
    const shipmentStatus = getShipmentStatus({ status, substatus } as Shipment)

    return (
      <div className="flex flex-col gap-1">
        <Badge variant={shipmentStatus.variant} className="text-xs font-semibold">
          {shipmentStatus.label}
        </Badge>
        {substatus && substatus !== "null" && substatus !== status && (
          <Badge variant="outline" className="text-xs">
            {substatus}
          </Badge>
        )}
      </div>
    )
  }

  function getShippingModeBadge(mode?: string) {
    if (!mode) return null

    const modeConfig: Record<string, { label: string; color: string }> = {
      me1: { label: "ME1", color: "bg-blue-100 text-blue-800" },
      me2: { label: "ME2", color: "bg-green-100 text-green-800" },
      custom: { label: "Acordar", color: "bg-orange-100 text-orange-800" },
    }

    const config = modeConfig[mode.toLowerCase()] || { label: mode, color: "bg-gray-100 text-gray-800" }

    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    )
  }

  const totalPages = Math.ceil(paging.total / paging.limit)
  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  const printableShipments = shipments.filter((s) => s.status !== "pending" && s.status !== "cancelled")
  const allPrintableSelected = printableShipments.length > 0 && selectedShipments.size === printableShipments.length

  const handleSortChange = (key: string, direction: "asc" | "desc") => {
    setSortConfig({ key, direction })
  }

  const sortedShipments = [...shipments].sort((a, b) => {
    const { key, direction } = sortConfig
    const multiplier = direction === "asc" ? 1 : -1

    if (key === "date") {
      return multiplier * (new Date(a.date_created).getTime() - new Date(b.date_created).getTime())
    }
    if (key === "id") {
      return multiplier * (a.id - b.id)
    }
    if (key === "order") {
      return multiplier * (a.order_id - b.order_id)
    }
    if (key === "status") {
      return multiplier * a.status.localeCompare(b.status)
    }
    if (key === "receiver") {
      const nameA = a.receiver_address?.receiver_name || a.buyer?.nickname || ""
      const nameB = b.receiver_address?.receiver_name || b.buyer?.nickname || ""
      return multiplier * nameA.localeCompare(nameB)
    }

    return 0
  })

  const sortOptions = [
    { value: "date", label: "Fecha" },
    { value: "id", label: "ID Envío" },
    { value: "order", label: "Orden" },
    { value: "receiver", label: "Destinatario" },
    { value: "status", label: "Estado" },
  ]

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
        <AppSidebar />

        <main className="flex-1 p-6">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Envíos</h2>
              <p className="text-muted-foreground">
                {paging.total > 0
                  ? `${paging.total.toLocaleString()} envíos en total`
                  : "Gestiona tus envíos de Mercado Libre"}
                {selectedAccount !== "all" && mlAccounts.length > 0 && (
                  <span className="ml-2 text-sm">
                    • {mlAccounts.find((a) => a.id === selectedAccount)?.nickname || "Cuenta seleccionada"}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadShipments} disabled={loading} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </Button>
              <Button variant="outline" onClick={exportToCSV} disabled={shipments.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pending}</div>
                <p className="text-xs text-muted-foreground">Preparando envío</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Listos</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.ready_to_ship}</div>
                <p className="text-xs text-muted-foreground">Para enviar</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">En Tránsito</CardTitle>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.shipped}</div>
                <p className="text-xs text-muted-foreground">Enviados</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Entregados</CardTitle>
                <Badge variant="secondary" className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.delivered}</div>
                <p className="text-xs text-muted-foreground">Completados</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Label className="text-sm font-medium">Filtrar por cuenta:</Label>
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
                  {mlAccounts.length === 0 && (
                    <Button variant="outline" size="sm" asChild>
                      <a href="/integrations">Conectar Cuenta</a>
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <LastUpdated timestamp={lastUpdated} isLoading={loading} onRefresh={loadShipments} />
                  <MLConnectionStatus accountId={selectedAccount} onRefresh={loadShipments} refreshing={loading} />
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedShipments.size > 0 && (
            <Card className="mb-6 border-2 border-primary">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge variant="default" className="text-base px-3 py-1">
                      {selectedShipments.size} seleccionados
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => setSelectedShipments(new Set())}>
                      Limpiar selección
                    </Button>
                  </div>
                  <Button onClick={printBulkLabels} disabled={printingLabels} size="lg">
                    <Printer className="mr-2 h-5 w-5" />
                    Imprimir {selectedShipments.size} Etiquetas
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mb-6 border-2">
            <CardHeader className="bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Filtros</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
                  <Filter className="mr-2 h-4 w-4" />
                  {showFilters ? "Ocultar" : "Mostrar"}
                </Button>
              </div>
            </CardHeader>
            {showFilters && (
              <CardContent className="bg-muted/10">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Estado del Envío</Label>
                    <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendiente</SelectItem>
                        <SelectItem value="handling">Preparando</SelectItem>
                        <SelectItem value="ready_to_ship">Listo para Enviar</SelectItem>
                        <SelectItem value="shipped">Enviado</SelectItem>
                        <SelectItem value="delivered">Entregado</SelectItem>
                        <SelectItem value="not_delivered">No Entregado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Modo de Envío</Label>
                    <Select
                      value={filters.shipping_mode}
                      onValueChange={(v) => setFilters({ ...filters, shipping_mode: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="me1">Mercado Envíos 1</SelectItem>
                        <SelectItem value="me2">Mercado Envíos 2</SelectItem>
                        <SelectItem value="custom">Acordar Entrega</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Estado de Etiqueta</Label>
                    <Select
                      value={filters.label_status}
                      onValueChange={(v) => setFilters({ ...filters, label_status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="ready">Con Etiqueta</SelectItem>
                        <SelectItem value="pending">Etiqueta Pendiente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tracking</Label>
                    <Select
                      value={filters.has_tracking}
                      onValueChange={(v) => setFilters({ ...filters, has_tracking: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="yes">Con Tracking</SelectItem>
                        <SelectItem value="no">Sin Tracking</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Fecha Desde</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={filters.date_from}
                        onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Fecha Hasta</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={filters.date_to}
                        onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilters({
                        status: "all",
                        shipping_mode: "all",
                        date_from: "",
                        date_to: "",
                        label_status: "all",
                        has_tracking: "all",
                      })
                      setCurrentPage(1)
                    }}
                  >
                    Limpiar Filtros
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Shipments Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lista de Envíos</CardTitle>
                  <CardDescription>
                    {loading
                      ? "Cargando..."
                      : `Mostrando ${sortedShipments.length} envíos (Página ${currentPage} de ${totalPages})`}
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
                  Cargando envíos...
                </div>
              ) : sortedShipments.length === 0 ? (
                <div className="flex h-[400px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Truck className="h-12 w-12 opacity-20" />
                  <p>No hay envíos disponibles.</p>
                  <p className="text-xs">Los envíos aparecerán aquí cuando realices ventas.</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allPrintableSelected}
                            onCheckedChange={toggleAllShipments}
                            disabled={printableShipments.length === 0}
                          />
                        </TableHead>
                        <TableHead>ID Envío</TableHead>
                        <TableHead>Orden</TableHead>
                        <TableHead>Destinatario</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Modo</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedShipments.map((shipment) => {
                        const canPrint = shipment.status !== "pending" && shipment.status !== "cancelled"
                        const hasLabel = shipment.has_label || false
                        const receiverName =
                          shipment.receiver_address?.receiver_name || shipment.buyer?.nickname || "Sin información"
                        const cityName = shipment.receiver_address?.city?.name || ""
                        const stateName = shipment.receiver_address?.state?.name || ""
                        const dateCreated = shipment.date_created || shipment.last_updated
                        const isValidDate = dateCreated && !isNaN(new Date(dateCreated).getTime())
                        const labelPending =
                          !hasLabel && shipment.status !== "cancelled" && shipment.status !== "pending"

                        return (
                          <TableRow key={shipment.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedShipments.has(shipment.id)}
                                onCheckedChange={() => toggleShipmentSelection(shipment.id)}
                                disabled={!canPrint}
                              />
                            </TableCell>
                            <TableCell className="font-medium">#{shipment.id}</TableCell>
                            <TableCell>
                              <Badge variant="outline">#{shipment.order_id}</Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{receiverName}</div>
                                {(cityName || stateName) && (
                                  <div className="text-sm text-muted-foreground">
                                    {cityName}
                                    {stateName && `, ${stateName}`}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {shipment.tracking_number ? (
                                <span className="font-mono text-sm">{shipment.tracking_number}</span>
                              ) : (
                                <span className="text-sm text-muted-foreground">Sin tracking</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {getStatusBadge(shipment.status, shipment.substatus)}
                                {labelPending && (
                                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                                    Etiqueta Pendiente
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{getShippingModeBadge(shipment.shipping_mode)}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {isValidDate ? new Date(dateCreated).toLocaleDateString() : "N/A"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {isValidDate ? new Date(dateCreated).toLocaleTimeString() : ""}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => viewShipmentDetails(shipment)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant={labelPending ? "outline" : "ghost"}
                                  size="icon"
                                  onClick={() => printLabel(shipment.id)}
                                  disabled={!canPrint || printingLabels || labelPending}
                                  className={labelPending ? "opacity-50 cursor-not-allowed" : ""}
                                  title={labelPending ? "Etiqueta no disponible aún" : "Imprimir etiqueta"}
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>

                  {totalPages > 1 && (
                    <AdvancedPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      disabled={loading}
                      itemsPerPage={paging.limit}
                      totalItems={paging.total}
                      offset={paging.offset}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Shipment Details Dialog */}
      <Dialog open={showShipmentDetails} onOpenChange={setShowShipmentDetails}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Envío #{selectedShipment?.id}</DialogTitle>
            <DialogDescription>Información completa del envío y seguimiento</DialogDescription>
          </DialogHeader>

          {selectedShipment && (
            <div className="space-y-6">
              <ShipmentTrackingTimeline shipmentId={selectedShipment.id} initialStatus={selectedShipment.status} />

              <Separator />

              {/* Shipping Status */}
              <div>
                <h3 className="font-semibold mb-3">Estado del Envío</h3>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estado:</span>
                    {getStatusBadge(selectedShipment.status, selectedShipment.substatus)}
                  </div>
                  {selectedShipment.shipping_mode && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Modo:</span>
                      {getShippingModeBadge(selectedShipment.shipping_mode)}
                    </div>
                  )}
                  {selectedShipment.tracking_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tracking:</span>
                      <span className="font-mono font-medium">{selectedShipment.tracking_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Método:</span>
                    <span className="font-medium">{selectedShipment.shipping_option?.name || "N/A"}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Addresses */}
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Dirección de Origen
                  </h3>
                  {selectedShipment.sender_address ? (
                    <div className="text-sm space-y-1">
                      <p>{selectedShipment.sender_address.address_line}</p>
                      <p>
                        {selectedShipment.sender_address.city.name}, {selectedShipment.sender_address.state.name}
                      </p>
                      <p>CP: {selectedShipment.sender_address.zip_code}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No disponible</p>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Dirección de Destino
                  </h3>
                  {selectedShipment.receiver_address ? (
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{selectedShipment.receiver_address.receiver_name}</p>
                      <p>{selectedShipment.receiver_address.address_line}</p>
                      <p>
                        {selectedShipment.receiver_address.city.name}, {selectedShipment.receiver_address.state.name}
                      </p>
                      <p>CP: {selectedShipment.receiver_address.zip_code}</p>
                      {selectedShipment.receiver_address.receiver_phone && (
                        <p>Tel: {selectedShipment.receiver_address.receiver_phone}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No disponible</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Shipping Items */}
              {selectedShipment.items && selectedShipment.items.length > 0 && (
                <>
                  <div>
                    <h3 className="font-semibold mb-3">Items del Envío</h3>
                    <div className="space-y-2">
                      {selectedShipment.items.map((item, index) => (
                        <div key={index} className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <p className="font-medium">{item.item.title}</p>
                            <p className="text-sm text-muted-foreground">ID: {item.item.id}</p>
                          </div>
                          <Badge variant="outline">Cantidad: {item.quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Timeline */}
              <div>
                <h3 className="font-semibold mb-3">Historial</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Creado:</span>
                    <span className="font-medium">{new Date(selectedShipment.date_created).toLocaleString()}</span>
                  </div>
                  {selectedShipment.status_history.date_shipped && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Enviado:</span>
                      <span className="font-medium">
                        {new Date(selectedShipment.status_history.date_shipped).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {selectedShipment.status_history.date_delivered && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entregado:</span>
                      <span className="font-medium">
                        {new Date(selectedShipment.status_history.date_delivered).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Última Actualización:</span>
                    <span className="font-medium">{new Date(selectedShipment.last_updated).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setShowShipmentDetails(false)}>
                  Cerrar
                </Button>
                <Button
                  onClick={() => printLabel(selectedShipment.id)}
                  disabled={
                    selectedShipment.status === "pending" || selectedShipment.status === "cancelled" || printingLabels
                  }
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir Etiqueta
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
