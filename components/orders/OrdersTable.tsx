"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ColumnSelector } from "@/components/shared/column-selector"
import { AdvancedPagination } from "@/components/shared/advanced-pagination"
import { SortSelector } from "@/components/shared/sort-selector"
import { cn } from "@/lib/utils"
import {
  RefreshCw,
  Eye,
  Clock,
  Printer,
  Package,
  AlertCircle,
  ShoppingBag,
  Copy,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import type { Order, Column, SortConfig, PagingInfo } from "@/components/orders/types"
import {
  getOrderAvailabilityStatus,
  getCancellationSubtype,
  hasActiveClaim,
  hasHandlingTime,
  getRemainingDays,
  SORT_OPTIONS,
} from "@/components/orders/types"

const MLLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 0C10.745 0 0 10.745 0 24s10.745 24 24 24 24-10.745 24-24S37.255 0 24 0z" fill="#FFE600" />
    <path
      d="M35.5 18.5c0-1.933-1.567-3.5-3.5-3.5s-3.5 1.567-3.5 3.5v11c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-11zM24 12c-1.933 0-3.5 1.567-3.5 3.5v19c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-19c0-1.933-1.567-3.5-3.5-3.5zM16 18.5c0-1.933-1.567-3.5-3.5-3.5s9 16.567 9 18.5v11c0 1.933 1.567 3.5 3.5 3.5s3.5-1.567 3.5-3.5v-11z"
      fill="#2D3277"
    />
  </svg>
)

function getStatusBadge(status: string) {
  const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> =
    {
      paid: { variant: "default", label: "Pagado" },
      confirmed: { variant: "default", label: "Confirmado" },
      payment_required: { variant: "outline", label: "Pago Requerido" },
      payment_in_process: { variant: "outline", label: "Pago en Proceso" },
      cancelled: { variant: "destructive", label: "Cancelado" },
      invalid: { variant: "destructive", label: "Invalido" },
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
  Devolucion: { variant: "destructive", className: "bg-pink-100 text-pink-900 border-pink-300" },
  Cancelado: { variant: "secondary", className: "bg-gray-100 text-gray-900 border-gray-300" },
  "Pendiente de pago": { variant: "outline", className: "bg-amber-100 text-amber-900 border-amber-300" },
  Pendiente: { variant: "outline" },
}

interface OrdersTableProps {
  loading: boolean
  filteredOrders: Order[]
  paginatedOrders: Order[]
  searchQuery: string
  setSearchQuery: (v: string) => void
  visibleColumns: Column[]
  setVisibleColumns: (cols: Column[]) => void
  sortConfig: SortConfig
  handleSortChange: (key: string, direction: "asc" | "desc") => void
  selectedOrders: Set<number>
  toggleSelectAll: () => void
  toggleOrderSelection: (orderId: number) => void
  copiedOrderId: string | null
  copyOrderId: (id: string) => void
  copiedSku: string | null
  copySku: (sku: string) => void
  loadingSkus: Set<string>
  markingReceived: Set<string>
  showMarkReceivedConfirmation: (orderId: number, itemId: string) => void
  viewOrderDetails: (order: Order) => void
  openMLOrder: (order: any) => void
  fetchReturnDetails: (claimId: number) => void
  setSelectedReturnOrder: (order: Order | null) => void
  setShowReturnDialog: (v: boolean) => void
  fetchOrdersEffect: () => void
  // pagination
  currentPage: number
  setCurrentPage: (page: number) => void
  totalPages: number
  paging: PagingInfo
  totalOrders: number
  timeFilteredOrders: Order[]
  filters: { timeFilter: string }
}

export function OrdersTable({
  loading,
  filteredOrders,
  paginatedOrders,
  searchQuery,
  setSearchQuery,
  visibleColumns,
  setVisibleColumns,
  sortConfig,
  handleSortChange,
  selectedOrders,
  toggleSelectAll,
  toggleOrderSelection,
  copiedOrderId,
  copyOrderId,
  copiedSku,
  copySku,
  loadingSkus,
  markingReceived,
  showMarkReceivedConfirmation,
  viewOrderDetails,
  openMLOrder,
  fetchReturnDetails,
  setSelectedReturnOrder,
  setShowReturnDialog,
  fetchOrdersEffect,
  currentPage,
  setCurrentPage,
  totalPages,
  paging,
  totalOrders,
  timeFilteredOrders,
  filters,
}: OrdersTableProps) {
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
              title="Las ordenes de 'Acordar la entrega' se marcan automaticamente como entregadas despues de 28 dias"
            >
              <Clock className="mr-1 h-3 w-3" />
              Se marca automaticamente
            </Button>
            <span className="text-[9px] text-gray-500 text-center">(28 dias desde la compra)</span>
          </div>
        )

      case "Listo para enviar":
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
            Ver envio
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

      case "Con reclamo":
        return (
          <Button
            variant="destructive"
            size="sm"
            className="w-full h-7 text-[11px] bg-red-600 hover:bg-red-700 shadow-sm hover:shadow-md transition-all"
            onClick={() => viewOrderDetails(order)}
          >
            <AlertCircle className="mr-1 h-3 w-3" />
            Revisar reclamo
          </Button>
        )

      case "Devolucion":
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
            Ver devolucion
          </Button>
        )

      default:
        return null
    }
  }

  return (
    <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="bg-gradient-to-r from-muted/30 to-muted/10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Lista de Ordenes</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Cargando...
                </span>
              ) : (
                <>
                  Mostrando <span className="font-semibold text-foreground">{paginatedOrders.length}</span> de{" "}
                  <span className="font-semibold text-foreground">{filteredOrders.length}</span> ordenes
                  {searchQuery && " (filtradas por busqueda)"}
                  {filters.timeFilter !== "all" && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({timeFilteredOrders.length} en el periodo seleccionado)
                    </span>
                  )}
                </>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOrdersEffect()}
              disabled={loading}
              className="bg-transparent"
              title="Refrescar ordenes"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <SortSelector
              options={SORT_OPTIONS}
              value={sortConfig.key}
              direction={sortConfig.direction}
              onSortChange={handleSortChange}
            />
            <ColumnSelector columns={visibleColumns} onColumnsChange={setVisibleColumns} storageKey="orders-columns" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
              <p className="font-medium">Cargando ordenes...</p>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex h-[400px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <div className="rounded-full bg-muted p-4">
              <ShoppingBag className="h-12 w-12 opacity-30" />
            </div>
            {searchQuery ? (
              <>
                <p className="font-medium text-foreground">No se encontraron ordenes</p>
                <p className="text-xs">No hay ordenes que coincidan con tu busqueda</p>
                <Button variant="outline" size="sm" onClick={() => setSearchQuery("")} className="mt-2">
                  Limpiar busqueda
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">No hay ordenes disponibles</p>
                <p className="text-xs">Las ordenes apareceran aqui cuando realices ventas</p>
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
                          onClick={() => handleSortChange("order", sortConfig.direction === "asc" ? "desc" : "asc")}
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
                          onClick={() => handleSortChange("customer", sortConfig.direction === "asc" ? "desc" : "asc")}
                        >
                          Cliente
                          {renderSortIcon("customer")}
                        </Button>
                      </TableHead>
                    )}
                    {visibleColumns.find((c) => c.id === "products")?.enabled && <TableHead>Productos</TableHead>}
                    {visibleColumns.find((c) => c.id === "sku")?.enabled && <TableHead>SKU</TableHead>}
                    {visibleColumns.find((c) => c.id === "availability")?.enabled && <TableHead>Estado</TableHead>}
                    {visibleColumns.find((c) => c.id === "items")?.enabled && <TableHead>Items</TableHead>}
                    {visibleColumns.find((c) => c.id === "total")?.enabled && (
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3 h-8"
                          onClick={() => handleSortChange("total", sortConfig.direction === "asc" ? "desc" : "asc")}
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
                          onClick={() => handleSortChange("status", sortConfig.direction === "asc" ? "desc" : "asc")}
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
                          onClick={() => handleSortChange("date", sortConfig.direction === "asc" ? "desc" : "asc")}
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
                                  <div className="text-xs text-muted-foreground font-mono">ML: {order.pack_id}</div>
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
                                  <div className="truncate font-medium text-foreground">{item.item.title}</div>
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
                                  status === "Listo para enviar" && "border-cyan-500 bg-cyan-500/10 text-cyan-700",
                                  status === "Etiqueta impresa" && "border-teal-500 bg-teal-500/10 text-teal-700",
                                  status === "En punto de retiro" &&
                                    "border-indigo-500 bg-indigo-500/10 text-indigo-700",
                                  status === "Pendiente" && "border-yellow-500 bg-yellow-500/10 text-yellow-700",
                                  status === "Demorado" && "border-red-600 bg-red-600/10 text-red-800",
                                  status === "Con reclamo" && "border-pink-500 bg-pink-500/10 text-pink-700",
                                  status === "Devolucion" && "border-pink-500 bg-pink-500/10 text-pink-700",
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
                                      <span className="ml-1 font-semibold">{days <= 0 ? "!Vencido!" : `${days}d`}</span>
                                    )}
                                  </Badge>
                                )}

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
                totalItems={totalOrders}
                offset={paging.offset}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
